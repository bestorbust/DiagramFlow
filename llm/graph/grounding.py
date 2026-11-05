"""Validated requirements and deterministic comparison of observed graph facts."""
from __future__ import annotations
import copy
import json
import re
import unicodedata
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal


def norm(value):
    return re.sub(r'[^\w]+', ' ', unicodedata.normalize('NFKC', str(value)).lower()).strip()


def compact(value):
    return ''.join(norm(value).split())


def clean_json(text):
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text)
        text = re.sub(r'\s*```$', '', text)
    data = json.loads(text)
    if not isinstance(data, dict):
        raise ValueError('Expected a JSON object')
    return data


class Entity(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    aliases: list[str] = Field(default_factory=list)
    role: str = 'Unspecified'
    zone: str = 'Unspecified'
    description: str = ''
    source_quote: str = Field(min_length=1)
    basis: Literal['explicit', 'inferred', 'recommendation'] = 'explicit'


class Flow(BaseModel):
    model_config = ConfigDict(extra='ignore')
    source: str
    target: str
    direction: Literal['forward', 'bidirectional', 'undirected'] = 'forward'
    protocol: str = ''
    purpose: str = ''
    source_quote: str = Field(min_length=1)
    basis: Literal['explicit', 'inferred', 'recommendation'] = 'explicit'


class Zone(BaseModel):
    model_config = ConfigDict(extra='ignore')
    id: str
    name: str
    type: str = 'Group'
    contains_components: list[str] = Field(default_factory=list)
    source_quote: str = Field(min_length=1)
    basis: Literal['explicit', 'inferred', 'recommendation'] = 'explicit'


class Requirements(BaseModel):
    model_config = ConfigDict(extra='ignore')
    system_name: str = 'System architecture'
    components: list[Entity]
    flows: list[Flow]
    forbidden_flows: list[Flow] = Field(default_factory=list)
    zones_and_groups: list[Zone] = Field(default_factory=list)
    architectural_constraints: list[str] = Field(default_factory=list)


def validate_requirements(data, source):
    req = Requirements.model_validate(data).model_dump()
    source_normal = ' '.join(source.split())
    identifiers = [c['id'] for c in req['components']]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError('Duplicate requirement component IDs')
    ids = set(identifiers)
    for item in req['components'] + req['flows'] + req['forbidden_flows'] + req['zones_and_groups']:
        quote = ' '.join(item['source_quote'].split())
        if quote not in source_normal:
            raise ValueError('Requirements extraction contains an unsupported source quote')
    for c in req['components']:
        # Names may be normalized, but aliases cannot invent identity equivalence.
        c['aliases'] = [a for a in c['aliases'] if norm(a) and norm(a) in norm(source)]
        if not any(compact(n) in compact(source) for n in [c['label']] + c['aliases']):
            raise ValueError('Requirements extraction contains an unsupported component name')
    for f in req['flows'] + req['forbidden_flows']:
        if f['source'] not in ids or f['target'] not in ids:
            raise ValueError('Requirements flow references an unknown component')
    for g in req['zones_and_groups']:
        if not set(g['contains_components']) <= ids:
            raise ValueError('Requirements group references an unknown component')
    return req


def names(component):
    values = [component.get('label', ''), *component.get('aliases', [])]
    result = {compact(v) for v in values if compact(v)}
    # Conventional optional service suffix, not arbitrary substring matching.
    for name in list(result):
        if name.endswith('service') and len(name) > 9:
            result.add(name[:-7])
    return result


def match_entities(arch, req):
    matches, ambiguous = {}, []
    used = set()
    for required in req.get('components', []):
        candidates = [c for c in arch.get('components', []) if names(c) & names(required)]
        if len(candidates) == 1 and candidates[0]['id'] not in used:
            matches[required['id']] = candidates[0]['id']
            used.add(candidates[0]['id'])
        elif candidates:
            ambiguous.append(required['id'])
    return matches, ambiguous


def edge_direction(edge):
    d = edge.get('direction', 'undirected').lower()
    return {'directed': 'forward', 'unknown': 'undirected', 'both': 'bidirectional'}.get(d, d)


def permits(edge, source, target):
    d = edge_direction(edge)
    if d == 'bidirectional':
        return {edge['source'], edge['target']} == {source, target}
    if d == 'forward':
        return (edge['source'], edge['target']) == (source, target)
    if d == 'backward':
        return (edge['target'], edge['source']) == (source, target)
    return False


def audit_graph(arch, req, evidence=None):
    matches, ambiguous = match_entities(arch, req)
    discrepancies, notes = [], []
    byid = {c['id']: c for c in arch.get('components', [])}
    labels = {c['id']: c['label'] for c in req.get('components', [])}
    edges = [e for e in arch.get('relationships', []) if e.get('source') in byid and e.get('target') in byid]
    checked, verified = 0, 0

    def issue(category, severity, title, description, affected, quote, visual, recommendation):
        discrepancies.append(dict(id=f'DISC-{len(discrepancies)+1:03}', category=category, severity=severity,
            title=title, description=description, affected_elements=affected, requirements_clause=quote,
            visual_evidence=visual, recommendation=recommendation))

    for c in req.get('components', []):
        if c.get('basis', 'explicit') != 'explicit':
            notes.append(f"{c['label']}: {c['basis']} requirement needs confirmation.")
            continue
        checked += 1
        if c['id'] in matches:
            verified += 1
        else:
            issue('MISSING_COMPONENT', 'MEDIUM', f"Required component not confirmed: {c['label']}",
                  'The CV graph does not uniquely identify this required component. Detection or OCR may have missed it; inspect the overlay before changing the architecture.',
                  [c['id']], c.get('source_quote', ''), 'No unique matching visual component detected',
                  'Confirm the component in the source diagram; add it to the target only if required.')
    if ambiguous:
        notes.append('Ambiguous component identities: ' + ', '.join(ambiguous))
    for flow in req.get('flows', []):
        if flow.get('basis', 'explicit') != 'explicit':
            notes.append(f"Flow {flow['source']} -> {flow['target']} is {flow['basis']} and needs confirmation.")
            continue
        checked += 1
        s, t = matches.get(flow['source']), matches.get(flow['target'])
        title = f"{labels[flow['source']]} -> {labels[flow['target']]}"
        candidates = [e for e in edges if {e['source'], e['target']} == {s, t}] if s and t else []
        if flow.get('direction') == 'undirected':
            good = candidates
        elif flow.get('direction') == 'bidirectional':
            good = candidates if any(permits(e,s,t) for e in candidates) and any(permits(e,t,s) for e in candidates) else []
        else:
            good = [e for e in candidates if permits(e,s,t)]
        if good:
            verified += 1
            protocol = flow.get('protocol', '').strip()
            if protocol and norm(protocol) not in ('unspecified', 'unknown'):
                observed = [e.get('protocol') or e.get('label', '') for e in good]
                if not any(observed):
                    notes.append(f'{title}: required protocol {protocol} is not visible in the detected edge label.')
                elif all(compact(protocol) != compact(x) for x in observed):
                    issue('PROTOCOL_MISMATCH', 'MEDIUM', f'Protocol needs review: {title}',
                          'Detected edge text differs from the required protocol; OCR labels may include additional descriptions.',
                          [s,t], flow.get('source_quote',''), '; '.join(observed), f'Confirm protocol {protocol} on the connection.')
        else:
            unknown = any(edge_direction(e) == 'undirected' for e in candidates)
            reversed_only = bool(candidates) and not unknown
            category = 'MISDIRECTED_FLOW' if reversed_only else 'MISSING_FLOW'
            visual = 'Direction is unresolved in the detected connector' if unknown else ('Detected reverse or incomplete directional connection' if reversed_only else 'Required connection not detected')
            issue(category, 'HIGH' if reversed_only else 'MEDIUM', f'Required flow not confirmed: {title}',
                  visual + '. This is an observation from CV, not proof that the original diagram omits the flow.',
                  [flow['source'],flow['target']], flow.get('source_quote',''), visual,
                  'Inspect the connector and ensure the target graph contains the required direction.')
    for flow in req.get('forbidden_flows', []):
        if flow.get('basis', 'explicit') != 'explicit':
            notes.append(f"Prohibition {flow['source']} -> {flow['target']} is {flow['basis']} and needs confirmation.")
            continue
        s,t = matches.get(flow['source']), matches.get(flow['target'])
        found = [e for e in edges if s and t and permits(e,s,t)]
        checked += 1
        # Non-detection is not proof of absence, so no verified credit here.
        if found:
            issue('SECURITY_VIOLATION','HIGH',f"Forbidden flow detected: {labels[flow['source']]} -> {labels[flow['target']]}",
                  'An observed connector matches an explicitly prohibited flow. Confirm CV evidence before remediation.',
                  [s,t],flow.get('source_quote',''),str([e.get('id') for e in found]),'Remove the prohibited target connection.')
        else:
            notes.append('No forbidden flow detected; absence cannot be certified from CV extraction.')
    for group in req.get('zones_and_groups', []):
        if group.get('basis', 'explicit') != 'explicit':
            notes.append(f"Zone {group['name']} is {group['basis']} and needs confirmation.")
            continue
        checked += 1
        found = [g for g in arch.get('groups', []) if compact(g.get('label','')) == compact(group['name'])]
        contained = set().union(*(set(g.get('enclosed_components', [])) for g in found)) if found else set()
        required = [matches.get(x) for x in group['contains_components']]
        if found and all(x and x in contained for x in required):
            verified += 1
        else:
            issue('ZONE_NOT_CONFIRMED','MEDIUM',f"Required zone not confirmed: {group['name']}",
                  'The detected groups do not establish the required boundary and membership.', group['contains_components'],
                  group.get('source_quote',''),'Boundary or membership not confirmed','Review and represent the required zone in the target.')
    if req.get('architectural_constraints'):
        notes.append('Runtime, security, capacity and availability constraints require review; diagram structure alone cannot certify them.')
    if (evidence or {}).get('uncertainties'):
        notes.append('CV reports unresolved visual evidence; review the overlay before accepting the audit.')
    if not byid:
        notes.append('No visual components were detected. The target is derived from requirements only.')
    score = round(100 * verified / checked, 1) if checked else 0.0
    return dict(audit_summary=dict(total_discrepancies=len(discrepancies),
        critical_severity_count=sum(d['severity']=='CRITICAL' for d in discrepancies),
        warning_severity_count=sum(d['severity']!='CRITICAL' for d in discrepancies),
        alignment_score_percentage=score, executive_verdict='Needs Review' if discrepancies or notes or not checked else 'Observed requirements matched',
        score_definition='Percentage of explicit structural requirements confirmed in the extracted graph; not CV accuracy or a security certification.',
        status='review_required' if discrepancies or notes or not checked else 'matched'),
        discrepancies=discrepancies, review_notes=notes, entity_matches=matches,
        structural_metrics=dict(diagram_node_count=len(byid), requirements_node_count=len(req.get('components',[])),
        diagram_edge_count=len(edges),requirements_edge_count=len(req.get('flows',[]))))


def mermaid_text(value):
    # Mermaid entity escapes avoid syntax/control injection through OCR or requirements.
    return str(value).replace('&', '#38;').replace('"', '#34;').replace('<', '#60;').replace('>', '#62;').replace('|', '#124;').replace('\n', ' ').replace('\r', ' ')


def synthesize_graph(arch, req, report):
    matches = report.get('entity_matches') or match_entities(arch, req)[0]
    components = copy.deepcopy(arch.get('components', []))
    byid = {c['id']:c for c in components}
    req_to_target = {}
    changes = []
    for c in components:
        c.update(status='Unchanged', provenance='visual_observation')
    for c in req.get('components', []):
        if c.get('basis','explicit') != 'explicit':
            continue
        cid = matches.get(c['id'])
        if not cid:
            cid = 'required_' + c['id']
            while cid in byid:
                cid = '_' + cid
            new = dict(c, id=cid, status='Added_From_Requirements', provenance='requirement')
            components.append(new)
            byid[cid] = new
            changes.append(f"Added required component: {c['label']} (not confirmed by CV).")
        req_to_target[c['id']] = cid
    relationships = [copy.deepcopy(e) for e in arch.get('relationships', []) if e.get('source') in byid and e.get('target') in byid]
    for e in relationships:
        e.update(status='Unchanged', provenance='visual_observation')
    for f in req.get('forbidden_flows', []):
        if f.get('basis','explicit') != 'explicit':
            continue
        s,t = req_to_target.get(f['source']), req_to_target.get(f['target'])
        kept = []
        for e in relationships:
            if s and t and permits(e,s,t):
                if edge_direction(e)=='bidirectional':
                    kept.append(dict(e, source=t,target=s,direction='forward',status='Corrected_Direction',provenance='requirement'))
                changes.append(f'Removed explicitly forbidden flow: {s} -> {t}.')
            else:
                kept.append(e)
        relationships = kept
    replaced_pairs = set()
    for f in req.get('flows', []):
        if f.get('basis','explicit') != 'explicit':
            continue
        s,t = req_to_target.get(f['source']), req_to_target.get(f['target'])
        if not s or not t:
            continue
        # A target requirement determines this pair; remove the conflicting observed direction.
        existing = [e for e in relationships if {e['source'],e['target']}=={s,t}]
        pair = frozenset((s, t))
        if pair not in replaced_pairs:
            relationships = [e for e in relationships if e not in existing]
            replaced_pairs.add(pair)
        relationships.append(dict(source=s,target=t,direction=f.get('direction','forward'),protocol=f.get('protocol',''),
            label=f.get('protocol',''), status='Corrected_Configuration' if existing else 'Added',provenance='requirement',source_quote=f.get('source_quote','')))
        if not existing or not any(permits(e,s,t) for e in existing):
            changes.append(f"Applied required connection: {byid[s]['label']} -> {byid[t]['label']}.")
    groups = []
    for g in req.get('zones_and_groups', []):
        if g.get('basis','explicit') != 'explicit':
            continue
        groups.append(dict(id=g['id'],label=g['name'],enclosed_components=[req_to_target[x] for x in g['contains_components'] if x in req_to_target]))
    assigned = {x for g in groups for x in g['enclosed_components']}
    for g in arch.get('groups', []):
        remaining = [x for x in g.get('enclosed_components',[]) if x in byid and x not in assigned]
        if remaining:
            groups.append(dict(g,enclosed_components=remaining))
            assigned.update(remaining)
    node_ids = {c['id']:f'n{i}' for i,c in enumerate(components)}
    lines = ['flowchart TD']
    emitted = set()
    def emit(cid, indent='    '):
        if cid in node_ids and cid not in emitted:
            lines.append(f'{indent}{node_ids[cid]}["{mermaid_text(byid[cid]["label"])}"]')
            emitted.add(cid)
    for i,g in enumerate(groups):
        members = [x for x in g.get('enclosed_components',[]) if x in node_ids and x not in emitted]
        if members:
            lines.append(f'    subgraph g{i}["{mermaid_text(g["label"])}"]')
            for cid in members:
                emit(cid, '        ')
            lines.append('    end')
    for c in components:
        emit(c['id'])
    unique = set()
    clean_edges = []
    for e in relationships:
        key = (e['source'],e['target'],edge_direction(e), e.get('protocol') or e.get('label',''))
        if key in unique:
            continue
        unique.add(key)
        clean_edges.append(e)
        arrow = {'forward':'-->','backward':'<--','bidirectional':'<-->','undirected':'---'}.get(edge_direction(e),'---')
        label = e.get('protocol') or e.get('label','')
        label_text = f'|"{mermaid_text(label)}"|' if label else ''
        lines.append(f'    {node_ids[e["source"]]} {arrow}{label_text} {node_ids[e["target"]]}')
    return {'synthesized_architecture':dict(title=req.get('system_name','Target architecture'), mermaid_code='\n'.join(lines),
        components=components,relationships=clean_edges,groups=groups,remediation_summary=changes,
        review_notes=report.get('review_notes',[]), status='proposed_target',
        note='Proposed graph combines observed components with explicit requirements. Inferred requirements and runtime constraints need human review.')}


def synthesize_from_requirements_only(req: dict) -> dict:
    """Synthesize architecture and Mermaid strictly from the parsed requirements document."""
    req_components = copy.deepcopy(req.get('components', []))
    byid = {c['id']: c for c in req_components}
    node_ids = {c['id']: f"req_{i}" for i, c in enumerate(req_components)}

    groups = []
    lines = ['flowchart TD']
    emitted = set()

    def emit(cid, indent='    '):
        if cid in node_ids and cid not in emitted:
            lines.append(f'{indent}{node_ids[cid]}["{mermaid_text(byid[cid]["label"])}"]')
            emitted.add(cid)

    for i, g in enumerate(req.get('zones_and_groups', [])):
        group_item = {
            'id': g.get('id', f'zone_{i}'),
            'label': g.get('name', f'Zone {i+1}'),
            'enclosed_components': [x for x in g.get('contains_components', []) if x in node_ids]
        }
        groups.append(group_item)
        members = [x for x in group_item['enclosed_components'] if x not in emitted]
        if members:
            lines.append(f'    subgraph z{i}["{mermaid_text(group_item["label"])}"]')
            for cid in members:
                emit(cid, '        ')
            lines.append('    end')

    for c in req_components:
        emit(c['id'])

    clean_edges = []
    unique = set()
    for f in req.get('flows', []):
        s, t = f.get('source'), f.get('target')
        if not s or not t or s not in node_ids or t not in node_ids:
            continue
        direction = f.get('direction', 'forward')
        protocol = f.get('protocol', '')
        key = (s, t, direction, protocol)
        if key in unique:
            continue
        unique.add(key)
        clean_edges.append(f)
        arrow = {'forward': '-->', 'backward': '<--', 'bidirectional': '<-->', 'undirected': '---'}.get(direction, '-->')
        protocol_text = f'|"{mermaid_text(protocol)}"|' if protocol else ''
        lines.append(f'    {node_ids[s]} {arrow}{protocol_text} {node_ids[t]}')

    mermaid_code = '\n'.join(lines)
    return {
        'title': f"{req.get('system_name', 'Architecture')} (Requirements Specification)",
        'mermaid_code': mermaid_code,
        'components': req_components,
        'relationships': clean_edges,
        'groups': groups,
        'status': 'requirements_pure',
        'note': 'Synthesized strictly from requirements specification document without diagram dependency.'
    }
