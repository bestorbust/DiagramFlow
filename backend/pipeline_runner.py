"""Run classical CV, validated requirements auditing and evidence indexing."""
from __future__ import annotations
import os
import time
import uuid
import copy
import hashlib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from cv.src.pipeline import FOCVPipeline
from llm.graph.workflow import build_architecture_graph
from llm.graph.nodes import (
    parse_requirements_node,
    diff_audit_node,
    synthesize_architecture_node,
    index_knowledge_node
)

WORKSPACE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(os.environ.get('DIAGRAMFLOW_STATIC_DIR', str(WORKSPACE_DIR / 'backend' / 'static')))
for directory in ('uploads', 'overlays', 'artifacts'):
    (STATIC_DIR / directory).mkdir(parents=True, exist_ok=True)


def trace(number, name, why, summary, status='completed'):
    return {
        'stage_id': f'STAGE_{number}', 'stage_number': number, 'stage_name': name,
        'status': status, 'why': why, 'why_plain_english': why, 'why_technical': why,
        'how_analyzed_diagram': 'See measured outputs below.',
        'how_analyzed_requirements': 'Requirements are parsed at stage 5 and compared at stage 6.',
        'step_by_step_breakdown': [], 'key_findings': summary.get('finding', name),
        'output_summary': summary,
    }


class FullAuditRunner:
    def __init__(self):
        self.llm_graph = build_architecture_graph()
        self._cache = {}

    def run(self, image_path: str, requirements_text: str, diagram_name: str = 'diagram'):
        if not requirements_text.strip():
            raise ValueError('Non-empty requirements are required for an audit.')
        started = time.monotonic()

        # Check in-memory result cache
        cache_key = None
        try:
            with open(image_path, 'rb') as f:
                img_hash = hashlib.sha256(f.read()).hexdigest()
            req_hash = hashlib.sha256(requirements_text.strip().encode('utf-8')).hexdigest()
            cache_key = f"{img_hash}_{req_hash}"
            if cache_key in self._cache:
                cached = copy.deepcopy(self._cache[cache_key])
                cached['processing_stats']['cached'] = True
                cached['processing_stats']['total_elapsed_seconds'] = round(time.monotonic() - started, 3)
                return cached
        except Exception:
            cache_key = None

        # Execute CV pipeline and LLM requirements parsing concurrently
        with ThreadPoolExecutor(max_workers=2) as executor:
            cv_future = executor.submit(FOCVPipeline().process_image, image_path)
            req_future = executor.submit(parse_requirements_node, {'requirements_text': requirements_text})

            cv_result = cv_future.result()
            parsed_req_state = req_future.result()

        arch = cv_result.architecture_graph
        evidence = cv_result.visual_evidence_graph
        stats = cv_result.processing_stats
        components = arch.get('components', [])
        if not components:
            raise ValueError('No architecture components were detected. Use a sharper diagram with readable component boundaries and labels.')
        artifact_id = uuid.uuid4().hex
        paths = cv_result.save(str(STATIC_DIR / 'artifacts'), artifact_id)
        overlay_url = f"/static/artifacts/{Path(paths['overlay_image']).name}"
        detections = evidence.get('detections', {})
        warnings = [u.get('detail', str(u)) for u in evidence.get('uncertainties', [])]
        warnings.extend(str(w) for w in stats.get('warnings', []))
        unlabeled = [c for c in components if not c.get('label') or c.get('label', '').lower().startswith('unknown')]
        if unlabeled:
            warnings.append(f'{len(unlabeled)} components have no reliable OCR label.')
        if len(components) > 1 and not arch.get('relationships'):
            warnings.append('No relationships were resolved; absence of a detected line does not establish absence in the diagram.')
        traces = [
            trace(1, 'Image normalization', 'Normalize canvas polarity before extracting strokes and text.', {
                'dimensions': arch.get('diagram_metadata', {}).get('dimensions', {}),
                'is_dark_background': stats.get('is_dark_background'),
            }),
            trace(2, 'Component and container detection', 'Find visible component boundaries and nested containers.', {
                'detected_components': len(components), 'detected_groups': len(arch.get('groups', [])),
                'components': components,
            }),
            trace(3, 'OCR and label association', 'Associate recognized text with visible components without using requirements to invent labels.', {
                'ocr_word_count': len(detections.get('ocr_tokens', [])),
                'sample_labels': [c.get('label', '') for c in components], 'unlabeled_components': len(unlabeled),
            }),
            trace(4, 'Connector tracing and direction', 'Trace visible connector paths; report uncertain directions and unresolved paths for review.', {
                'connectors_traced': len(arch.get('relationships', [])), 'connector_details': arch.get('relationships', []),
                'uncertainties': evidence.get('uncertainties', []), 'cv_elapsed_seconds': round(time.monotonic() - started, 3),
            }, 'needs_review' if warnings else 'completed'),
        ]

        # Execute deterministic graph comparison, synthesis, and indexing
        merged_state = {
            'diagram_name': diagram_name,
            'architecture_graph': arch,
            'visual_evidence_graph': evidence,
            'requirements_text': requirements_text,
            'parsed_requirements': parsed_req_state.get('parsed_requirements', {})
        }
        diff_state = diff_audit_node(merged_state)
        merged_state.update(diff_state)
        synth_state = synthesize_architecture_node(merged_state)
        merged_state.update(synth_state)
        index_state = index_knowledge_node(merged_state)
        merged_state.update(index_state)

        result = merged_state
        if result.get('error'):
            raise RuntimeError('The LLM workflow failed to complete.')
        required = ('parsed_requirements', 'discrepancy_report', 'synthesized_architecture', 'knowledge_chunks')
        if any(key not in result for key in required):
            raise RuntimeError('The audit workflow returned incomplete stage outputs.')
        parsed, report, synth, chunks = (result[key] for key in required)
        target = synth.get('synthesized_architecture', synth)
        mermaid = target.get('mermaid_code', '')
        if not mermaid.strip() or not chunks:
            raise RuntimeError('Synthesis or evidence indexing did not produce an output.')
        summary = report.get('audit_summary', {})
        notes = report.get('review_notes', [])
        warnings.extend(n if isinstance(n, str) else str(n) for n in notes)
        warnings = list(dict.fromkeys(warnings))
        needs_review = bool(warnings or report.get('discrepancies') or summary.get('status') == 'review_required')
        traces.extend([
            trace(5, 'Requirements extraction', 'Extract components, flows and zones with source evidence; reject malformed model output.', {
                'parsed_components': len(parsed.get('components', [])), 'parsed_flows': len(parsed.get('flows', [])),
                'parsed_zones': len(parsed.get('zones_and_groups', [])), 'extraction_metadata': parsed.get('extraction_metadata', {}),
            }),
            trace(6, 'Evidence-based architecture comparison', 'Compare observed graph facts to the extracted specification. Missing detections require review.', {
                **summary, 'discrepancy_count': len(report.get('discrepancies', [])), 'review_notes': notes,
            }, 'needs_review' if needs_review else 'completed'),
            trace(7, 'Target graph and Mermaid synthesis', 'Render a proposed graph from observed components and explicit requirements; it is a remediation proposal.', {
                'mermaid_code': mermaid, 'remediation_summary': target.get('remediation_summary', []),
            }),
            trace(8, 'Searchable evidence indexing', 'Index source requirements, observed graph facts and proposed changes with separate citations for chat retrieval.', {
                'indexed_chunks': len(chunks), 'sample_chunk_titles': [c.get('title') for c in chunks[:6]],
            }),
        ])
        from llm.graph.grounding import synthesize_from_requirements_only
        req_only_synth = synthesize_from_requirements_only(parsed)
        req_only_mermaid = req_only_synth.get('mermaid_code', '')
        (STATIC_DIR / 'artifacts' / f'{artifact_id}_target.mmd').write_text(mermaid, encoding='utf-8')
        (STATIC_DIR / 'artifacts' / f'{artifact_id}_requirements_spec.mmd').write_text(req_only_mermaid, encoding='utf-8')

        synth['requirements_only_mermaid'] = req_only_mermaid
        synth['requirements_only_architecture'] = req_only_synth

        output = {
            'diagram_name': diagram_name, 'overlay_url': overlay_url,
            'architecture_graph': arch, 'visual_evidence_graph': evidence,
            'parsed_requirements': parsed, 'discrepancy_report': report,
            'synthesized_architecture': synth, 'mermaid_code': mermaid,
            'requirements_only_architecture': req_only_synth,
            'requirements_only_mermaid': req_only_mermaid,
            'knowledge_chunks': chunks, 'transparency_traces': traces,
            'alignment_score': summary.get('alignment_score_percentage'),
            'executive_verdict': summary.get('executive_verdict', 'Review required'),
            'status': 'needs_review' if needs_review else 'completed', 'warnings': warnings,
            'processing_stats': {**stats, 'total_elapsed_seconds': round(time.monotonic() - started, 3)},
        }
        if cache_key:
            if len(self._cache) > 50:
                self._cache.pop(next(iter(self._cache)))
            self._cache[cache_key] = copy.deepcopy(output)
        return output


runner = FullAuditRunner()
