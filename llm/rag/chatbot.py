"""Evidence-selection RAG: every displayed claim is a verified source quotation."""
from __future__ import annotations
import json
from llm.providers.llm_factory import invoke_llm, LLMUnavailableError
from llm.graph.grounding import clean_json
from .retriever import ArchitectureRetriever

class ArchitectureChatbot:
    def __init__(self,knowledge_chunks,system_name='System'):
        self.retriever=ArchitectureRetriever(knowledge_chunks)
        self.system_name=system_name
        self.history=[]
        self.last_citations=[]

    def ask(self,user_query):
        query=user_query.strip()
        if not query:
            raise ValueError('Enter an architecture question.')
        matched=self.retriever.retrieve(query,top_k=8,min_score=0.8)
        # Resolve pronouns using the preceding user question without trusting previous generated answers.
        if not matched and any(w in query.lower().split() for w in ('it','that','those','they','them')):
            prior=[m['content'] for m in self.history[-4:] if m.get('role')=='user']
            if prior:
                matched=self.retriever.retrieve(prior[-1]+' '+query,top_k=8,min_score=0.8)
        refusal=f'Based on the diagram and requirements for {self.system_name}, there is insufficient evidence to answer this question. I cannot confirm details that are not documented.'
        self.last_citations=[]
        if not matched:
            return self._remember(query,refusal)
        evidence={c['id']:c for c,_ in matched}
        system = (
            'You are the DiagramFlow Architecture Expert Agent. Answer the user\'s question in a natural, friendly, and comprehensive architectural response based strictly on the provided evidence.\n'
            'Distinguish detected visual diagram facts, stated requirements, proposed targets, and visual uncertainties.\n'
            'If the evidence cannot answer the question or has no relevant information, return {"answerable": false, "citations": []}.\n'
            'Otherwise, return a JSON object with:\n'
            '  "answerable": true,\n'
            '  "explanation": "A clear, natural, and comprehensive explanation answering the user\'s question directly in plain English, explaining reasons and referencing citations like [E0001] inline.",\n'
            '  "citations": [{"id": "E0001", "quote": "exact quotation from that evidence text"}]\n'
            'Rules:\n'
            '- Provide up to 4 concise, verbatim quotations from the evidence in the citations array.\n'
            '- Do not invent undocumented components, protocols, or details.'
        )
        payload = json.dumps([{'id': k, 'title': v['title'], 'text': v['text']} for k,v in evidence.items()], ensure_ascii=False)
        messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': 'Evidence:\n' + payload + '\nQuestion:\n' + query}]
        def _norm_text(s: str) -> str:
            import re
            return ' '.join(re.sub(r'[^\w\s]', ' ', s.lower()).split())

        def _robust_parse_json(raw: str) -> dict:
            import re
            try:
                return clean_json(raw)
            except Exception:
                match = re.search(r'\{[\s\S]*\}', raw)
                if match:
                    return clean_json(match.group(0))
                raise

        def validate(text):
            data = _robust_parse_json(text)
            if not isinstance(data.get('answerable'), bool) or not isinstance(data.get('citations'), list):
                raise ValueError('Invalid evidence-selection response')
            if data['answerable'] and not data['citations']:
                raise ValueError('Answer missing citations')
            if len(data['citations']) > 4:
                raise ValueError('Too many citations')
            valid_citations = []
            for item in data['citations']:
                cid = item.get('id')
                quote = item.get('quote', '').strip()
                if cid not in evidence or not isinstance(quote, str) or len(quote) < 4:
                    continue
                orig_text = evidence[cid]['text']
                if quote in orig_text or _norm_text(quote) in _norm_text(orig_text):
                    valid_citations.append(item)
                else:
                    # Best effort match for partial quote
                    words = quote.split()
                    if len(words) >= 3 and ' '.join(words[:3]).lower() in orig_text.lower():
                        valid_citations.append(item)
            if data['answerable'] and not valid_citations:
                raise ValueError('Unknown citation or unsupported quotation')
            data['citations'] = valid_citations
            return data
        try:
            response = invoke_llm(messages, temperature=0.0, validator=validate)
            selection = validate(response.content)
        except Exception:
            # Fallback: if model invocation fails, format a user-friendly response from matched evidence
            if matched:
                self.last_citations = []
                lines = []
                summaries = []
                for chunk, score in matched[:4]:
                    self.last_citations.append({'id': chunk['id'], 'title': chunk['title'], 'type': chunk['type'], 'quote': chunk['text']})
                    lines.append(f"- {chunk['text']} [{chunk['id']}: {chunk['title']}]")
                    summaries.append(f"- **{chunk['title']}** (`{chunk['type']}`): {chunk['text']}")
                friendly_summary = (
                    f"Based on the audit evidence for {self.system_name}, here is what was found regarding your question:\n\n"
                    + "\n".join(summaries)
                )
                formatted = f"{friendly_summary}\n\n### Audit Evidence:\n" + "\n".join(lines)
                return self._remember(query, formatted)
            raise
        if not selection['answerable']:
            return self._remember(query, refusal)
        lines = []
        for item in selection['citations']:
            c = evidence[item['id']]
            self.last_citations.append({'id': item['id'], 'title': c['title'], 'type': c['type'], 'quote': item['quote']})
            lines.append(f"- {item['quote']} [{item['id']}: {c['title']}]")

        explanation = (selection.get('explanation') or selection.get('summary') or '').strip()
        if explanation:
            formatted = f"{explanation}\n\n### Audit Evidence:\n" + "\n".join(lines)
        else:
            formatted = "Evidence from this audit:\n\n" + "\n".join(lines)
        return self._remember(query, formatted)

    def _remember(self,query,answer):
        self.history.extend([{'role':'user','content':query},{'role':'assistant','content':answer}])
        self.history=self.history[-20:]
        return answer

    def clear_history(self):
        self.history.clear()
        self.last_citations=[]
