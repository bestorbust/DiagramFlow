"""Bounded provider failover. Credentials and provider error bodies are never logged."""
from __future__ import annotations
import logging
import os
from pathlib import Path
from typing import Any, Callable
from dotenv import load_dotenv

for path in (Path(__file__).resolve().parents[2] / '.env', Path(__file__).resolve().parents[1] / '.env'):
    load_dotenv(path, override=False)
logger = logging.getLogger('DiagramFlow.LLM')

class LLMUnavailableError(RuntimeError):
    """No configured provider produced a valid, complete response."""

SUPPORTED_OPENROUTER_MODELS = [
    "nvidia/nemotron-3-ultra-550b-a55b",   # Nemotron 3 Ultra
    "anthropic/claude-opus-5.5",            # Claude Opus 5.5
    "stealth/space-bunny-alpha",            # Space Bunny Alpha
    "minimax/minimax-m3.1-flash",           # MinMax M3.1 Flash
    "stepfun/step-5-preview",               # Step 5 Preview
    "openai/gpt-6-luna",                    # GPT-6 Luna
    "qwen/qwen3.8-flash",                   # Qwen3.8-Flash-Next
    "xiaomi/mimo-v2.6-flash",               # MiMo-V2-6-Flash
    "tencent/hy4-preview",                  # Hy4 Preview
    "z-ai/glm-5.3-flash",                   # GLM-5.3 Flash
    "deepseek/deepseek-v4.1-flash-1017",    # DeepSeek V4.1 Flash 1017
    "deepseek/deepseek-v4.1-flash",         # DeepSeek V4.1 Flash
]

class LLMFactory:
    def __init__(self):
        self.groq_api_key = os.getenv('GROQ_API_KEY', '').strip()
        self.openrouter_api_key = os.getenv('OPENROUTER_API_KEY', '').strip()
        self.gemini_api_key = os.getenv('GEMINI_API_KEY', '').strip()
        self.groq_model = os.getenv('GROQ_MODEL', '').strip() or 'openai/gpt-oss-120b'
        self.openrouter_model = os.getenv('OPENROUTER_MODEL', '').strip() or SUPPORTED_OPENROUTER_MODELS[0]
        self.gemini_model = os.getenv('GEMINI_MODEL', '').strip()
        self.provider_order = [p for p in ('openrouter', 'groq', 'gemini') if getattr(self, p + '_api_key')]
        preferred = os.getenv('LLM_PROVIDER', 'openrouter').strip().lower()
        if preferred in self.provider_order:
            self.provider_order.remove(preferred)
            self.provider_order.insert(0, preferred)
        self.current_idx = 0

    @property
    def current_provider(self):
        if not self.provider_order:
            raise LLMUnavailableError('No LLM API key configured. Set OPENROUTER_API_KEY or GROQ_API_KEY.')
        return self.provider_order[self.current_idx % len(self.provider_order)]

    def get_openrouter_models(self) -> list[str]:
        models_env = os.getenv('OPENROUTER_MODELS', '').strip()
        if models_env:
            return [m.strip() for m in models_env.split(',') if m.strip()]
        if ',' in self.openrouter_model:
            return [m.strip() for m in self.openrouter_model.split(',') if m.strip()]
        if self.openrouter_model and self.openrouter_model != 'openrouter/auto':
            return [self.openrouter_model] + [m for m in SUPPORTED_OPENROUTER_MODELS if m != self.openrouter_model]
        return list(SUPPORTED_OPENROUTER_MODELS)

    def create_chat_model(self, temperature=0.0, provider=None, **kwargs):
        provider = provider or self.current_provider
        model = kwargs.get('model')
        common = dict(temperature=temperature, timeout=float(os.getenv('LLM_TIMEOUT_SECONDS', '45')),
                      max_retries=0, max_tokens=int(os.getenv('LLM_MAX_OUTPUT_TOKENS', '12000')))
        if provider == 'groq':
            from langchain_groq import ChatGroq
            return ChatGroq(api_key=self.groq_api_key, model=model or self.groq_model, **common)
        from langchain_openai import ChatOpenAI
        if provider == 'openrouter':
            selected_model = model or self.get_openrouter_models()[0]
            return ChatOpenAI(api_key=self.openrouter_api_key, model=selected_model,
                              base_url='https://openrouter.ai/api/v1', **common)
        if provider == 'gemini' and (model or self.gemini_model):
            return ChatOpenAI(api_key=self.gemini_api_key, model=model or self.gemini_model,
                              base_url='https://generativelanguage.googleapis.com/v1beta/openai/', **common)
        raise ValueError('Unsupported or unconfigured LLM provider/model.')

    def invoke_with_failover(self, messages: Any, temperature=0.0, max_retries=3,
                             validator: Callable | None = None):
        if not self.provider_order:
            raise LLMUnavailableError('No LLM API key configured. Set GROQ_API_KEY or OPENROUTER_API_KEY.')
        failures = []
        for provider in self.provider_order[:max(1, max_retries)]:
            if provider == 'openrouter':
                # Try candidate OpenRouter models in order
                models_to_try = self.get_openrouter_models()
                for model_candidate in models_to_try:
                    try:
                        try:
                            chat_model = self.create_chat_model(temperature, provider='openrouter', model=model_candidate)
                        except TypeError:
                            chat_model = self.create_chat_model(temperature, provider='openrouter')
                        response = chat_model.invoke(messages)
                        metadata = getattr(response, 'response_metadata', {}) or {}
                        if metadata.get('finish_reason') in ('length', 'max_tokens'):
                            raise ValueError('Truncated model output')
                        if not isinstance(response.content, str) or not response.content.strip():
                            raise ValueError('Empty or unsupported model output')
                        if validator is not None:
                            validator(response.content)
                        response.response_metadata = {**metadata, 'provider': 'openrouter', 'model': model_candidate}
                        return response
                    except Exception as exc:
                        status = getattr(exc, 'status_code', None)
                        failure = f'openrouter ({model_candidate}): {type(exc).__name__}' + (f' (HTTP {status})' if status else '')
                        failures.append(failure)
                        logger.warning('LLM attempt failed: %s', failure)
                        if isinstance(exc, TypeError) and 'create_chat_model' in str(exc):
                            break
                        continue
            else:
                try:
                    response = self.create_chat_model(temperature, provider=provider).invoke(messages)
                    metadata = getattr(response, 'response_metadata', {}) or {}
                    if metadata.get('finish_reason') in ('length', 'max_tokens'):
                        raise ValueError('Truncated model output')
                    if not isinstance(response.content, str) or not response.content.strip():
                        raise ValueError('Empty or unsupported model output')
                    if validator is not None:
                        validator(response.content)
                    response.response_metadata = {**metadata, 'provider': provider}
                    return response
                except Exception as exc:
                    status = getattr(exc, 'status_code', None)
                    failure = f'{provider}: {type(exc).__name__}' + (f' (HTTP {status})' if status else '')
                    failures.append(failure)
                    logger.warning('LLM attempt failed: %s', failure)
        raise LLMUnavailableError('No provider produced a valid response. ' + '; '.join(failures))

_factory = LLMFactory()

def get_llm(temperature=0.0):
    return _factory.create_chat_model(temperature)

def invoke_llm(messages, temperature=0.0, validator=None):
    return _factory.invoke_with_failover(messages, temperature=temperature, validator=validator)
