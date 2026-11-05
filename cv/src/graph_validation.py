"""Structural and evidence validation; this is not a semantic accuracy score."""
from __future__ import annotations


def validate_graphs(architecture, evidence):
    errors=[]
    components=architecture.get('components',[]);groups=architecture.get('groups',[])
    objects=components+groups
    ids=[item['id'] for item in objects]
    by_id={item['id']:item for item in objects};group_ids={g['id'] for g in groups}
    if len(set(ids))!=len(ids): errors.append('Duplicate component/group identifier')
    dimensions=architecture['diagram_metadata']['dimensions']
    for item in objects:
        b=item['bounding_box']
        if b['x']<0 or b['y']<0 or min(b['width'],b['height'])<=0 or b['x']+b['width']>dimensions['width'] or b['y']+b['height']>dimensions['height']:
            errors.append('Invalid bounding box: '+item['id'])
        parent=item.get('parent_group_id')
        if parent and parent not in group_ids: errors.append('Unknown parent: '+item['id'])
        visited={item['id']}
        while parent in by_id:
            if parent in visited:
                errors.append('Containment cycle: '+item['id']);break
            visited.add(parent);parent=by_id[parent].get('parent_group_id')
    for group in groups:
        if any(n not in by_id or n in group_ids for n in group.get('enclosed_components',[])):
            errors.append('Invalid group membership: '+group['id'])
        if any(g not in group_ids for g in group.get('child_groups',[])):
            errors.append('Invalid child group: '+group['id'])
    traces={t['id']:t for t in evidence.get('detections',{}).get('connector_traces',[])}
    edge_ids=[]
    for edge in architecture.get('relationships',[]):
        edge_ids.append(edge['id'])
        if edge['source'] not in by_id or edge['target'] not in by_id:
            errors.append('Dangling relationship: '+edge['id'])
        trace=traces.get(edge['id'])
        if trace is None:
            errors.append('Relationship has no trace: '+edge['id']);continue
        for key in ('source','target','waypoints','endpoints'):
            if edge.get(key)!=trace.get(key): errors.append('Trace mismatch '+edge['id']+': '+key)
        direction=edge.get('direction')
        if direction!=trace.get('detected_direction'):
            errors.append('Direction/evidence mismatch: '+edge['id'])
        if direction not in ('forward','bidirectional','undirected'):
            errors.append('Unsupported direction: '+edge['id'])
        for x,y in edge.get('waypoints',[]):
            if not (0<=x<dimensions['width'] and 0<=y<dimensions['height']):
                errors.append('Out-of-bounds trace: '+edge['id']);break
    if len(edge_ids)!=len(set(edge_ids)):errors.append('Duplicate relationship identifier')
    return {'status':'passed' if not errors else 'failed','errors':errors,
            'scope':'Structural consistency and trace provenance; not semantic accuracy.'}
