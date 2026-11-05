"""Component and container shape detection using multi-cue computer vision."""

from __future__ import annotations

import cv2
import numpy as np
from typing import List, Dict, Any, Tuple


def calculate_iou(box_a: List[int], box_b: List[int]) -> float:
    """Calculate Intersection-over-Union (IoU) of two [x, y, w, h] bounding boxes."""
    xa, ya, wa, ha = box_a
    xb, yb, wb, hb = box_b

    x1 = max(xa, xb)
    y1 = max(ya, yb)
    x2 = min(xa + wa, xb + wb)
    y2 = min(ya + ha, yb + hb)

    inter_w = max(0, x2 - x1)
    inter_h = max(0, y2 - y1)
    inter_area = inter_w * inter_h

    area_a = wa * ha
    area_b = wb * hb
    union_area = area_a + area_b - inter_area
    if union_area <= 0:
        return 0.0
    return inter_area / float(union_area)


def is_box_contained(inner: List[int], outer: List[int], margin: int = 5) -> bool:
    """Check if inner box is geometrically inside outer box within margin."""
    xi, yi, wi, hi = inner
    xo, yo, wo, ho = outer
    return (
        xi >= xo - margin and
        yi >= yo - margin and
        (xi + wi) <= (xo + wo + margin) and
        (yi + hi) <= (yo + ho + margin)
    )


class ShapeDetector:
    """Detects rectangular, cylindrical, and container shapes in architecture diagrams."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config

    def classify_contour_shape(self, cnt: np.ndarray, bbox: List[int]) -> str:
        """Classify geometric shape (rectangle, cylinder, circle, container)."""
        x, y, w, h = bbox
        area = cv2.contourArea(cnt)
        hull = cv2.convexHull(cnt)
        hull_area = cv2.contourArea(hull)
        solidity = float(area) / max(hull_area, 1.0)
        perimeter = cv2.arcLength(cnt, True)
        if perimeter == 0:
            return "rectangle"

        circularity = 4 * np.pi * (area / (perimeter * perimeter))
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)
        num_vertices = len(approx)

        # Circle or Oval
        if circularity > 0.80 and 0.8 <= (float(w) / max(h, 1)) <= 1.25:
            return "circle"
        if num_vertices > 6 and circularity > 0.65 and (solidity > 0.90):
            return "oval"

        # Check for cylinder (Database icon): usually vertical cylinder with curved caps
        # Has high aspect ratio, but contour approximation often gives 6-8 vertices or smooth sides
        aspect_ratio = float(h) / max(w, 1)
        if 0.5 <= aspect_ratio <= 2.2:
            # Check curvature of top and bottom sections
            if 5 <= num_vertices <= 10 and solidity > 0.85:
                # Potential cylinder or rounded rectangle
                return "cylinder" if aspect_ratio > 0.8 else "rounded_rectangle"

        if num_vertices == 4 or solidity > 0.88:
            return "rectangle"

        return "rectangle"

    def detect_candidate_boxes(self, img_bgr: np.ndarray) -> List[Dict[str, Any]]:
        """Multi-cue contour and edge detection for all candidate shape boundaries."""
        h, w = img_bgr.shape[:2]
        total_area = h * w
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

        candidates: List[Dict[str, Any]] = []

        # 1. Edge-based Contours (Canny + Adaptive Threshold)
        edges = cv2.Canny(gray, 30, 150)
        # Dilate slightly to close broken line gaps
        kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges_closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_close)

        cnts1, hier1 = cv2.findContours(edges_closed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        # 2. Threshold-based Contours (Foreground Shapes)
        _, thresh = cv2.threshold(gray, 245, 255, cv2.THRESH_BINARY_INV)
        cnts2, hier2 = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        # 3. Color saturation regions
        hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
        sat_mask = cv2.inRange(hsv, np.array([0, 30, 40]), np.array([180, 255, 250]))
        sat_closed = cv2.morphologyEx(sat_mask, cv2.MORPH_CLOSE, kernel_close)
        cnts3, _ = cv2.findContours(sat_closed, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        # Filled light cards on colored containers may have no dark outline.
        # Detect their low-contrast boundaries, then require a real color step
        # across the contour so background grid cells remain rejected.
        soft_edges = cv2.Canny(gray, 10, 40)
        kernel_close_5 = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        soft_edges = cv2.morphologyEx(soft_edges, cv2.MORPH_CLOSE, kernel_close_5)
        cnts4, _ = cv2.findContours(soft_edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

        # Local thresholding recovers boundaries whose contrast varies across
        # a gradient or colored background. The same perimeter and silhouette
        # checks below apply, so threshold regions are not automatically nodes.
        adaptive=cv2.adaptiveThreshold(gray,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV,31,12)
        cnts5,_=cv2.findContours(adaptive,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)

        all_cnts = list(cnts1) + list(cnts2) + list(cnts3) + list(cnts4) + list(cnts5)

        min_area = self.config.get("min_node_area", 1200)
        min_dim = self.config.get("min_node_dim", 24)
        supported_ink = cv2.dilate((gray < 205).astype(np.uint8), np.ones((3, 3), np.uint8))

        for cnt in all_cnts:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            c_area = bw * bh

            if bw < min_dim or bh < min_dim or c_area < min_area:
                continue

            # Don't take whole image frame
            if bw > w * 0.98 and bh > h * 0.98:
                continue

            aspect = float(bw) / max(bh, 1)
            # Filter out long thin lines (connectors) while preserving wide cylinder caps
            if aspect > 25.0 or aspect < (1.0 / 25.0):
                continue

            # Grid cells, connector intersections, and shadows can form closed
            # Canny contours. Require real ink along the contour and a compact
            # enclosed silhouette before treating it as a component.
            perimeter_mask = np.zeros((bh, bw), np.uint8)
            cv2.drawContours(perimeter_mask, [cnt - np.array([[[bx, by]]])], -1, 1, 1)
            support = float(np.mean(supported_ink[by:by+bh, bx:bx+bw][perimeter_mask > 0]))
            contour_area = cv2.contourArea(cnt)
            hull_area = cv2.contourArea(cv2.convexHull(cnt))
            fill_step = False
            if support < .85:
                x0,y0,x1,y1=max(0,bx-5),max(0,by-5),min(w,bx+bw+5),min(h,by+bh+5)
                region = img_bgr[y0:y1,x0:x1]
                filled = np.zeros(region.shape[:2], np.uint8)
                cv2.drawContours(filled,[cnt-np.array([[[x0,y0]]])],-1,1,-1)
                eroded = cv2.erode(filled,np.ones((5,5),np.uint8))
                dilated = cv2.dilate(filled,np.ones((7,7),np.uint8))
                inner = region[eroded > 0]
                outer = region[(dilated > 0) & (filled == 0)]
                if len(inner) and len(outer):
                    fill_step = np.linalg.norm(np.median(inner,axis=0)-np.median(outer,axis=0)) >= 24
            if (support < .85 and not fill_step) or contour_area / max(1, c_area) < .50 or contour_area / max(1, hull_area) < .72:
                continue

            # Filter hollow non-stroke bounding regions (open whitespace between lines)
            roi_gray = gray[by:by+bh, bx:bx+bw]
            top_b = roi_gray[0:min(3, bh), :]
            bot_b = roi_gray[max(0, bh - 3):, :]
            left_b = roi_gray[:, 0:min(3, bw)]
            right_b = roi_gray[:, max(0, bw - 3):]
            border_pix = np.concatenate([top_b.flatten(), bot_b.flatten(), left_b.flatten(), right_b.flatten()])
            border_stroke_frac = float(np.mean(border_pix < 205))

            inner_my = int(bh * 0.15)
            inner_mx = int(bw * 0.15)
            inner_gray = roi_gray[inner_my:bh-inner_my, inner_mx:bw-inner_mx] if (bh - 2 * inner_my > 5 and bw - 2 * inner_mx > 5) else roi_gray
            has_fill = abs(float(np.mean(inner_gray)) - 250.0) > 18.0

            side_min_stroke = min(float(np.mean(top_b < 205)), float(np.mean(bot_b < 205)),
                                  float(np.mean(left_b < 205)), float(np.mean(right_b < 205)))

            if not has_fill and not fill_step and (border_stroke_frac < 0.20 or side_min_stroke < 0.12):
                continue

            shape_type = self.classify_contour_shape(cnt, [bx, by, bw, bh])

            # Measure fill uniformity / contrast confidence
            contrast_conf = float(np.std(roi_gray)) / 128.0
            confidence = min(0.99, max(0.40, 0.65 + 0.35 * contrast_conf))

            candidates.append({
                "bbox": [bx, by, bw, bh],
                "center": [bx + bw // 2, by + bh // 2],
                "area": c_area,
                "shape": shape_type,
                "confidence": round(confidence, 3),
                "has_fill": has_fill or fill_step,
                "contour": cnt
            })

        # 5. Dashed / broken container boundaries assembled from orthogonal line segments
        lines = cv2.HoughLinesP(edges, 1, np.pi/2, threshold=40, minLineLength=40, maxLineGap=20)
        if lines is not None:
            h_segs = []
            v_segs = []
            for l in lines:
                x1, y1, x2, y2 = [int(v) for v in l.ravel()]
                if abs(y1 - y2) <= 2 and abs(x1 - x2) >= 80:
                    y = min(y1, y2)
                    xa, xb = min(x1, x2), max(x1, x2)
                    trans = max(np.sum(np.diff((gray[min(max(0, y+dy), gray.shape[0]-1), xa:xb] < 200).astype(np.uint8)) != 0) for dy in (-1, 0, 1))
                    if trans >= 6:
                        h_segs.append((y, xa, xb))
                elif abs(x1 - x2) <= 2 and abs(y1 - y2) >= 80:
                    x = min(x1, x2)
                    ya, yb = min(y1, y2), max(y1, y2)
                    trans = max(np.sum(np.diff((gray[ya:yb, min(max(0, x+dx), gray.shape[1]-1)] < 200).astype(np.uint8)) != 0) for dx in (-1, 0, 1))
                    if trans >= 6:
                        v_segs.append((x, ya, yb))

            def merge_segments(segs):
                merged = []
                for s in sorted(segs, key=lambda s: s[0]):
                    coord, a, b = s
                    placed = False
                    for i, (mc, ma, mb) in enumerate(merged):
                        if abs(coord - mc) <= 6:
                            if not (b < ma - 15 or a > mb + 15):
                                merged[i] = (round((coord + mc)/2), min(a, ma), max(b, mb))
                                placed = True
                                break
                    if not placed:
                        merged.append(s)
                return merged

            merged_h = merge_segments(h_segs)
            merged_v = merge_segments(v_segs)

            for i, (x_l, y1_l, y2_l) in enumerate(merged_v):
                for x_r, y1_r, y2_r in merged_v[i+1:]:
                    bw = x_r - x_l
                    if bw < 120 or bw > w * 0.95:
                        continue
                    y_top_cands = [h_y for h_y, h_x1, h_x2 in merged_h if abs(h_y - min(y1_l, y1_r)) <= 25 and h_x1 <= x_l + 25 and h_x2 >= x_r - 25]
                    y_bot_cands = [h_y for h_y, h_x1, h_x2 in merged_h if abs(h_y - max(y2_l, y2_r)) <= 25 and h_x1 <= x_l + 25 and h_x2 >= x_r - 25]
                    if y_top_cands and y_bot_cands:
                        y_top = min(y_top_cands)
                        y_bot = max(y_bot_cands)
                        bh = y_bot - y_top
                        if bh < 100 or bh > h * 0.95:
                            continue
                        cnt = np.array([[[x_l, y_top]], [[x_r, y_top]], [[x_r, y_bot]], [[x_l, y_bot]]], dtype=np.int32)
                        candidates.append({
                            "bbox": [x_l, y_top, bw, bh],
                            "center": [x_l + bw // 2, y_top + bh // 2],
                            "area": bw * bh,
                            "shape": "rectangle",
                            "confidence": 0.85,
                            "has_fill": False,
                            "line_style": "dashed",
                            "contour": cnt
                        })

        # Non-Maximum Suppression (NMS)
        results = self._suppress_duplicate_boxes(candidates, total_area, (w, h))
        # A shallow inner ellipse at the top distinguishes a cylinder from a
        # rounded card; bounding-box aspect ratio alone cannot do this.
        caps=[]
        for contour in cnts1:
            if len(contour)<8: continue
            x,y,cw,ch=cv2.boundingRect(contour)
            if cw<30 or ch<8 or not (.04<cw**-1*ch<.40): continue
            fill=cv2.contourArea(contour)/max(1,cw*ch)
            if not .60<fill<.88: continue
            caps.append((x,y,cw,ch))
        for candidate in results:
            if candidate.get('is_container'): continue
            x,y,cw,ch=candidate['bbox']
            for cx,cy,ww,hh in caps:
                if abs(cx-x)<cw*.08 and .80*cw<=ww<=1.08*cw and (y-hh-5<=cy<=y+ch*.35) and ch>hh*1.5:
                    candidate['shape']='cylinder'
                    if cy < y:
                        new_y = cy
                        new_h = (y + ch) - cy
                        candidate['bbox'] = [x, new_y, cw, new_h]
                        candidate['center'] = [x + cw // 2, new_y + new_h // 2]
                        candidate['area'] = cw * new_h
                    break
        return results

    def _suppress_duplicate_boxes(
        self, candidates: List[Dict[str, Any]], total_area: int, img_dims: Tuple[int, int]
    ) -> List[Dict[str, Any]]:
        """Deduplicate overlapping boxes while carefully preserving container hierarchy."""
        if not candidates:
            return []

        w_img, h_img = img_dims

        # Sort by area ascending so smaller child nodes are preserved
        candidates = sorted(candidates, key=lambda c: (c["area"], -c["confidence"]))

        iou_thresh = self.config.get("nms_iou_threshold", 0.40)
        retained: List[Dict[str, Any]] = []

        for cand in candidates:
            c_box = cand["bbox"]
            duplicate = False

            for kept in retained:
                k_box = kept["bbox"]
                overlap_iou = calculate_iou(c_box, k_box)
                if overlap_iou > iou_thresh:
                    insets=(k_box[0]-c_box[0],k_box[1]-c_box[1],c_box[0]+c_box[2]-k_box[0]-k_box[2],c_box[1]+c_box[3]-k_box[1]-k_box[3])
                    if is_box_contained(k_box,c_box,2) and kept['area'] < cand['area']*.75 and min(insets)>=8:
                        continue
                    duplicate = True
                    break

            if not duplicate:
                retained.append(cand)

        # Merge cylinder caps with bodies (e.g. database top ellipse + cylinder body)
        merged_boxes: List[Dict[str, Any]] = []
        skip_indices = set()
        for i in range(len(retained)):
            if i in skip_indices:
                continue
            b1 = retained[i]["bbox"]
            merged = False
            for j in range(len(retained)):
                if i == j or j in skip_indices:
                    continue
                b2 = retained[j]["bbox"]
                # Check horizontal IoU (both widths must be very similar)
                x_left = max(b1[0], b2[0])
                x_right = min(b1[0] + b1[2], b2[0] + b2[2])
                overlap_w = max(0, x_right - x_left)
                h_union = b1[2] + b2[2] - overlap_w
                h_iou = (overlap_w / float(h_union)) if h_union > 0 else 0.0

                # A cylinder cap is a shallow, curved contour overlapping its
                # body. Width alignment alone also merges two real services.
                cap = retained[i] if b1[3] < b2[3] else retained[j]
                cap_box = cap["bbox"]
                vertical_overlap = min(b1[1]+b1[3], b2[1]+b2[3]) - max(b1[1], b2[1])
                cap_fill = cv2.contourArea(cap["contour"]) / max(1, cap["area"])
                cap_like = cap_box[3] < cap_box[2] * 0.40 and cap_fill < .90
                if h_iou > 0.80 and cap_like and vertical_overlap >= -2:
                    y_top = min(b1[1], b2[1])
                    y_bot = max(b1[1] + b1[3], b2[1] + b2[3])
                    total_h = y_bot - y_top
                    if total_h <= (b1[3] + b2[3] + 16):
                        merged_x = min(b1[0], b2[0])
                        merged_y = y_top
                        merged_w = max(b1[0] + b1[2], b2[0] + b2[2]) - merged_x
                        merged_h = total_h
                        cand_copy = dict(retained[j])
                        cand_copy["bbox"] = [merged_x, merged_y, merged_w, merged_h]
                        cand_copy["center"] = [merged_x + merged_w // 2, merged_y + merged_h // 2]
                        cand_copy["area"] = merged_w * merged_h
                        cand_copy["shape"] = "cylinder"
                        merged_boxes.append(cand_copy)
                        skip_indices.add(i)
                        skip_indices.add(j)
                        merged = True
                        break
            if not merged:
                merged_boxes.append(retained[i])
        retained = merged_boxes

        # Distinguish Group/Container vs. Functional Component
        # A container is a large box that encloses other retained boxes
        results: List[Dict[str, Any]] = []
        for box_item in retained:
            b = box_item["bbox"]
            enclosed_count = 0
            for other in retained:
                if other is box_item:
                    continue
                if is_box_contained(other["bbox"], b, margin=4):
                    enclosed_count += 1

            # Filter out diagram bounding canvas frames (spanning >=82% width and enclosing all components)
            is_frame = b[0]<=2 and b[1]<=2 and b[0]+b[2]>=w_img-2 and b[1]+b[3]>=h_img-2 and enclosed_count>0
            is_container = (
                not is_frame and
                enclosed_count >= 1 and
                any(is_box_contained(other["bbox"], b, margin=2) and other["area"] < box_item["area"] * 0.60 for other in retained if other is not box_item)
            )

            box_item["is_container"] = is_container
            box_item["enclosed_count"] = enclosed_count
            if not is_frame:
                results.append(box_item)

        return results
