"""Topology-preserving raster tracing with conservative arrow evidence."""
from __future__ import annotations

import math
from collections import defaultdict
import cv2
import numpy as np
from scipy.spatial import cKDTree


def bridge_collinear_gaps(skeleton, comp_exclusion, text_exclusion=None, text_blocks=None, max_gap=14, max_text_gap=280):
    """Reconnect short aligned dash gaps and bridge across edge label text boxes."""
    result = skeleton.copy()
    bridges = []
    height, width = skeleton.shape
    text_coverage = None
    if text_exclusion is not None:
        # OCR boxes cover glyph ink; the white label background extends beyond
        # it. A bounded margin recovers that real occlusion without allowing
        # any unrelated word to justify a long invented connector.
        text_coverage=cv2.dilate(text_exclusion,np.ones((25,25),np.uint8))

    for _ in range(3):
        binary = (result > 0).astype(np.uint8)
        count = cv2.filter2D(binary, cv2.CV_16S, np.ones((3, 3), np.int16)) - binary
        ys, xs = np.where((binary == 1) & (count == 1))
        points = np.column_stack((xs, ys))
        if len(points) < 2:
            break

        vectors = {}
        support_lengths = {}
        for pt in points:
            x, y = int(pt[0]), int(pt[1])
            y0, y1, x0, x1 = max(0, y - 8), min(height, y + 9), max(0, x - 8), min(width, x + 9)
            yy, xx = np.where(binary[y0:y1, x0:x1])
            local = np.column_stack((xx + x0, yy + y0))
            vec = np.array([x, y], dtype=float) - local.mean(axis=0)
            norm = np.linalg.norm(vec)
            vectors[(x, y)] = vec / max(1e-6, norm)
            # A few surviving glyph pixels are not a connector shaft. Require
            # visible continuation on both sides before bridging a long OCR gap.
            seen={(x,y)}; frontier=[(x,y)]
            while frontier and len(seen)<24:
                px,py=frontier.pop()
                for ox in (-1,0,1):
                    for oy in (-1,0,1):
                        q=(px+ox,py+oy)
                        if q not in seen and 0<=q[0]<width and 0<=q[1]<height and binary[q[1],q[0]]:
                            seen.add(q);frontier.append(q)
            support_lengths[(x,y)]=len(seen)

        bridges_added = 0
        used = set()
        candidates = []
        for i, j in sorted(cKDTree(points).query_pairs(max_text_gap)):
                p1, p2 = tuple(points[i]), tuple(points[j])
                d = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
                if d < 3 or d > max_text_gap:
                    continue
                dir_12 = np.array([p2[0] - p1[0], p2[1] - p1[1]], dtype=float) / d
                v1 = vectors.get(p1, np.zeros(2))
                v2 = vectors.get(p2, np.zeros(2))
                cos1 = np.dot(v1, dir_12)
                cos2 = np.dot(v2, -dir_12)
                if cos1 > 0.85 and cos2 > 0.85:
                    sample = np.linspace(p1, p2, int(d) + 1).round().astype(int)
                    if np.any(comp_exclusion[sample[:, 1], sample[:, 0]]):
                        continue
                    # A long gap is only justified by an OCR occlusion covering
                    # most of the missing path, not incidental nearby text.
                    cov_thresh = 0.60 if (cos1 > 0.95 and cos2 > 0.95) else 0.65
                    crosses_text = text_coverage is not None and np.mean(text_coverage[sample[:, 1], sample[:, 0]] > 0) >= cov_thresh
                    if d > max_gap and not crosses_text:
                        continue
                    if d > max_gap and min(support_lengths[p1],support_lengths[p2])<12:
                        continue
                    candidates.append((cos1 + cos2, d, p1, p2))

        candidates.sort(key=lambda item: (-item[0], item[1]))
        for score, d, p1, p2 in candidates:
            if p1 in used or p2 in used:
                continue
            used.add(p1)
            used.add(p2)
            cv2.line(result, p1, p2, 255, 1)
            bridges.append([list(p1), list(p2)])
            bridges_added += 1

        if bridges_added == 0:
            break

    return result, bridges


def distance_point_to_box(point, bbox):
    px, py = point
    x, y, w, h = bbox
    return math.hypot(max(x-px, px-x-w, 0), max(y-py, py-y-h, 0))


def morphological_skeleton(binary_mask):
    """Zhang-Suen thinning preserves connected paths, unlike erosion skeletons."""
    image = np.pad(binary_mask > 0, 1).astype(np.uint8)
    while True:
        removed = 0
        for phase in (0, 1):
            p = [image[:-2, 1:-1], image[:-2, 2:], image[1:-1, 2:],
                 image[2:, 2:], image[2:, 1:-1], image[2:, :-2],
                 image[1:-1, :-2], image[:-2, :-2]]
            count = sum(p)
            transitions = sum((p[i] == 0).astype(np.uint8) * (p[(i+1) % 8] == 1) for i in range(8))
            if phase == 0:
                cond = (p[0]*p[2]*p[4] == 0) & (p[2]*p[4]*p[6] == 0)
            else:
                cond = (p[0]*p[2]*p[6] == 0) & (p[0]*p[4]*p[6] == 0)
            delete = (image[1:-1, 1:-1] == 1) & (count >= 2) & (count <= 6) & (transitions == 1) & cond
            removed += int(delete.sum())
            image[1:-1, 1:-1][delete] = 0
        if not removed:
            return image[1:-1, 1:-1] * 255


def _pixel_graph(skeleton):
    """Compress ordered pixel chains into a graph of junctions and terminals."""
    yy, xx = np.where(skeleton > 0)
    pixels = set(zip(xx.tolist(), yy.tolist()))
    adjacent = {}
    for x, y in pixels:
        neighbors = []
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            pt = (x+dx, y+dy)
            if pt not in pixels:
                continue
            if dx and dy and ((x+dx, y) in pixels or (x, y+dy) in pixels):
                continue
            neighbors.append(pt)
        adjacent[(x, y)] = neighbors
    special = {pt for pt in pixels if len(adjacent[pt]) != 2}
    groups, membership = [], {}
    while special:
        seed = special.pop()
        group, pending = [seed], [seed]
        while pending:
            pt = pending.pop()
            for nxt in adjacent[pt]:
                if nxt in special:
                    special.remove(nxt)
                    pending.append(nxt)
                    group.append(nxt)
        for pt in group:
            membership[pt] = len(groups)
        groups.append(group)
    edges, used = [], set()
    for index, group in enumerate(groups):
        for pt in group:
            for nxt in adjacent[pt]:
                if membership.get(nxt) == index or (pt, nxt) in used:
                    continue
                path = [pt, nxt]
                used.update(((pt, nxt), (nxt, pt)))
                while path[-1] not in membership:
                    options = [p for p in adjacent[path[-1]] if p != path[-2]]
                    if not options:
                        break
                    new = options[0]
                    used.update(((path[-1], new), (new, path[-1])))
                    path.append(new)
                target = membership.get(path[-1])
                if target is not None and target != index:
                    edges.append((index, target, path))
    adjacency = defaultdict(list)
    # Raster crossings often contain two adjacent T junctions separated by a
    # few pixels. Collapse that junction region before choosing continuation.
    degrees = defaultdict(int)
    for a, b, path in edges:
        degrees[a] += 1
        degrees[b] += 1
    parent = list(range(len(groups)))
    def root(n):
        while parent[n] != n:
            n = parent[n]
        return n
    for a, b, path in edges:
        if len(path) <= 9 and degrees[a] >= 3 and degrees[b] >= 3:
            parent[root(b)] = root(a)
    for i, (a, b, path) in enumerate(edges):
        a, b = root(a), root(b)
        if a == b:
            continue
        adjacency[a].append((i, b, path))
        adjacency[b].append((i, a, path[::-1]))
    # Grouping adjacent junction pixels can leave a degree-two intermediate
    # vertex. Contract it so arrow wings and curved paths keep their topology.
    next_edge = len(edges)
    for node in range(len(groups)):
        if len(adjacency[node]) != 2:
            continue
        left, right = adjacency[node]
        if left[1] == right[1]:
            continue
        a, b = left[1], right[1]
        joined = left[2][::-1] + right[2]
        adjacency[a] = [link for link in adjacency[a] if link[0] != left[0]]
        adjacency[b] = [link for link in adjacency[b] if link[0] != right[0]]
        adjacency[a].append((next_edge, b, joined))
        adjacency[b].append((next_edge, a, joined[::-1]))
        adjacency[node] = []
        next_edge += 1
    return groups, adjacency


class ConnectorTracer:
    def __init__(self, config):
        self.config = config
        self.uncertainties = []

    def detect_arrowhead_at_endpoint(self, endpoint, direction_vec, gray_img, is_dark_bg=False):
        """Require bilateral flare behind a tip and a narrower shaft."""
        dx, dy = direction_vec
        norm = math.hypot(dx, dy)
        if norm < .01:
            return False
        dx, dy = dx/norm, dy/norm
        nx, ny = -dy, dx
        strokes = gray_img > 75 if is_dark_bg else gray_img < self.config.get("stroke_bin_threshold", 205)
        h, w = strokes.shape
        ex, ey = endpoint
        widths = []
        for dist in range(-5, 25):
            pos_offsets = []
            neg_offsets = []
            for offset in range(-14, 15):
                x = int(round(ex - dx*dist + nx*offset))
                y = int(round(ey - dy*dist + ny*offset))
                if 0 <= x < w and 0 <= y < h and strokes[y, x]:
                    if offset > 0:
                        pos_offsets.append(offset)
                    elif offset < 0:
                        neg_offsets.append(-offset)
                    else:
                        pos_offsets.append(0)
                        neg_offsets.append(0)
            p = max(pos_offsets) if pos_offsets else 0
            n = max(neg_offsets) if neg_offsets else 0
            widths.append((dist, p, n, p + n))

        shaft_widths = [tot for d, p, n, tot in widths if 14 <= d <= 22]
        baseline = float(np.median(shaft_widths)) if shaft_widths else 0.0
        if baseline > 4.5:
            return False

        flares = [tot for d, p, n, tot in widths if 1 <= d <= 10
                  and ((p>=3 and n>=3) or (p>=2 and n>=2 and max(p,n)<=3 and baseline<=2))
                  and tot >= max(4, baseline + 3)]
        return len(flares) >= 2

    def trace_connectors(self, original_img, gray_img, components, text_blocks,
                         is_dark_bg=False, containers=None):
        self.uncertainties = []
        h, w = gray_img.shape
        mask_pad = self.config.get("component_mask_pad", 2)
        comp_exclusion = np.zeros((h, w), np.uint8)
        for comp in components:
            x, y, cw, ch = comp["bbox"]
            cv2.rectangle(comp_exclusion, (max(0, x-mask_pad), max(0, y-mask_pad)),
                          (min(w-1, x+cw+mask_pad), min(h-1, y+ch+mask_pad)), 255, -1)
        # Container perimeters are not communication paths. Remove only the
        # perimeter; short collinear gaps restore actual crossings afterwards.
        boundary_mask = np.zeros((h,w),np.uint8)
        for cont in containers or []:
            x,y,cw,ch=cont['bbox']
            cv2.rectangle(boundary_mask,(x,y),(x+cw,y+ch),255,5)

        text_exclusion = np.zeros((h, w), np.uint8)
        for tb in text_blocks:
            if tb.get("confidence", 0) < .48:
                continue
            x, y, tw, th = tb["bbox"]
            if th > max(40, h * .08):
                continue
            cv2.rectangle(text_exclusion, (max(0, x-1), max(0, y-1)),
                          (min(w-1, x+tw+1), min(h-1, y+th+1)), 255, -1)

        strokes = ((gray_img > 75) if is_dark_bg else
                   (gray_img < self.config.get("stroke_bin_threshold", 210))).astype(np.uint8)*255
        # An OCR rectangle may include the line above its text. Preserve long
        # observed shafts through that rectangle rather than deleting evidence
        # and subsequently guessing how the ends should reconnect.
        horizontal=cv2.morphologyEx(strokes,cv2.MORPH_OPEN,np.ones((1,25),np.uint8))
        vertical=cv2.morphologyEx(strokes,cv2.MORPH_OPEN,np.ones((25,1),np.uint8))
        shafts=cv2.bitwise_or(horizontal,vertical)
        text_exclusion[shafts>0]=0
        strokes[comp_exclusion > 0] = 0
        strokes[text_exclusion > 0] = 0

        # Remove solid 2D filled areas (such as colored container fills or solid box interiors).
        # A legitimate connector line is thin (1-5px); opening with a 17x17 kernel extracts only solid 2D areas
        # without affecting filled arrowhead triangles (typically ~10-12px).
        kernel_solid = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))
        solid_blobs = cv2.morphologyEx(strokes, cv2.MORPH_OPEN, kernel_solid)
        strokes[solid_blobs > 0] = 0

        # Inside dark or colored containers on light canvases, detect light connector strokes
        if not is_dark_bg and containers:
            for cont in containers:
                cx, cy, cw, ch = cont["bbox"]
                if cw < 30 or ch < 30:
                    continue
                c_roi = gray_img[cy:cy+ch, cx:cx+cw]
                c_bg = float(np.median(c_roi))
                if c_bg < 150:
                    inner_light_lines = (c_roi > c_bg + 25).astype(np.uint8) * 255
                    strokes[cy:cy+ch, cx:cx+cw] = cv2.max(strokes[cy:cy+ch, cx:cx+cw], inner_light_lines)

        strokes[comp_exclusion > 0] = 0
        strokes[text_exclusion > 0] = 0
        strokes = cv2.morphologyEx(strokes, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        strokes[comp_exclusion > 0] = 0
        strokes[text_exclusion > 0] = 0

        skeleton = morphological_skeleton(strokes)
        skeleton[boundary_mask>0]=0
        skeleton, bridges = bridge_collinear_gaps(skeleton, comp_exclusion, text_exclusion=text_exclusion, text_blocks=text_blocks)
        if bridges:
            self.uncertainties.append({'type':'bridged_stroke_gaps', 'count':len(bridges),
                'detail':f'Reconnected {len(bridges)} short collinear stroke gaps (possible dashed connectors or edge labels); verify the recovered paths.'})
        groups, adjacency = _pixel_graph(skeleton)
        radius = self.config.get("endpoint_snap_radius", 30)
        contacts = {}
        arrow_gray = strokes if is_dark_bg else 255-strokes
        # Retain arrow fragments in the gap suppressed by the tracing mask,
        # while excluding the box itself from local arrowhead verification.
        head_strokes = ((gray_img > 75) if is_dark_bg else (gray_img < self.config.get('stroke_bin_threshold', 180))).astype(np.uint8)*255
        for comp in components:
            x,y,cw,ch = comp['bbox']
            cv2.rectangle(head_strokes, (max(0,x-1),max(0,y-1)), (min(w-1,x+cw+1),min(h-1,y+ch+1)), 0, -1)
        head_strokes[boundary_mask>0]=0
        head_strokes[text_exclusion>0]=0
        head_gray = head_strokes if is_dark_bg else 255-head_strokes
        arrow_nodes = {}
        wing_nodes = set()
        for node in range(len(groups)):
            links = adjacency[node]
            long_links = [link for link in links if len(link[2]) > 20]
            short_links = [link for link in links if len(link[2]) <= 20]
            if len(links) >= 3 and len(long_links) == 1 and all(len(adjacency[link[1]]) == 1 for link in short_links):
                arrow_nodes[node] = long_links[0]
                wing_nodes.update(link[1] for link in short_links)
        for node, group in enumerate(groups):
            if node in wing_nodes:
                continue
            links = adjacency[node]
            long_links = [link for link in links if len(link[2]) > 20]
            # An open arrow has two short backward wings and a long shaft.
            # Its tip is the junction, not either wing's terminal endpoint.
            arrow_junction = node in arrow_nodes
            # Several outgoing strokes may still meet immediately outside the
            # masked box. That junction is a component attachment, not a route
            # between every pair of destinations sharing that component.
            nearby = min((distance_point_to_box(pt, c['bbox']), c['id']) for pt in group for c in components) if components else (float('inf'), '')
            boundary_junction = len(links) > 1 and not arrow_junction and nearby[0] <= mask_pad + 5
            if (len(links) != 1 and not arrow_junction and not boundary_junction) or not links:
                continue
            path = (arrow_nodes[node] if arrow_junction else max(links, key=lambda link:len(link[2])))[2]
            if len(path) < 3:
                continue
            endpoint = path[0]
            inner = path[min(32, len(path)-1)]
            tangent = (endpoint[0]-inner[0], endpoint[1]-inner[1])
            if len(path) > 40 and not arrow_junction:
                # A clipped arrow can terminate at a wing rather than its tip.
                # Estimate the approach from the shaft behind that short wing.
                near, far = path[20], path[min(50,len(path)-1)]
                tangent = (near[0]-far[0], near[1]-far[1])
            norm = max(1, math.hypot(*tangent))
            ux, uy = tangent[0]/norm, tangent[1]/norm
            ranked = []
            for comp in components + list(containers or []):
                is_group = comp in (containers or [])
                if is_group:
                    gx,gy,gw,gh=comp['bbox']
                    # An enclosing zone is not the nearest node for every
                    # connector inside it. Only exterior terminal paths dock.
                    if gx <= endpoint[0] <= gx+gw and gy <= endpoint[1] <= gy+gh:
                        continue
                distance = distance_point_to_box(endpoint, comp["bbox"])
                if distance > radius:
                    continue
                ray_distance = min(distance_point_to_box((endpoint[0]+ux*d, endpoint[1]+uy*d), comp["bbox"])
                                   for d in range(0, int(radius)+1, 3))
                if ray_distance <= 9 or (boundary_junction and comp['id'] == nearby[1]):
                    ranked.append((distance+ray_distance*2, comp))
            if not ranked:
                continue
            ranked.sort(key=lambda c: c[0])
            if len(ranked) > 1 and ranked[1][0]-ranked[0][0] < 3:
                continue
            comp = ranked[0][1]
            arrow = not boundary_junction and (arrow_junction or len(path) > 20) and self.detect_arrowhead_at_endpoint(endpoint, tangent, arrow_gray, is_dark_bg)
            if not arrow and not boundary_junction and len(path) > 40:
                near = np.array(path[20], dtype=float)
                far = np.array(path[min(50,len(path)-1)], dtype=float)
                axis = near-far
                axis /= max(1, np.linalg.norm(axis))
                # Search only the observed gap towards the selected component.
                for step in range(0, 40):
                    tip = near + axis*step
                    gap = distance_point_to_box(tip, comp['bbox'])
                    if 2 <= gap <= mask_pad+2 and self.detect_arrowhead_at_endpoint(tip, axis, head_gray, is_dark_bg):
                        arrow = True
                        break
            contacts[node] = (comp, endpoint, arrow)

        self._debug_contacts = contacts
        self._debug_graph = (groups, adjacency)
        candidates = []
        for start, (source, _, _) in contacts.items():
            stack = [(start, [], set(), False)]
            iterations = 0
            while stack and iterations < 5000:
                iterations += 1
                node, path, visited, branched = stack.pop()
                if node != start and node in contacts:
                    target, _, _ = contacts[node]
                    if source["id"] != target["id"] and len(path) >= self.config.get("min_connector_length", 15):
                        candidates.append((start, node, path, branched))
                        continue
                if len(visited) > 80:
                    continue
                options = [(eid, nxt, pts) for eid, nxt, pts in adjacency[node] if eid not in visited]
                # At a crossing continue straight. A turn would invent a link.
                if len(adjacency[node]) >= 4 and path:
                    incoming = np.array(path[-1], float)-np.array(path[max(0, len(path)-12)], float)
                    scored = []
                    for option in options:
                        pts = option[2]
                        outgoing = np.array(pts[min(11, len(pts)-1)], float)-np.array(pts[0], float)
                        cosine = float(np.dot(incoming, outgoing)/max(1e-6, np.linalg.norm(incoming)*np.linalg.norm(outgoing)))
                        scored.append((cosine, option))
                    scored.sort(key=lambda item: item[0], reverse=True)
                    options = [scored[0][1]] if scored and scored[0][0] >= .65 else []
                is_intermediate_branch = (
                    node != start
                    and len(adjacency[node]) == 3
                    and sum(1 for link in adjacency[node] if len(link[2]) > 25) >= 3
                )
                for eid, nxt, pts in options:
                    stack.append((nxt, path+pts, visited | {eid}, branched or is_intermediate_branch))
        connectors = {}
        for start, end, path, branched in candidates:
            c1, ep1, a1 = contacts[start]
            c2, ep2, a2 = contacts[end]
            if branched and not (a1 or a2):
                # Two sources that enter a shared/crossing network do not
                # establish a connection to each other without terminal evidence.
                continue
            if a1 and a2 and branched:
                continue  # Two sinks of a fan-out are not a bidirectional edge.
            if a1 and not a2:
                c1, c2, ep1, ep2, path = c2, c1, ep2, ep1, path[::-1]
            direction = "bidirectional" if a1 and a2 else "forward" if a1 or a2 else "undirected"
            key = (c1["id"], c2["id"], direction) if direction == "forward" else (*sorted([c1["id"], c2["id"]]), direction)
            points = np.asarray(path, np.int32).reshape(-1, 1, 2)
            approx = cv2.approxPolyDP(points, 2.0, False).reshape(-1, 2).tolist()
            conn = {"source": c1["id"], "target": c2["id"],
                    "source_kind": "group" if c1 in (containers or []) else "component",
                    "target_kind": "group" if c2 in (containers or []) else "component",
                    "source_label": c1.get("label", ""), "target_label": c2.get("label", ""),
                    "direction": direction, "confidence": .80 if direction != "undirected" else .60,
                    "endpoints": [list(ep1), list(ep2)], "waypoints": approx,
                    "pixel_length": len(path), "arrowhead_evidence": {"source": a1 and a2, "target": a1 or a2}}
            if key not in connectors or len(path) < connectors[key]["pixel_length"]:
                connectors[key] = conn
        result = list(connectors.values())
        # One physical path can expose a second attachment at the same box
        # after thinning. Keep its directional evidence rather than reporting
        # that path twice with contradictory direction states.
        directed = [c for c in result if c['direction'] != 'undirected']
        def same_attachment(first, second):
            if {first['source'], first['target']} != {second['source'], second['target']}:
                return False
            a = dict(zip((first['source'], first['target']), first['endpoints']))
            b = dict(zip((second['source'], second['target']), second['endpoints']))
            return all(math.dist(a[key], b[key]) <= 25 for key in a)
        result = [c for c in result if c['direction'] != 'undirected' or not any(same_attachment(c, d) for d in directed)]
        for i, conn in enumerate(result):
            conn["id"] = f"conn_{i}"
            if conn["direction"] == "undirected":
                self.uncertainties.append({"item_id": conn["id"], "type": "direction_unresolved",
                    "detail": "A continuous connector was traced; no reliable arrowhead established its direction."})
        connected_contacts = {p for conn in result for p in (conn['source'], conn['target'])}
        unresolved = {c['id'] for c, _, _ in contacts.values()} - connected_contacts
        for cid in sorted(unresolved):
            self.uncertainties.append({'item_id': cid, 'type': 'unresolved_connector',
                'detail': 'Connector pixels touch this component but no unambiguous path to another component was resolved.'})
        return result
