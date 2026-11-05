# DiagramFlow LLM: Architecture Discrepancy & Synthesis Engine

> **Stateful LangGraph workflow** that ingests FOCV visual graphs and requirements documents, conducts deep discrepancy audits, synthesizes corrected Mermaid architecture diagrams, and powers a **strictly grounded, anti-hallucination RAG chatbot**.

---

## 1. Features & Architecture

1. **Stateful LangGraph Workflow (`llm/graph/`)**:
   - `parse_requirements`: Extracts functional entities, communication flows, protocols, and security zones from specifications.
   - `diff_audit`: Cross-references visual FOCV extraction against specifications to identify missing components, unexpected zombie nodes, misdirected flows, protocol mismatches, and single point of failure (SPOF) risks.
   - `synthesize_architecture`: Generates corrected, production-ready Mermaid.js diagrams and target JSON graphs resolving all discrepancies.
   - `index_knowledge`: Chunks all findings, visual evidence bounding boxes, and requirements clauses into structured knowledge units.

2. **Multi-Provider Failover & Rate-Limit Circuit Breaker (`llm/providers/`)**:
   - **Primary: OpenRouter Gateway** prioritized over Groq and Gemini.
   - **Supported Frontier Models on OpenRouter** (with automatic edge-gateway failover via the `models` list):
     1. **Nemotron 3 Ultra** (`nvidia/nemotron-3-ultra-550b-a55b`)
     2. **Claude Opus 5.5** (`anthropic/claude-opus-5.5`)
     3. **Space Bunny Alpha** (`stealth/space-bunny-alpha`)
     4. **MinMax M3.1 Flash** (`minimax/minimax-m3.1-flash`)
     5. **Step 5 Preview** (`stepfun/step-5-preview`)
     6. **GPT-6 Luna** (`openai/gpt-6-luna`)
     7. **Qwen3.8-Flash-Next** (`qwen/qwen3.8-flash`)
     8. **MiMo-V2-6-Flash** (`xiaomi/mimo-v2.6-flash`)
     9. **Hy4 Preview** (`tencent/hy4-preview`)
     10. **GLM-5.3 Flash** (`z-ai/glm-5.3-flash`)
     11. **DeepSeek V4.1 Flash 1017** (`deepseek/deepseek-v4.1-flash-1017`)
     12. **DeepSeek V4.1 Flash** (`deepseek/deepseek-v4.1-flash`)
   - **Secondary Fallback**: **Groq** (`openai/gpt-oss-120b`).
   - **Tertiary Fallback**: **Google Gemini** (`gemini-2.0-flash`).
   - Automatically catches `429 Rate Limit`, quota exhaustion, or gateway timeouts and failovers seamlessly across models and providers.

3. **Strict Grounded RAG Chatbot (`llm/rag/`)**:
   - In-memory hybrid retrieval engine over visual evidence, audit findings, and requirements clauses.
   - **Strict Anti-Hallucination Guardrail**: Refuses to speculate if visual or documentary evidence is absent:
     > *"Based on the visual diagram and requirements provided, there is no evidence or mention of '<subject>'. I cannot answer with certainty without further specification."*

4. **Centralized Prompts (`llm/prompts/`)**:
   - All prompt templates reside in `llm/prompts/` as standalone, modifiable templates:
     - `parse_requirements.txt`
     - `diff_audit.txt`
     - `synthesize_mermaid.txt`
     - `rag_chat_system.txt`

---

## 2. Directory Structure

```
llm/
├── .env                              # LLM API keys (Groq, OpenRouter, Gemini)
├── prompts/                          # Centralized prompt templates
│   ├── parse_requirements.txt
│   ├── diff_audit.txt
│   ├── synthesize_mermaid.txt
│   └── rag_chat_system.txt
├── providers/
│   ├── __init__.py
│   └── llm_factory.py               # Multi-provider router with 429 auto-failover
├── graph/
│   ├── __init__.py
│   ├── state.py                     # LangGraph TypedDict state
│   ├── nodes.py                     # Requirements parsing, Diff audit, Synthesis, Indexing
│   └── workflow.py                  # StateGraph assembly & compilation
├── rag/
│   ├── __init__.py
│   ├── retriever.py                 # Hybrid knowledge retriever with thresholding
│   └── chatbot.py                   # Guardrailed conversational chatbot
├── sample_requirements/              # Example architecture specification files
│   └── sample_req_diagram6.md
├── audit_reports/                   # Generated reports, Mermaid diagrams, JSON diffs
├── run_audit.py                     # CLI tool to run discrepancy audit & synthesis
├── chat_cli.py                      # Interactive terminal RAG chatbot
└── README.md
```

---

## 3. Quickstart & Execution

### Run Discrepancy Audit & Architecture Synthesis
```bash
python llm/run_audit.py -a cv/outputs/diagram6_architecture.json -r llm/sample_requirements/sample_req_diagram6.md -o llm/audit_reports
```

Generated outputs in `llm/audit_reports/`:
- `<diagram>_audit_report.md`: Formatted executive audit report.
- `<diagram>_discrepancy_audit.json`: Structured discrepancy findings.
- `<diagram>_synthesized.mmd`: Corrected Mermaid.js diagram code.
- `<diagram>_synthesized.json`: Target corrected architecture graph.

### Run Grounded RAG Chatbot CLI
```bash
python llm/chat_cli.py -a cv/outputs/diagram6_architecture.json -r llm/sample_requirements/sample_req_diagram6.md
```

