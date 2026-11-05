"""Graph builder producing Visual Evidence Graph and Architecture Graph representations."""

from __future__ import annotations

import datetime
from typing import List, Dict, Any


class GraphBuilder:
    """Builds dual-layer graph representations: Visual Evidence and LLM Architecture JSON."""

    def __init__(self, filename: str, img_dims: Dict[str, int]):
        self.filename = filename
        self.width = img_dims.get("width", 0)
        self.height = img_dims.get("height", 0)

    def build_visual_evidence_graph(
        self,
        raw_shapes: List[Dict[str, Any]],
        raw_words: List[Dict[str, Any]],
        connectors: List[Dict[str, Any]],
        uncertainties: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Construct the complete, audit-ready raw Visual Evidence Graph."""
        return {
            "schema_type": "VisualEvidenceGraph",
            "metadata": {
                "source_file": self.filename,
                "dimensions": {"width": self.width, "height": self.height},
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "focv_version": "2.1.0",
                "confidence_semantics": "Heuristic evidence quality, not calibrated correctness probability."
            },
            "detections": {
                "candidate_shapes": [
                    {
                        "bbox": s["bbox"],
                        "center": s["center"],
                        "area": s["area"],
                        "classified_shape": s["shape"],
                        "confidence": s["confidence"],
                        "is_container": s.get("is_container", False)
                    }
                    for s in raw_shapes
                ],
                "ocr_tokens": [
                    {
                        "id": w["id"],
                        "text": w["text"],
                        "bbox": w["bbox"],
                        "center": w["center"],
                        "confidence": w["confidence"]
                        ,"ocr_scale": w.get("ocr_scale", 1.0),
                        "kind": w.get("kind", "text")
                    }
                    for w in raw_words
                ],
                "connector_traces": [
                    {
                        "id": c["id"],
                        "source": c["source"],
                        "target": c["target"],
                        "endpoints": c["endpoints"],
                        "waypoints": c["waypoints"],
                        "pixel_length": c["pixel_length"],
                        "detected_direction": c["direction"],
                        "arrowhead_evidence": c.get("arrowhead_evidence", {}),
                        "source_kind": c.get("source_kind", "component"),
                        "target_kind": c.get("target_kind", "component"),
                        "label": c.get("label", ""),
                        "confidence": c["confidence"]
                    }
                    for c in connectors
                ]
            },
            "uncertainties": uncertainties
        }

    def build_architecture_graph(
        self,
        components: List[Dict[str, Any]],
        groups: List[Dict[str, Any]],
        relationships: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Construct clean, evidence-grounded, LLM-ready Architecture JSON."""
        # Clean component structure for LLM ingestion
        clean_components = [
            {
                "id": c["id"],
                "label": c["label"],
                "type": c.get("type", "Microservice/Compute"),
                "type_is_inferred": True,
                "type_evidence": "Label terms and visible shape; no service-icon classifier.",
                "shape": c.get("shape", "rectangle"),
                "physical_bbox": c.get("symbol_bbox", c["bbox"]),
                "logical_bbox": c.get("logical_bbox", c["bbox"]),
                "label_bbox": c.get("label_bbox"),
                "detection_method": c.get("detection_method", "classical_shape"),
                "bounding_box": {
                    "x": c["bbox"][0],
                    "y": c["bbox"][1],
                    "width": c["bbox"][2],
                    "height": c["bbox"][3]
                },
                "center": c["center"],
                "parent_group": c.get("parent_group_label"),
                "parent_group_id": c.get("parent_group_id"),
                "ocr_confidence": c.get("ocr_confidence"),
                "matched_text_ids": c.get("matched_text_ids", []),
                "confidence": c.get("confidence", 0.90)
            }
            for c in components
        ]

        clean_groups = [
            {
                "id": g["id"],
                "label": g["label"],
                "bounding_box": {
                    "x": g["bbox"][0],
                    "y": g["bbox"][1],
                    "width": g["bbox"][2],
                    "height": g["bbox"][3]
                },
                "enclosed_components": g.get("enclosed_components", []),
                "parent_group_id": g.get("parent_group_id"),
                "child_groups": g.get("child_groups", [])
            }
            for g in groups
        ]

        clean_relationships = [
            {
                "id": r["id"],
                "source": r["source"],
                "source_label": r.get("source_label", ""),
                "target": r["target"],
                "target_label": r.get("target_label", ""),
                "direction": r.get("direction", "forward"),
                "label": r.get("label", ""),
                "confidence": r.get("confidence", 0.85)
                ,"waypoints": r.get("waypoints", []),
                "arrowhead_evidence": r.get("arrowhead_evidence", {}),
                "source_kind": r.get("source_kind", "component"),
                "target_kind": r.get("target_kind", "component"),
                "endpoints": r.get("endpoints", [])
            }
            for r in relationships
        ]

        # Architectural Inferences
        entrypoints = [c["label"] for c in clean_components if c["type"] in ("Ingress/Client", "Gateway/Proxy")]
        databases = [c["label"] for c in clean_components if c["type"] == "Storage/Database"]
        services = [c["label"] for c in clean_components if c["type"] == "Microservice/Compute"]

        return {
            "diagram_metadata": {
                "source_file": self.filename,
                "dimensions": {"width": self.width, "height": self.height},
                "extracted_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
            },
            "architecture_summary": {
                "total_components": len(clean_components),
                "total_relationships": len(clean_relationships),
                "total_groups": len(clean_groups),
                "entrypoint_components": entrypoints,
                "storage_components": databases,
                "service_components": services
            },
            "components": clean_components,
            "groups": clean_groups,
            "relationships": clean_relationships
        }

