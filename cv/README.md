# DiagramFlow FOCV: Architecture Diagram Understanding Engine

> **Fully Optical Computer Vision (FOCV)** pipeline designed to autonomously convert software architecture diagrams into structured, evidence-grounded graphs for downstream textual LLM requirements verification.

---

## 1. System Overview & Philosophy

DiagramFlow FOCV extracts architectural semantics directly from visual raster pixels **without relying on multimodal vision-language models (VLMs)**. The pipeline operates under strict visual evidence constraints: components, connectors, labels, arrow directions, and nested group hierarchies are extracted purely using classical Computer Vision (OpenCV, SciPy, NumPy) and OCR (Tesseract).

### Two Complementary Graph Representations

1. **Architecture Graph (`*_architecture.json`)**:
   - Clean, normalized, semantic representation designed for consumption by downstream reasoning LLMs.
   - Contains components with functional roles (`Storage/Database`, `Ingress/Client`, `Gateway/Proxy`, `Microservice/Compute`), grouped containers (`VPC`, `Subnet`, `Tier`), directed relationships (`forward`, `bidirectional`, `undirected`), and protocol/intent labels (`HTTP`, `SQL queries`, `command reply`).

2. **Visual Evidence Graph (`*_evidence.json`)**:
   - Grounded detection layer detailing bounding boxes `[x, y, w, h]`, classified contours, confidence scores, raw OCR tokens with geometry, connector waypoints, and flagged visual ambiguities.
   - Enables full traceability and auditability back to pixel coordinates.

---

## 2. End-to-End Pipeline Architecture & Workflow

```
   [ Input Diagram Image ] (PNG / JPEG / WebP)
              │
              ▼
   ┌───────────────────────────────────────────────┐
   │ Stage 1: Preprocessing & Canvas Normalization │ ──► Border luminance sampling, auto-inversion
   └───────────────────────────────────────────────┘     for dark-mode canvas backgrounds.
              │
              ├──► [ Stage 2: Multi-Pass Global OCR ] ──► Dual PSM 11 (sparse tokens) + PSM 3 (auto
              │                                           segmentation) with IoU token deduplication.
              │
              ├──► [ Stage 3: Multi-Cue Shape Detector ] ──► 5 complementary CV passes:
              │                                               1. Canny edges + (3x3) morphological close
              │                                               2. Foreground thresholding (THRESH_BINARY_INV)
              │                                               3. HSV color saturation mask
              │                                               4. Soft Canny edges + (5x5) bridge close
              │                                               5. Orthogonal dashed container assembly
              │                                               Hierarchical NMS & component vs group split.
              ▼
   ┌───────────────────────────────────────────────┐
   │ Stage 4: Component Association & Icon Pruning │ ──► Inset ROI OCR extraction, component label binding,
   └───────────────────────────────────────────────┘     prunes small icon badges before connector tracing.
              │
              ▼
   ┌───────────────────────────────────────────────┐
   │ Stage 5: Connector Tracing & Directionality   │ ──► (17x17) solid container fill background suppression,
   └───────────────────────────────────────────────┘     container local contrast, morphological skeletonization,
              │                                           dual-endpoint arrowhead contour & corner detection.
              ▼
   ┌───────────────────────────────────────────────┐
   │ Stage 6: Global Association & Group Hierarchy │ ──► Multi-word / stacked edge label clustering, global
   └───────────────────────────────────────────────┘     nearest-polyline assignment, container contiguous title
              │                                           clustering, spatial enclosed hierarchy resolution.
              ▼
   [ Architecture Graph + Visual Evidence Graph + Annotated Debug Overlay ]
```

---

## 3. Core Computer Vision Algorithms & Innovations

### 1. Multi-Cue Shape Detection & Dashed Container Assembly
- **Multi-Cue Contours:** Combines dark stroke Canny edge detection, binary foreground thresholding, HSV saturation masks (for pastel/colored cards), and soft-edge closing to capture components regardless of visual style.
- **Orthogonal Dashed Container Assembly:** Standard 2D closing kernels either fail to bridge $8\text{px}$ dash gaps or physically weld crossing connectors to dashed borders. The engine uses probabilistic Hough transforms (`maxLineGap=20`) to extract orthogonal lines, validates periodic alternating ink transitions ($\text{transitions} \ge 6$) within a 3-pixel neighborhood, merges collinear segments, and constructs rectangular bounding boxes for dashed zones (e.g. multi-tier containers, Kubernetes pods).

### 2. Solid Container Background Suppression & Local Contrast
- **The Challenge:** Solid colored container fills (e.g. blue VPC or beige subnet rectangles) can create massive binary blobs ($>150,000\text{px}$) that flood skeletonization. Naive $(9 \times 9)$ opening erodes $12\text{px}$ solid arrowhead triangles, destroying edge directionality.
- **The Algorithm:** A $(17 \times 17)$ morphological opening structuring element isolates and subtracts massive 2D container fill areas while preserving thin connector strokes and $10\text{–}12\text{px}$ triangle arrowheads. Inside dark/colored containers ($c_{\text{bg}} < 150$), light connector strokes ($\text{gray} > c_{\text{bg}} + 25$) are extracted via adaptive local contrast.

### 3. Pre-Trace Association & Decorative Icon Pruning
- **Pipeline Structure:** Decoupled association into Phase 1 (`associate_components`) and Phase 2 (`associate_connectors_and_hierarchy`). Small decorative cloud icon badges ($< 48\text{px}$) sitting inside or beside cards are associated and pruned *prior to connector tracing*. This guarantees connector endpoints snap directly to genuine functional component cards rather than tiny decorative glyphs.

### 4. Global Multi-Word Edge Label Clustering & Assignment
- **The Problem:** Sequential connector iteration greedily claimed words within distance thresholds, causing diagonal connectors to steal vertically stacked words belonging to neighbouring horizontal lines.
- **The Algorithm:** Unclaimed text tokens are clustered *first* into coherent multi-word phrases and vertically stacked lines (horizontal gap $\le 30\text{px}$, vertical gap $\le 25\text{px}$ with horizontal overlap $\ge 10\text{px}$). Each candidate cluster is globally matched to candidate connector polylines using minimum boundary distance ($\min(d_{\text{box}}, d_{\text{center}})$), ensuring unambiguous attribution.

### 5. Multi-Pass Hybrid OCR with IoU Deduplication
- Neither PSM 11 (sparse text) nor PSM 3 (automatic segmentation) alone captures all architectural text tokens without omissions. The engine executes both passes globally and deduplicates tokens via bounding-box Intersection-over-Union (IoU $\ge 0.50$), producing complete token discovery.

### 6. Endpoint Arrowhead Detection & Ordered Directionality
- Evaluates stroke endpoints within $16\text{px}$ of component perimeters using:
  - Contour convexity and triangular geometric compactness.
  - Perpendicular transverse stroke-width flaring ($3\text{px} \to 12\text{px}$).
  - Shi-Tomasi corner detection and gradient orientation.
  - Direction scoring distinguishes `forward`, `backward`, `bidirectional`, and `undirected`.

---

## 4. Benchmark & Verification Results

### Evaluation Evidence and Scope
Fresh manual-review run (4 Nov 2026): 45 available images were processed uncached: 27 repository diagrams, 8 generated stress images and 10 external architecture samples. All originals and fresh overlays were manually reviewed. Exact component-count agreement was 33/45 (73.3%), with mean absolute count error 0.80; exact relationship-count agreement was 28/45 (62.2%), with mean absolute count error 1.42. These are count-only descriptive measures, not object-level precision/recall/F1: equal totals can hide missed and spurious detections or incorrect topology. Three pairs are pixel-identical (42 unique rasters among 45 paths). Per-image ledger with confidence/notes is `validation/manual_review/manual_counts.csv`; aggregate summary is `validation/manual_review/manual_count_summary.json`; fresh outputs and overlays are under `validation/manual_review/run_20261104/`.

The older checked-in strict evaluator reports perfect agreement on its 18 annotated development cases, but those annotations are not held out and have not been independently audited. It must not be described as 100% system accuracy or generalized to all images. The fresh manual counts show non-perfect agreement and still do not establish object identity/topology accuracy. For those metrics, annotate individual objects/edges and match one-to-one under a declared policy.

The older claim of perfect precision/recall/F1 across all reference diagrams is unsupported as a generalization claim. The legacy `cv/evaluate_all.py` evaluator uses exact-label greedy matching and its metric scope differs from the stricter independent evaluator; use the independent report for the counts above and disclose its annotation limits.

### Legacy evaluator (`cv/evaluate_all.py`)
The script can calculate scores for the entries in `cv/evaluation/ground_truth.json` when the image corpus is available. Treat its result as a development-set measurement only and inspect skipped files, per-diagram counts, and matching rules; do not repeat prior blanket 100% claims without a fresh run and verified annotations.

### Independent Parallel Verification Harness
The saved run completed 35 cases in 40.02 seconds wall-clock with 3 workers. This run included 10 project reference cases, 8 procedural stress cases, and 17 additional corpus cases. Only the 18 cases with annotations can be scored; all 18 are complete for their annotated scope under the saved strict scorer. This does not mean all 35 were scored or that future inputs will score perfectly. Hardware details were not recorded, so the elapsed time is not a portable latency claim.

---

## 5. Directory Structure & Key Files

```text
cv/
├── src/
│   ├── pipeline.py            # Unified end-to-end FOCVPipeline orchestrator
│   ├── config.py              # Configuration constants & Tesseract auto-discovery
│   ├── preprocessing.py       # Image decoding, canvas polarity, contrast normalization
│   ├── ocr_engine.py          # Multi-pass global tokenization & margin-trimmed ROI OCR
│   ├── shape_detector.py      # Multi-cue contour detector & orthogonal dashed boundary assembly
│   ├── connector_tracer.py    # Skeleton thinning, solid blob suppression, directional arrowhead detection
│   ├── association.py         # Global multi-word label clustering, container titles & group hierarchy
│   ├── graph_builder.py       # Dual-graph compiler (ArchitectureGraph + VisualEvidenceGraph)
│   └── visualizer.py          # Visual debug overlay renderer
├── tests/
│   ├── test_connectors.py     # Endpoint pairing & stroke thinning tests
│   ├── test_shapes.py         # Cylinder caps & shape classification tests
│   ├── test_ocr.py            # Tokenization & ROI extraction tests
│   ├── test_pipeline.py       # Dual-graph integration tests
│   ├── test_independent_verification.py # Procedural benchmark tests
│   └── test_topology_regressions.py      # 16 regression tests for complex topologies
├── data/
│   └── diagrams/              # Benchmark diagram corpus (diagram1.png - diagram27.png)
├── evaluation/
│   └── ground_truth.json      # Ground truth annotations and evaluation scopes
├── evaluate_all.py            # Benchmark evaluation harness
└── README.md                  # Engine documentation (this file)
```

---

## 6. Execution Instructions

### Run Automated Tests
```powershell
# Run the 44 unit and regression tests (~15-30s)
python -m pytest cv/tests
```

### Run Benchmark Evaluation
```powershell
# Evaluate accuracy against ground truth annotations
python cv/evaluate_all.py
```

### Run Full Parallel Independent Harness
```powershell
# Verify all 35 diagrams in parallel
python validation/independent/run_parallel.py --output validation/independent/verified --novel validation/independent/generated/ground_truth.json --workers 3
```

### Process an Individual Diagram via Python API
```python
from cv.src.pipeline import FOCVPipeline

pipeline = FOCVPipeline()
result = pipeline.process_image("cv/data/diagrams/diagram27.png")

# Dual graph access
architecture_graph = result.architecture_graph
evidence_graph = result.visual_evidence_graph

# Save artifacts to disk
paths = result.save(output_dir="outputs/diagram27", base_name="diagram27")
print(f"Architecture Graph: {paths['architecture_json']}")
print(f"Visual Evidence Graph: {paths['evidence_json']}")
print(f"Overlay Image: {paths['overlay_image']}")
```

---

## 7. Output Artifacts

For each processed image `diagramX.png`, three artifacts are produced:
1. `diagramX_architecture.json`: Semantic graph representation with component roles, relationships, directions, edge labels, and nested groups.
2. `diagramX_evidence.json`: Visual evidence layer with bounding boxes, OCR tokens with geometry and confidence scores, connector waypoints, and uncertainties.
3. `diagramX_overlay.png`: High-resolution visual overlay illustrating detected components, group containers, and connector paths.
