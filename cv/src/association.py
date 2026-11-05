"""Semantic association: text-to-box, edge labels, groups, and architectural roles."""

from __future__ import annotations

import math
import re
from typing import List, Dict, Any, Tuple, Set


def point_to_segment_distance(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """Distance from point (px, py) to line segment (x1, y1)-(x2, y2)."""
    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    return math.hypot(px - proj_x, py - proj_y)


def distance_point_to_polyline(point: Tuple[int, int], waypoints: List[List[int]]) -> float:
    """Minimum Euclidean distance from a point to a polyline path."""
    if not waypoints:
        return float("inf")
    if len(waypoints) == 1:
        return math.hypot(point[0] - waypoints[0][0], point[1] - waypoints[0][1])

    min_dist = float("inf")
    px, py = point
    for i in range(len(waypoints) - 1):
        x1, y1 = waypoints[i]
        x2, y2 = waypoints[i + 1]
        d = point_to_segment_distance(px, py, x1, y1, x2, y2)
        if d < min_dist:
            min_dist = d
    return min_dist


def distance_box_to_polyline(bbox: List[int], waypoints: List[List[int]]) -> float:
    """Minimum Euclidean distance from a bounding box perimeter to a polyline."""
    if not waypoints:
        return float("inf")
    x, y, w, h = bbox
    pts = [
        (x, y), (x + w // 2, y), (x + w, y),
        (x, y + h // 2), (x + w, y + h // 2),
        (x, y + h), (x + w // 2, y + h), (x + w, y + h)
    ]
    return min(distance_point_to_polyline(p, waypoints) for p in pts)


class SemanticAssociator:
    """Fuses OCR text, spatial geometry, connector paths, and architectural semantics."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    def infer_component_role(self, label: str, shape: str, in_degree: int, out_degree: int) -> str:
        """Infer architectural component role grounded in label, shape, and graph topology."""
        low_label = label.lower()
        words=set(re.findall(r'[a-z0-9]+',low_label))
        def has_keyword(keyword):
            return keyword in words if ' ' not in keyword else re.search(r'\b'+re.escape(keyword)+r'\b',low_label) is not None

        # Database / Storage
        db_keywords = ["db", "database", "sql", "cache", "redis", "store", "mongo", "postgres", "mysql", "dynamo", "data lake"]
        if shape == "cylinder" or any(has_keyword(kw) for kw in db_keywords):
            return "Storage/Database"

        # Client / Ingress
        client_keywords = ["client", "user", "browser", "mobile", "loadgen", "traffic", "actor", "customer"]
        if any(has_keyword(kw) for kw in client_keywords) and "service" not in words:
            return "Ingress/Client"

        # Gateway / Proxy
        gateway_keywords = ["gateway", "ingress", "router", "proxy", "frontend", "load balancer", "alb", "nginx"]
        if any(has_keyword(kw) for kw in gateway_keywords):
            return "Gateway/Proxy"

        # Event Bus / Queue
        queue_keywords = ["queue", "kafka", "mq", "topic", "pubsub", "bus", "stream"]
        if any(has_keyword(kw) for kw in queue_keywords):
            return "MessageQueue/EventStream"

        if words & {'service','server','worker','processor','application','app','logic','compute','api','function'}:
            return "Microservice/Compute"
        return "Unknown/Component"

    def associate_components(
        self,
        components: List[Dict[str, Any]],
        containers: List[Dict[str, Any]],
        text_blocks: List[Dict[str, Any]],
        roi_texts: Dict[str, Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Set[str]]:
        """
        Phase 1: Attach text to candidate components and prune decorative icon glyphs.
        Pruning decorative icons before connector tracing ensures connector endpoints
        snap directly to genuine software components rather than decorative icon borders.
        """
        claimed_text_ids = set()

        # 1. Attach text to components
        for comp in components:
            comp_id = comp["id"]
            if comp.get('label_words'):
                matched=comp['label_words']
                comp['label']=' '.join(t['text'] for t in matched)
                comp['matched_text_ids']=[t['id'] for t in matched]
                comp['ocr_confidence']=sum(t['confidence'] for t in matched)/len(matched)
                claimed_text_ids.update(comp['matched_text_ids'])
                # OCR on an illustration is not component text.
                sx,sy,sw,sh=comp['symbol_bbox']
                claimed_text_ids.update(t['id'] for t in text_blocks
                    if sx<=t['center'][0]<=sx+sw and sy<=t['center'][1]<=sy+sh)
                continue
            bx, by, bw, bh = comp["bbox"]
            margin = 8

            # Gather text blocks inside box
            matched_words = []
            for tb in text_blocks:
                if tb["id"] in claimed_text_ids:
                    continue
                tx, ty = tb["center"]
                if (bx - margin) <= tx <= (bx + bw + margin) and (by - margin) <= ty <= (by + bh + margin):
                    matched_words.append(tb)
                    claimed_text_ids.add(tb["id"])

            # Sort matched words top-to-bottom, left-to-right
            matched_words = sorted(matched_words, key=lambda w: (w["center"][1] // 12, w["center"][0]))
            spatial_label = " ".join(w["text"] for w in matched_words).strip()

            # Compare with targeted ROI OCR text
            roi_info = roi_texts.get(comp_id, {})
            roi_label = roi_info.get("text", "").strip()

            # Prioritize cleaner, more complete text
            cleaned_spatial = re.sub(r"^[2eE]\s+", "", spatial_label).strip()
            cleaned_spatial = re.sub(r"^ee\s+", "", cleaned_spatial, flags=re.IGNORECASE).strip()
            cleaned_spatial = re.sub(r"\s+eee$", "", cleaned_spatial, flags=re.IGNORECASE).strip()
            cleaned_spatial = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned_spatial)

            roi_conf = roi_info.get("confidence", 0.0)
            if roi_conf >= 0.70 and len(roi_label) >= 3 and any(ch.isalpha() for ch in roi_label):
                final_label = roi_label
            elif cleaned_spatial and any(ch.isalpha() for ch in cleaned_spatial):
                final_label = cleaned_spatial
            elif roi_label:
                final_label = roi_label
            else:
                final_label = comp.get("label") or f"Component_{comp_id}"

            # Strip leading/trailing bracket noise
            final_label = re.sub(r"^[<\(\[\{\|\:\-\_]+|[>\)\]\}\|\:\-\_]+$", "", final_label).strip()

            comp["label"] = final_label
            comp["matched_text_ids"] = [w["id"] for w in matched_words]
            comp["ocr_confidence"] = roi_info.get("confidence", 0.0) if final_label == roi_label else (sum(w["confidence"] for w in matched_words)/len(matched_words) if matched_words else 0.0)
            if final_label.startswith("Component_") or comp["ocr_confidence"] < .5:
                comp["confidence"] = min(comp.get("confidence", .5), .49)

        # Prune small decorative icon glyphs and unlabelled visual noise
        valid_components = []
        for comp in components:
            if comp.get('detection_method'):
                valid_components.append(comp)
                continue
            w, h = comp["bbox"][2], comp["bbox"][3]
            area = w * h
            label = comp.get("label", "")
            ocr_conf = comp.get("ocr_confidence", 0.0)
            is_icon = (w < 95 or h < 55 or area < 6500) and (
                ocr_conf < 0.70 or len(label) < 3 or not any(ch.isalpha() for ch in label) or label.startswith("Component_")
            )
            if not is_icon and label.startswith("Component_") and ocr_conf == 0.0 and area < 10000:
                is_icon = True
            if not is_icon:
                valid_components.append(comp)
        if valid_components:
            components = valid_components

        return components, containers, claimed_text_ids

    def associate_connectors_and_hierarchy(
        self,
        components: List[Dict[str, Any]],
        containers: List[Dict[str, Any]],
        connectors: List[Dict[str, Any]],
        text_blocks: List[Dict[str, Any]],
        claimed_text_ids: Set[str] = None
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Phase 2: Attach text to containers and connectors, establish hierarchy, and infer roles.
        """
        if claimed_text_ids is None:
            claimed_text_ids = set()

        # 2. Attach text to containers
        for cont in sorted(containers, key=lambda c: c["area"]):
            cx, cy, cw, ch = cont["bbox"]
            matched_words = []
            for tb in text_blocks:
                if tb["id"] in claimed_text_ids or tb.get('kind')=='callout':
                    continue
                tx, ty = tb["center"]
                if cx <= tx <= (cx + cw) and cy <= ty <= (cy + min(60, ch * 0.35)):
                    # Guard: If text is on a connector, prioritize edge label over container
                    on_connector = False
                    for conn in connectors:
                        if distance_box_to_polyline(tb["bbox"], conn.get("waypoints", [])) <= 24.0:
                            on_connector = True
                            break
                    if not on_connector:
                        matched_words.append(tb)

            # Container labels form a cohesive contiguous title, not scattered text
            if matched_words:
                matched_words = sorted(matched_words, key=lambda w: (w["center"][1] // 16, w["center"][0]))
                title_words = [matched_words[0]]
                for w in matched_words[1:]:
                    prev = title_words[-1]
                    h_gap = w["bbox"][0] - (prev["bbox"][0] + prev["bbox"][2])
                    v_gap = abs(w["center"][1] - prev["center"][1])
                    if v_gap <= 14 and 0 <= h_gap <= 35:
                        title_words.append(w)
                    elif v_gap <= 22 and abs(w["center"][0] - prev["center"][0]) <= 80:
                        title_words.append(w)
                    else:
                        break
                for w in title_words:
                    claimed_text_ids.add(w["id"])
                cont_label = " ".join(w["text"] for w in title_words).strip()
            else:
                cont_label = ""
            if not cont_label:
                # Some diagram conventions place zone captions just outside
                # the bottom border. Require alignment and a short visible gap.
                below=[tb for tb in text_blocks if tb['id'] not in claimed_text_ids
                    and 0 <= tb['bbox'][1]-(cy+ch) <= max(16,tb['bbox'][3])
                    and abs(tb['center'][0]-(cx+cw/2)) <= max(20,tb['bbox'][2]*.65)
                    and not any(distance_box_to_polyline(tb['bbox'],c.get('waypoints',[]))<=15 for c in connectors)]
                if below:
                    from cv.src.visual_components import reading_order
                    below=reading_order(below)
                    cont_label=' '.join(t['text'] for t in below)
                    claimed_text_ids.update(t['id'] for t in below)
            cont["label"] = cont_label if cont_label else f"Group_{cont['id']}"

        # 3. Associate remaining text blocks to Connectors (Edge Labels)
        for conn in connectors:
            conn["label"] = ""

        # Cluster remaining unclaimed words into coherent phrases (same line or vertically stacked)
        unclaimed_words = [tb for tb in text_blocks if tb["id"] not in claimed_text_ids
                           and tb.get('kind')!='callout' and tb.get('confidence',0)>=.5]
        word_clusters = []
        for tb in unclaimed_words:
            assigned_cluster = None
            for cl in word_clusters:
                for m in cl:
                    mb = m["bbox"]
                    tb_b = tb["bbox"]
                    same_line = abs(mb[1] - tb_b[1]) <= 10 and (
                        0 <= (tb_b[0] - (mb[0] + mb[2])) <= 30 or 0 <= (mb[0] - (tb_b[0] + tb_b[2])) <= 30
                    )
                    x_overlap = min(mb[0] + mb[2], tb_b[0] + tb_b[2]) - max(mb[0], tb_b[0])
                    stacked = x_overlap >= 10 and (
                        0 <= (tb_b[1] - (mb[1] + mb[3])) <= 25 or 0 <= (mb[1] - (tb_b[1] + tb_b[3])) <= 25
                    )
                    if same_line or stacked:
                        assigned_cluster = cl
                        break
                if assigned_cluster is not None:
                    break
            if assigned_cluster is not None:
                assigned_cluster.append(tb)
            else:
                word_clusters.append([tb])

        # Assign each cluster to its closest connector within distance threshold
        conn_clusters = {id(conn): [] for conn in connectors}
        for cl in word_clusters:
            best_conn = None
            best_dist = float("inf")
            for conn in connectors:
                wp = conn.get("waypoints", [])
                if not wp:
                    continue
                d_box = min(distance_box_to_polyline(w["bbox"], wp) for w in cl)
                d_center = min(distance_point_to_polyline(w["center"], wp) for w in cl)
                dist = min(d_box, d_center)
                if dist < best_dist and (d_box <= 48.0 or d_center <= 40.0):
                    best_dist = dist
                    best_conn = conn
            if best_conn is not None:
                conn_clusters[id(best_conn)].append(cl)
                for w in cl:
                    claimed_text_ids.add(w["id"])

        for conn in connectors:
            clusters_for_conn = conn_clusters.get(id(conn), [])
            if clusters_for_conn:
                all_words = [w for cl in clusters_for_conn for w in cl]
                words_sorted = sorted(all_words, key=lambda w: (w["center"][1] // 16, w["center"][0]))
                raw_label = " ".join(w["text"] for w in words_sorted).strip()
                cleaned_label = re.sub(r"^[\-_=~`|\.\,\:\;\'\"<>\[\]\(\)\{\}\\]+|[\-_=~`|\.\,\:\;\'\"<>\[\]\(\)\{\}\\]+$", "", raw_label).strip()
                conn["label"] = cleaned_label

        # 4. Form Group Hierarchy (Container -> Components)
        def contains(outer, inner):
            x, y, w, h = outer
            X, Y, W, H = inner
            return X >= x - 3 and Y >= y - 3 and X + W <= x + w + 3 and Y + H <= y + h + 3

        for comp in components:
            comp.pop("parent_group_id", None)
            comp.pop("parent_group_label", None)
        for cont in sorted(containers, key=lambda c: c["area"]):
            enclosed_ids = []
            for comp in components:
                if contains(cont["bbox"], comp["bbox"]):
                    enclosed_ids.append(comp["id"])
                    if "parent_group_id" not in comp:
                        comp["parent_group_id"] = cont["id"]
                        comp["parent_group_label"] = cont["label"]
            cont["enclosed_components"] = enclosed_ids
            parents = [g for g in containers if g["id"] != cont["id"] and g["area"] > cont["area"] and contains(g["bbox"], cont["bbox"])]
            cont["parent_group_id"] = min(parents, key=lambda c: c["area"])["id"] if parents else None
        for cont in containers:
            cont["child_groups"] = [g["id"] for g in containers if g.get("parent_group_id") == cont["id"]]
        self.annotations = [dict(tb) for tb in text_blocks if tb["id"] not in claimed_text_ids]

        # 5. Compute graph degree and assign architectural roles
        in_degrees = {c["id"]: 0 for c in components}
        out_degrees = {c["id"]: 0 for c in components}
        for conn in connectors:
            s = conn["source"]
            t = conn["target"]
            d = conn["direction"]
            if s in out_degrees:
                out_degrees[s] += 1
            if t in in_degrees:
                in_degrees[t] += 1
            if d == "bidirectional":
                if s in in_degrees:
                    in_degrees[s] += 1
                if t in out_degrees:
                    out_degrees[t] += 1

        comp_map = {c["id"]: c for c in components+containers}
        for comp in components:
            cid = comp["id"]
            comp["type"] = self.infer_component_role(
                comp["label"],
                comp.get("shape", "rectangle"),
                in_degrees.get(cid, 0),
                out_degrees.get(cid, 0)
            )

        # Update source and target labels on connectors
        for conn in connectors:
            s = conn.get("source")
            t = conn.get("target")
            if s in comp_map:
                conn["source_label"] = comp_map[s]["label"]
            if t in comp_map:
                conn["target_label"] = comp_map[t]["label"]

        return components, containers, connectors

    def associate(
        self,
        components: List[Dict[str, Any]],
        containers: List[Dict[str, Any]],
        connectors: List[Dict[str, Any]],
        text_blocks: List[Dict[str, Any]],
        roi_texts: Dict[str, Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        """
        Execute full unified association pass (backward-compatible).
        """
        components, containers, claimed_text_ids = self.associate_components(
            components, containers, text_blocks, roi_texts
        )
        valid_ids = {c["id"] for c in components}
        connectors = [conn for conn in connectors if conn.get("source") in valid_ids and conn.get("target") in valid_ids]
        return self.associate_connectors_and_hierarchy(
            components, containers, connectors, text_blocks, claimed_text_ids
        )
