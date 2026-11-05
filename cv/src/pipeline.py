"""End-to-end unified FOCV Pipeline."""

from __future__ import annotations

import os
import json
import cv2
import numpy as np
from typing import Dict, Any, Optional, List

from cv.src.config import DEFAULT_CONFIG
from cv.src.preprocessing import PreprocessedImage
from cv.src.ocr_engine import OCREngine
from cv.src.shape_detector import ShapeDetector
from cv.src.connector_tracer import ConnectorTracer
from cv.src.association import SemanticAssociator
from cv.src.graph_builder import GraphBuilder
from cv.src.visualizer import DiagramVisualizer
from cv.src.visual_components import VisualComponentDetector
from cv.src.graph_validation import validate_graphs


class NumpyEncoder(json.JSONEncoder):
    """Custom JSON encoder for NumPy scalar and array types."""
    def default(self, obj):
        if isinstance(obj, (np.integer, np.int64, np.int32, np.int16, np.int8)):
            return int(obj)
        elif isinstance(obj, (np.floating, np.float64, np.float32, np.float16)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


class PipelineResult:
    """Encapsulates the complete outputs of an FOCV extraction run."""

    def __init__(
        self,
        architecture_graph: Dict[str, Any],
        visual_evidence_graph: Dict[str, Any],
        annotated_image: np.ndarray,
        processing_stats: Dict[str, Any]
    ):
        self.architecture_graph = architecture_graph
        self.visual_evidence_graph = visual_evidence_graph
        self.annotated_image = annotated_image
        self.processing_stats = processing_stats

    def save(self, output_dir: str, base_name: str) -> Dict[str, str]:
        """Save the dual JSON graphs and visual overlay image to disk."""
        os.makedirs(output_dir, exist_ok=True)

        arch_path = os.path.join(output_dir, f"{base_name}_architecture.json")
        evidence_path = os.path.join(output_dir, f"{base_name}_evidence.json")
        overlay_path = os.path.join(output_dir, f"{base_name}_overlay.png")

        with open(arch_path, "w", encoding="utf-8") as f:
            json.dump(self.architecture_graph, f, indent=2, cls=NumpyEncoder)

        with open(evidence_path, "w", encoding="utf-8") as f:
            json.dump(self.visual_evidence_graph, f, indent=2, cls=NumpyEncoder)

        if self.annotated_image is not None and self.annotated_image.size > 0:
            cv2.imwrite(overlay_path, self.annotated_image)

        return {
            "architecture_json": arch_path,
            "evidence_json": evidence_path,
            "overlay_image": overlay_path
        }


class FOCVPipeline:
    """Unified, fully autonomous Computer Vision Pipeline for software diagrams."""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = {**DEFAULT_CONFIG, **(config or {})}
        self.ocr_engine = OCREngine()
        self.shape_detector = ShapeDetector(self.config)
        self.connector_tracer = ConnectorTracer(self.config)
        self.associator = SemanticAssociator(self.config)
        self.visualizer = DiagramVisualizer()

    def process_image(self, image_path: str) -> PipelineResult:
        """Execute the end-to-end computer vision and OCR pipeline on a diagram file."""
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Diagram image not found at '{image_path}'")

        original_bgr = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
        if original_bgr is None:
            raise ValueError(f"Could not decode image at '{image_path}'")

        h, w = original_bgr.shape[:2]
        filename = os.path.basename(image_path)
        base_name = os.path.splitext(filename)[0]

        # 1. Preprocessing
        preprocessed = PreprocessedImage(original_bgr)
        normalized_bgr = 255 - original_bgr if preprocessed.is_dark_background else original_bgr

        # 2. Global OCR pass for words
        if not self.ocr_engine.is_available():
            raise RuntimeError("Tesseract OCR is unavailable. Install it or configure TESSERACT_CMD before auditing diagrams.")
        raw_words = self.ocr_engine.extract_words_global(normalized_bgr)

        # 3. Shape & Container Detection
        raw_shape_candidates = self.shape_detector.detect_candidate_boxes(normalized_bgr)
        symbol_detector=VisualComponentDetector()
        candidate_boxes = symbol_detector.detect(normalized_bgr, raw_shape_candidates, raw_words)

        # Separate components vs. container groups
        components = []
        containers = []
        for box_item in candidate_boxes:
            if box_item.get("is_container", False):
                containers.append({
                    "id": f"group_{len(containers)}",
                    "bbox": box_item["bbox"],
                    "center": box_item["center"],
                    "area": box_item["area"],
                    "label": ""
                })
            else:
                components.append({
                    **{key:box_item[key] for key in ('symbol_bbox','logical_bbox','label_bbox',
                        'attachment_bbox','label_words','detection_method') if key in box_item},
                    "id": f"comp_{len(components)}",
                    "bbox": box_item["bbox"],
                    "center": box_item["center"],
                    "area": box_item["area"],
                    "shape": box_item["shape"],
                    "confidence": box_item["confidence"],
                    "label": ""
                })

        # Fallback for unbordered / text-only diagrams with no drawn rectangles
        if not components and raw_words:
            components = self._cluster_unbordered_text_components(raw_words, w, h)

        # Sort components top-to-bottom, left-to-right
        components = sorted(components, key=lambda c: (c["center"][1] // 40, c["center"][0]))
        # Re-index for consistent reading order
        for idx, c in enumerate(components):
            c["id"] = f"node_{idx}"

        # 4. Targeted ROI OCR on each detected component (parallelized for low latency)
        roi_texts = {}
        pending_rois = []
        for comp in components:
            if comp.get('label_words'):
                roi_texts[comp['id']] = {
                    'text': ' '.join(t['text'] for t in comp['label_words']),
                    'confidence': float(np.mean([t['confidence'] for t in comp['label_words']])),
                    'source': 'exterior_label_words'
                }
            else:
                bx, by, bw, bh = comp["bbox"]
                roi = normalized_bgr[by:by+bh, bx:bx+bw]
                pending_rois.append((comp["id"], roi, comp.get("shape") == "cylinder"))

        if pending_rois:
            if len(pending_rois) == 1:
                cid, roi, is_cyl = pending_rois[0]
                roi_texts[cid] = self.ocr_engine.extract_text_from_roi(roi, is_cylinder=is_cyl)
            else:
                from concurrent.futures import ThreadPoolExecutor
                max_w = min(len(pending_rois), 4, os.cpu_count() or 4)
                with ThreadPoolExecutor(max_workers=max_w) as pool:
                    futures = [pool.submit(self.ocr_engine.extract_text_from_roi, roi, 120, is_cyl)
                               for _, roi, is_cyl in pending_rois]
                    for (cid, _, _), fut in zip(pending_rois, futures):
                        roi_texts[cid] = fut.result()

        # 5. Component Association & Decorative Icon Pruning
        # Associate component labels and prune decorative icon glyphs before connector tracing
        # so connector endpoints snap to genuine functional components rather than small icon decorations.
        components, containers, claimed_text_ids = self.associator.associate_components(
            components=components,
            containers=containers,
            text_blocks=raw_words,
            roi_texts=roi_texts
        )

        # 6. Connector Tracing & Arrowhead Detection
        connectors = self.connector_tracer.trace_connectors(
            original_img=original_bgr,
            gray_img=preprocessed.gray,
            components=components,
            text_blocks=raw_words,
            is_dark_bg=preprocessed.is_dark_background,
            containers=containers
        )

        # 7. Semantic Association & Grouping
        components, containers, connectors = self.associator.associate_connectors_and_hierarchy(
            components=components,
            containers=containers,
            connectors=connectors,
            text_blocks=raw_words,
            claimed_text_ids=claimed_text_ids
        )

        # 7. Build Graphs
        uncertainties = list(self.connector_tracer.uncertainties)
        uncertainties.extend({'type':'unclassified_visual_observation', **o} for o in symbol_detector.observations)
        for comp in components:
            if comp.get("confidence", 1.0) < 0.65:
                uncertainties.append({
                    "item_id": comp["id"],
                    "type": "low_confidence_node",
                    "detail": f"Node '{comp['label']}' has detection confidence {comp.get('confidence')}"
                })

        builder = GraphBuilder(filename, {"width": w, "height": h})
        evidence_graph = builder.build_visual_evidence_graph(
            raw_shapes=candidate_boxes,
            raw_words=raw_words,
            connectors=connectors,
            uncertainties=uncertainties
        )
        arch_graph = builder.build_architecture_graph(
            components=components,
            groups=containers,
            relationships=connectors
        )
        arch_graph["uncertainties"] = uncertainties
        arch_graph['annotations'] = self.associator.annotations
        evidence_graph['annotations'] = self.associator.annotations
        arch_graph['unresolved_visual_regions']=symbol_detector.observations
        evidence_graph['unresolved_visual_regions']=symbol_detector.observations
        evidence_graph['component_evidence'] = [{
            'id':c['id'], 'bbox':c['bbox'], 'label':c['label'],
            'symbol_bbox':c.get('symbol_bbox'), 'logical_bbox':c.get('logical_bbox',c['bbox']),
            'label_bbox':c.get('label_bbox'), 'detection_method':c.get('detection_method','classical_shape'),
            'ocr':roi_texts.get(c['id'],{}), 'matched_text_ids':c.get('matched_text_ids',[])
        } for c in components]
        evidence_graph['detections']['classical_shape_candidates']=[{
            'bbox':s['bbox'],'shape':s['shape'],'confidence':s['confidence'],
            'is_container':s.get('is_container',False)} for s in raw_shape_candidates]
        evidence_graph['group_evidence']=[{
            'id':g['id'],'bbox':g['bbox'],'label':g['label'],
            'parent_group_id':g.get('parent_group_id'),
            'enclosed_components':g.get('enclosed_components',[])} for g in containers]
        evidence_graph['preprocessing']={'canvas_polarity':'dark' if preprocessed.is_dark_background else 'light',
            'ocr':'Tesseract with local polarity, multiscale global and dual-polarity ROI passes',
            'coordinates':'All coordinates are in the original input image.'}
        validation=validate_graphs(arch_graph,evidence_graph)
        arch_graph['validation']=validation
        evidence_graph['validation']=validation
        if validation['errors']:
            raise ValueError('FOCV graph consistency failure: '+'; '.join(validation['errors']))

        # 8. Render Visual Overlay
        annotated_img = self.visualizer.render_overlay(
            original_img=original_bgr,
            components=arch_graph["components"],
            groups=arch_graph["groups"],
            relationships=arch_graph["relationships"]
        )

        stats = {
            "num_components": len(components),
            "num_groups": len(containers),
            "num_relationships": len(connectors),
            "num_ocr_words": len(raw_words),
            "is_dark_background": preprocessed.is_dark_background
        }

        return PipelineResult(
            architecture_graph=arch_graph,
            visual_evidence_graph=evidence_graph,
            annotated_image=annotated_img,
            processing_stats=stats
        )

    def _cluster_unbordered_text_components(self, raw_words: List[Dict[str, Any]], img_w: int, img_h: int) -> List[Dict[str, Any]]:
        """Cluster adjacent floating text into virtual component boundaries for borderless diagrams."""
        words = [w for w in raw_words if len(w["text"]) > 1 and w.get("confidence", 0) > 0.40 and any(c.isalnum() for c in w["text"])]
        clusters = []
        used = set()
        for i, w1 in enumerate(words):
            if i in used:
                continue
            cluster = [w1]
            used.add(i)
            bx, by, bw, bh = w1["bbox"]
            for j, w2 in enumerate(words):
                if j in used:
                    continue
                x2, y2, w2b, h2 = w2["bbox"]
                if abs(by - y2) < 20 and (abs(x2 - (bx + bw)) < 35 or abs(bx - (x2 + w2b)) < 35):
                    cluster.append(w2)
                    used.add(j)
                    bx = min(bx, x2)
                    by = min(by, y2)
                    bw = max(bx + bw, x2 + w2b) - bx
                    bh = max(by + bh, y2 + h2) - by
            clusters.append(cluster)

        components = []
        protocol_words = {"http", "https", "grpc", "rest", "sql", "get", "set", "post", "put", "delete", "query"}
        for i, cl in enumerate(clusters):
            cl_sorted = sorted(cl, key=lambda w: w["bbox"][0])
            label = " ".join(w["text"] for w in cl_sorted).strip()
            if label.lower() in protocol_words:
                continue
            x = min(w["bbox"][0] for w in cl)
            y = min(w["bbox"][1] for w in cl)
            cw = max(w["bbox"][0] + w["bbox"][2] for w in cl) - x
            ch = max(w["bbox"][1] + w["bbox"][3] for w in cl) - y
            pad = 8
            bbox = [max(0, x - pad), max(0, y - pad), cw + 2*pad, ch + 2*pad]
            components.append({
                "id": f"comp_{len(components)}",
                "bbox": bbox,
                "center": [bbox[0] + bbox[2] // 2, bbox[1] + bbox[3] // 2],
                "area": bbox[2] * bbox[3],
                "shape": "text_block",
                "confidence": 0.70,
                "label": label
            })
        return components
