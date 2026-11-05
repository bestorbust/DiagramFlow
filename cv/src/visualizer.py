"""Visualization of detected components, groups, connectors, and labels."""

from __future__ import annotations

import cv2
import numpy as np
from typing import List, Dict, Any


# Type-based BGR color map
ROLE_COLORS = {
    "Ingress/Client": (255, 120, 0),         # Bright Blue
    "Gateway/Proxy": (255, 180, 0),          # Cyan / Blue
    "Microservice/Compute": (0, 200, 50),     # Vibrant Green
    "Storage/Database": (0, 140, 255),       # Orange
    "MessageQueue/EventStream": (180, 0, 200),# Purple
    "Default": (0, 180, 0)
}


class DiagramVisualizer:
    """Renders visual overlays of the extracted graph onto the original diagram."""

    def render_overlay(
        self,
        original_img: np.ndarray,
        components: List[Dict[str, Any]],
        groups: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]]
    ) -> np.ndarray:
        """Render annotated bounding boxes, connectors, arrows, and labels onto canvas."""
        canvas = original_img.copy()

        # 1. Draw Containers / Groups
        for g in groups:
            gx = g["bounding_box"]["x"]
            gy = g["bounding_box"]["y"]
            gw = g["bounding_box"]["width"]
            gh = g["bounding_box"]["height"]
            cv2.rectangle(canvas, (gx, gy), (gx + gw, gy + gh), (160, 160, 160), 2)
            cv2.putText(
                canvas,
                f"GROUP: {g['label']}",
                (gx + 6, max(18, gy - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (100, 100, 100),
                2,
                cv2.LINE_AA
            )

        # 2. Draw Connectors & Relationships
        comp_lookup = {c["id"]: c for c in components+groups}
        for rel in relationships:
            src = comp_lookup.get(rel["source"])
            tgt = comp_lookup.get(rel["target"])
            if not src or not tgt:
                continue

            waypoints = rel.get("waypoints") or [src["center"], tgt["center"]]
            sx, sy = waypoints[0]
            tx, ty = waypoints[-1]
            direction = rel.get("direction", "forward")

            line_color = (0, 0, 240)  # Red connector stroke
            if direction == "bidirectional":
                line_color = (200, 0, 200)  # Magenta for bidirectional
            elif direction == "undirected":
                line_color = (180, 100, 0)  # Deep blue

            cv2.polylines(canvas, [np.asarray(waypoints, dtype=np.int32)], False, line_color, 2, cv2.LINE_AA)

            # Draw Arrowhead indicator
            if direction in ("forward", "bidirectional"):
                # Arrow at target
                previous=next((p for p in reversed(waypoints[:-1]) if np.linalg.norm(np.array(p)-[tx,ty])>=12),waypoints[-2])
                length=max(1,float(np.linalg.norm(np.array(previous)-[tx,ty])))
                cv2.arrowedLine(canvas, tuple(previous), (tx, ty), line_color, 2, tipLength=min(.35,10/length))
            if direction == "bidirectional":
                # Arrow at source
                following=next((p for p in waypoints[1:] if np.linalg.norm(np.array(p)-[sx,sy])>=12),waypoints[1])
                length=max(1,float(np.linalg.norm(np.array(following)-[sx,sy])))
                cv2.arrowedLine(canvas, tuple(following), (sx, sy), line_color, 2, tipLength=min(.35,10/length))

            # Original connector labels stay visible; extracted text is stored
            # on the relationship instead of being painted over nearby nodes.

        # 3. Draw Components
        for comp in components:
            box = comp["bounding_box"]
            bx, by, bw, bh = box["x"], box["y"], box["width"], box["height"]
            c_type = comp.get("type", "Default")
            color = ROLE_COLORS.get(c_type, ROLE_COLORS["Default"])

            # Highlight bounding box
            cv2.rectangle(canvas, (bx, by), (bx + bw, by + bh), color, 2)

            # Header pill
            label = comp.get("label", comp["id"])
            pill_text = f"{comp['id']}: {label}"
            font_scale = 0.45
            (tw, th), _ = cv2.getTextSize(pill_text, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
            if tw>bw:
                # Preserve the original exterior label instead of covering
                # adjacent symbols with a repeated OCR banner.
                pill_text=comp['id']
                (tw,th),_=cv2.getTextSize(pill_text,cv2.FONT_HERSHEY_SIMPLEX,font_scale,1)

            # Draw text banner
            banner_y = max(th + 4, by)
            cv2.rectangle(
                canvas,
                (bx, banner_y - th - 6),
                (bx + tw + 6, banner_y + 2),
                color,
                -1
            )
            cv2.putText(
                canvas,
                pill_text,
                (bx + 3, banner_y - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                font_scale,
                (255, 255, 255),
                1,
                cv2.LINE_AA
            )

        return canvas

