import React, { useState } from 'react';
import {
  X,
  BookOpen,
  Layers,
  Cpu,
  FileText,
  ShieldAlert,
  Sparkles,
  MessageSquare,
  Eye,
  CheckCircle,
  ArrowRight,
  Code,
  Box,
  GitBranch,
  Search,
  ChevronRight,
  Terminal,
  Activity
} from '../icons';

const WORKFLOW_STAGES = [
  {
    id: 'stage-1',
    num: '01',
    title: 'Preprocessing & Contrast Normalization',
    subtitle: 'Border luminance sampling, CLAHE enhancement, and solid fill isolation',
    category: 'Classical Computer Vision',
    icon: Eye,
    color: 'from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30',
    badge: 'Deterministic CV',
    summary: 'Normalizes arbitrary software diagrams (dark/light themes, JPEG artifacts, screenshot scaling) into a high-contrast binary stroke map.',
    deepDive: [
      {
        heading: 'Border Luminance Sampling & Polarity Inversion',
        detail: 'Samples pixel intensities along the 2% outer perimeter margin to measure the true canvas background. If border median luminance < 110, the canvas is classified as dark mode and bitwise inverted (255 - I) to standardize on dark-ink-on-light geometry.'
      },
      {
        heading: 'Contrast Enhancement via CLAHE',
        detail: 'Applies Contrast Limited Adaptive Histogram Equalization (clipLimit = 2.0, tileGridSize = 8×8) to pop faint strokes out from colored fills and gradient backgrounds without amplifying high-frequency noise.'
      },
      {
        heading: 'Solid 2D Fill Removal & Shaft Isolation',
        detail: 'Performs morphological opening with a 17×17 rectangular kernel to isolate solid filled container interiors or solid background blocks. Subtracting these blobs isolates thin 1–5px communication connector shafts without degrading solid triangular arrowheads.'
      }
    ],
    mathSpecs: [
      { label: 'Polarity Metric', formula: 'is_dark_background = Median(Border_Pixels_2pct) < 110' },
      { label: 'CLAHE Equalization', formula: 'Enhanced_Gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8)).apply(Gray)' },
      { label: 'Solid Kernel & Shaft', formula: 'Blobs = MorphOpen(Binary, Rect(17,17)); Strokes = Binary - Blobs' }
    ],
    inputs: 'Raw uploaded diagram image (PNG, JPG, WebP)',
    outputs: 'Contrast-normalized binary stroke canvas & polarity metadata'
  },
  {
    id: 'stage-2',
    num: '02',
    title: 'Shape & Group Boundary Detection',
    subtitle: 'Multi-cue contour detection, perimeter ink support verification & container segregation',
    category: 'Classical Computer Vision',
    icon: Box,
    color: 'from-indigo-500/20 to-purple-500/20 text-purple-400 border-purple-500/30',
    badge: 'Contour Geometry',
    summary: 'Discovers functional architecture components (services, databases, queues) and separates them from enclosing grouping zones (VPCs, subnets, trust domains).',
    deepDive: [
      {
        heading: 'Multi-Cue Contour Extraction',
        detail: 'Extracts closed shape candidates across 5 complementary cues: (1) Canny edges (30, 150) with 3×3 morph close, (2) Threshold binary (245, 255), (3) HSV color saturation mask ([0,30,40] to [180,255,250]), (4) Soft Canny edges (10, 40) with 5×5 close for low-contrast borderless cards, and (5) Adaptive Gaussian thresholding (31×31 window, C=12).'
      },
      {
        heading: 'Perimeter Ink Support & Geometric Filtering',
        detail: 'Requires candidates to satisfy minimum area (A ≥ 1200px²), minimum dimension (24px), aspect ratio (1/25 ≤ w/h ≤ 25), and non-frame boundary (< 98% canvas). Verifies that ≥ 85% of the contour perimeter intersects real ink pixels (gray < 205) or exhibits an internal color step, rejecting background grid cells.'
      },
      {
        heading: 'Container vs. Component Segregation',
        detail: 'Calculates spatial containment hierarchy. Boxes encompassing one or more smaller disjoint components or occupying > 15% of the total canvas area are categorized as Container Groups (e.g. VPC, Subnet, Cluster) rather than functional compute nodes.'
      }
    ],
    mathSpecs: [
      { label: 'Polygon Approx', formula: 'Approx = cv2.approxPolyDP(Contour, ε = 0.03 * Perimeter, True)' },
      { label: 'Ink Support Ratio', formula: 'Support = Mean(Ink_Mask[Perimeter_Mask > 0]) ≥ 0.85' },
      { label: 'Container Rule', formula: 'Is_Container = True if Area(B) > 0.15 * W * H or Contains(B, Comps) ≥ 1' }
    ],
    inputs: 'Normalized binary stroke canvas & multi-cue representations',
    outputs: 'List of Components (id, bbox, center, shape) and Container Groups (id, bbox, child_nodes)'
  },
  {
    id: 'stage-3',
    num: '03',
    title: 'Multi-Pass OCR & Spatial Label Binding',
    subtitle: 'Combined PSM 11/3 global text harvest, margin-inset ROI OCR, and polyline distance binding',
    category: 'Classical Computer Vision',
    icon: FileText,
    color: 'from-emerald-500/20 to-teal-500/20 text-teal-400 border-teal-500/30',
    badge: 'Multi-Pass OCR',
    summary: 'Extracts all textual tokens without hallucination, binding service names, database labels, and protocol badges to their exact physical components.',
    deepDive: [
      {
        heading: 'Global Multi-Pass OCR & Token IoU Deduplication',
        detail: 'Runs Tesseract PSM 11 (sparse text) and PSM 3 (fully automatic segmentation) across the canvas, harvesting all word bounding boxes and confidences. Overlapping duplicate tokens from multiple passes are deduplicated with an IoU threshold of 0.45.'
      },
      {
        heading: 'Targeted ROI OCR with Cylinder Inset & CLAHE',
        detail: 'Crops component bounding boxes with a 2–4px margin inset to strip outer borders. For database cylinders, insets top by ~18% and bottom by ~8% to avoid OCR reading ellipses as "2" or "ee". Upscales small ROIs up to 3× with bicubic interpolation and evaluates across PSM 7, PSM 6, and PSM 11.'
      },
      {
        heading: 'Lexicon Normalization & Polyline Attachment',
        detail: 'Cleans OCR output with regex artifact stripping, camelCase separation, and lexicon normalization (PostgreSQL, Kafka, Redis, RabbitMQ, MongoDB, Kubernetes, Nginx, API Gateway). Binds floating labels to nearest connector polylines using point-to-polyline minimum Euclidean projection distance.'
      }
    ],
    mathSpecs: [
      { label: 'Token Deduplication', formula: 'Drop Token if IoU(B1, B2) > 0.45 and Conf1 < Conf2' },
      { label: 'Polyline Distance', formula: 'Dist(p, Path) = min_{i} PointToSegmentDist(p, w_i, w_{i+1})' },
      { label: 'Cylinder Inset', formula: 'ROI_cyl = ROI[0.18*H : H - 0.08*H, :]' }
    ],
    inputs: 'Component bounding boxes & normalized image canvas',
    outputs: 'Resolved textual labels per component, unattached edge annotations, and text occlusion masks'
  },
  {
    id: 'stage-4',
    num: '04',
    title: 'Centerline Skeletonization & Connector Tracing',
    subtitle: 'Zhang-Suen thinning, collinear stroke BFS gap bridging, and bilateral flare arrowhead resolution',
    category: 'Classical Computer Vision',
    icon: GitBranch,
    color: 'from-amber-500/20 to-orange-500/20 text-orange-400 border-orange-500/30',
    badge: 'Topology Engine',
    summary: 'Extracts exact network topology: resolves orthogonal paths, bridges broken/dashed connectors, and classifies directionality (forward, bidirectional, undirected).',
    deepDive: [
      {
        heading: 'Zhang-Suen Centerline Thinning',
        detail: 'Preserves 8-connectivity while iteratively eroding stroke boundaries into a 1-pixel wide morphological skeleton using a vectorized 2-phase sub-iteration until convergence, guaranteeing that topological junctions and orthogonal corners never break.'
      },
      {
        heading: 'Dashed & Broken Line Collinear Bridging',
        detail: 'Executes 4 bridging passes. Identifies degree-1 endpoints and traces stroke pixels with BFS (up to 20px) to compute true tangent vectors. Uses cKDTree to pair endpoints within 280px; connects them if collinear (cos θ1 > 0.85 and cos θ2 > 0.85) for dashed lines (gap ≤ 45px) or text occlusions (coverage ≥ 60%).'
      },
      {
        heading: 'Vertical Downward & Horizontal Arrowhead Verification',
        detail: 'Probes normal sweep lines (nx = -dy, ny = dx) at distance d=0..36px behind endpoints. Dynamically locates the thin connector shaft (baseline width ≤ 4.5px) and verifies bilateral flare expansion (p ≥ 3, n ≥ 3, tot ≥ baseline + 3) over ≥ 2 distance slices, reliably resolving both horizontal arrows (→, ←) and vertical downward drop arrows (| v).'
      },
      {
        heading: 'Topological Pixel Graph Compression',
        detail: 'Compresses ordered pixel chains into junctions and terminal waypoints, snapping connector endpoints to nearest component boundaries within a 30px snap radius.'
      }
    ],
    mathSpecs: [
      { label: 'Collinear Cosine', formula: 'cos(θ1) = dot(v1, d12) > 0.85 and cos(θ2) = dot(v2, -d12) > 0.85' },
      { label: 'Normal Sweep Ray', formula: 'Ray(dist, offset) = Endpoint - dir * dist + normal * offset' },
      { label: 'Dynamic Shaft Test', formula: 'Baseline = Median(Widths[d ≥ 12]) ≤ 4.5px; Flare = Widths[1..24] ≥ Baseline + 3' }
    ],
    inputs: 'Binary skeleton, component exclusion masks, OCR text masks',
    outputs: 'Traced relationships (source, target, direction: forward/bidirectional/undirected, waypoints, confidence)'
  },
  {
    id: 'stage-5',
    num: '05',
    title: 'Universal Requirements Parsing & AST Specification',
    subtitle: 'Multi-format document ingestion (pypdf, docx, YAML, JSON, TXT) and verbatim quote validation',
    category: 'Requirements Engineering',
    icon: FileText,
    color: 'from-pink-500/20 to-rose-500/20 text-rose-400 border-rose-500/30',
    badge: 'AST Compiler',
    summary: 'Parses engineering requirement specifications into a normalized Abstract Syntax Tree of expected components, allowed connectors, protocol rules, and security zones.',
    deepDive: [
      {
        heading: 'Universal Document Ingestion',
        detail: 'Extracts clean text and architectural structure from PDF (via pypdf PdfReader), Word (.docx via python-docx), structured YAML/JSON, CSV/TSV, and Markdown specifications, preserving section structure.'
      },
      {
        heading: 'Strict Pydantic Schema Compilation',
        detail: 'Compiles requirements into typed Pydantic models: Entity (id, label, aliases, role, zone, description, source_quote), Flow (source, target, direction, protocol, purpose, source_quote), and Zone (id, name, contains_components, source_quote).'
      },
      {
        heading: 'Zero-Hallucination Verbatim Source Quote Invariant',
        detail: 'Enforces strict grounding: every single source_quote in components, flows, and zones must be an exact verbatim substring within the raw input requirements document (quote in source_normal), rejecting ungrounded LLM extractions.'
      }
    ],
    mathSpecs: [
      { label: 'Entity Schema', formula: 'Entity = { id: str, label: str, aliases: list[str], role: str, source_quote: str }' },
      { label: 'Flow Schema', formula: 'Flow = { source: str, target: str, direction: str, protocol: str, source_quote: str }' },
      { label: 'Grounding Invariant', formula: 'Valid_AST ⇔ ∀ item ∈ AST, item.source_quote ∈ Source_Text' }
    ],
    inputs: 'Requirements file (PDF, DOCX, TXT, YAML, JSON, MD)',
    outputs: 'Parsed Requirements AST (expected components, expected relationships, protocols, security boundaries)'
  },
  {
    id: 'stage-6',
    num: '06',
    title: 'Dual-Graph Mathematical Alignment & Discrepancy Auditing',
    subtitle: 'Graph difference engine with categorized compliance validation and alignment scoring',
    category: 'Formal Audit Engine',
    icon: ShieldAlert,
    color: 'from-rose-500/20 to-red-500/20 text-rose-400 border-rose-500/30',
    badge: 'Deterministic Diff',
    summary: 'Compares the Visual Architecture Graph against the Requirements AST, mathematically identifying every architectural flaw, missing queue, and unapproved path.',
    deepDive: [
      {
        heading: 'Deterministic Entity Alignment',
        detail: 'Matches extracted visual components to requirements entities using normalized alphanumeric character compacting with declared aliases and optional "service" suffix equivalence, flagging ambiguous multi-matches for engineer review.'
      },
      {
        heading: 'Formal Discrepancy Taxonomy',
        detail: 'Audits every path and flags violations into formal categories: Missing Components (HIGH), Undocumented Shadow Components (LOW), Missing / Unresolved Flows (HIGH), Reversed Flow Directions (HIGH), Explicitly Forbidden Flows (CRITICAL), and Unconfirmed Security Zones (MEDIUM).'
      },
      {
        heading: 'Verified-Check Ratio Alignment Score',
        detail: 'Computes a deterministic, defensible alignment score (0.0% to 100.0%) as the exact percentage of explicit structural requirement checks (mandatory components, directional flows, and security zones) confirmed in the extracted diagram graph.'
      }
    ],
    mathSpecs: [
      { label: 'Alignment Score', formula: 'Score (%) = round(100 * N_verified / N_checked, 1)' },
      { label: 'Checked Domain', formula: 'Checked = Req_Components + Explicit_Flows + Declared_Zones' },
      { label: 'Verification Criteria', formula: 'Verified = { c ∈ Matched_Nodes } + { f ∈ Matched_Edges } + { z ∈ Confirmed_Boundaries }' }
    ],
    inputs: 'Visual Architecture Graph & Requirements AST',
    outputs: 'Discrepancy Report (categorized discrepancies with visual & clause citations), Alignment Score, Executive Verdict'
  },
  {
    id: 'stage-7',
    num: '07',
    title: 'Target Architecture Synthesis & Remediation',
    subtitle: 'Automated compliant graph compilation, Mermaid flowchart TD rendering, and visual diffing',
    category: 'Architecture Synthesis',
    icon: Sparkles,
    color: 'from-violet-500/20 to-indigo-500/20 text-indigo-400 border-indigo-500/30',
    badge: 'Remediation Engine',
    summary: 'Synthesizes the remediated target architecture that satisfies all specification constraints while preserving genuine visual components from the diagram.',
    deepDive: [
      {
        heading: 'Provenance-Preserving Graph Assembly',
        detail: 'Retains verified visual components (status: Unchanged, provenance: visual_observation), injects missing required entities (status: Added_From_Requirements), removes forbidden bypass paths, and corrects reversed or missing directional edges.'
      },
      {
        heading: 'Sanitized Mermaid Flowchart TD Generation',
        detail: 'Compiles clean Mermaid flowchart TD syntax with subgraphs for confirmed security boundaries. Labels are strictly sanitized with entity escaping (&, ", <, >, |) to prevent syntax breakage and script injection.'
      },
      {
        heading: 'Browser-Native Vector Rendering & Export',
        detail: 'Renders interactive Mermaid diagrams directly in the browser via Mermaid.js runtime with instant SVG and PNG vector download capabilities.'
      }
    ],
    mathSpecs: [
      { label: 'Target Graph', formula: 'G_target = (V_observed ∪ V_missing) \\ V_forbidden, (E_observed ∪ E_missing) \\ E_forbidden' },
      { label: 'Label Sanitization', formula: 'Text = Escape_Entities(Label, {&, ", <, >, |})' }
    ],
    inputs: 'Discrepancy Report, Visual Architecture Graph, Requirements AST',
    outputs: 'Synthesized Architecture Graph, Executable Mermaid Diagram Code, SVG/PNG renders'
  },
  {
    id: 'stage-8',
    num: '08',
    title: 'Citations-Grounded RAG Audit Assistant',
    subtitle: 'Local BM25 lexical evidence indexing and strictly grounded compliance Q&A',
    category: 'Grounded Intelligence',
    icon: MessageSquare,
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-400 border-emerald-500/30',
    badge: 'Grounded RAG',
    summary: 'Enables interactive Q&A over the audit results, with zero hallucination: every answer strictly cites bounding box coordinates, visual evidence, and requirement clauses.',
    deepDive: [
      {
        heading: 'Multimodal Audit Evidence Chunking',
        detail: 'Indexes extracted components, visual connector paths, OCR text blocks, requirement clauses, and discrepancy records into searchable knowledge chunks.'
      },
      {
        heading: 'Local BM25 Lexical Indexing & Evidence Matching',
        detail: 'Tokenizes user queries and evidence chunks with stopword pruning, ranking matches using Okapi BM25 (k1=1.5, b=0.75) with IDF weighting and title matching for fast, reproducible retrieval without vector embedding drift.'
      },
      {
        heading: 'Explicit Boundary Enforcement & Verbatim Citations',
        detail: 'When engineers query the assistant, relevant evidence chunks are retrieved. The assistant cites the exact visual bounding box coordinates [x, y, w, h] and verbatim requirement clauses. If information is absent, it explicitly states the limitation rather than guessing.'
      }
    ],
    mathSpecs: [
      { label: 'Okapi BM25 Ranking', formula: 'Score(D, Q) = Σ IDF(q) · [TF(q, D) · 2.5] / [TF(q, D) + 1.5 · (0.25 + 0.75 · |D| / avgdl)] + 0.5 · Title_Match' },
      { label: 'IDF Weighting', formula: 'IDF(q) = ln(1 + (N - DF(q) + 0.5) / (DF(q) + 0.5))' },
      { label: 'Strict Citation Quoting', formula: 'Assertion_Valid ⇔ Quote ∈ Evidence_Chunk_Text (verbatim source match)' }
    ],
    inputs: 'Audit Knowledge Chunks, Discrepancy Findings, User Queries',
    outputs: 'Conversational responses with interactive evidence citations and verification tags'
  }
];

export default function MethodologyModal({ isOpen, onClose }) {
  const [activeStageId, setActiveStageId] = useState('stage-1');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [viewMode, setViewMode] = useState('detailed'); // 'detailed' | 'flowchart'

  if (!isOpen) return null;

  const activeStage = WORKFLOW_STAGES.find((s) => s.id === activeStageId) || WORKFLOW_STAGES[0];
  const categories = ['ALL', 'Classical Computer Vision', 'Requirements Engineering', 'Formal Audit Engine', 'Architecture Synthesis', 'Grounded Intelligence'];

  const filteredStages = selectedCategory === 'ALL'
    ? WORKFLOW_STAGES
    : WORKFLOW_STAGES.filter((s) => s.category === selectedCategory);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fade-in">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="methodology-title"
        className="glass-panel rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-indigo-500/30 shadow-2xl shadow-indigo-950/50 overflow-hidden bg-slate-950/95"
      >
        {/* Modal Header */}
        <header className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/20 flex-shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="methodology-title" className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  DiagramFlow End-to-End Auditing Architecture
                </h2>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold uppercase">
                  Production Workflow v2.4
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                In-depth mathematical and algorithmic breakdown of the 8-stage Classical CV + AST Verification Pipeline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'detailed' ? 'flowchart' : 'detailed')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-300 transition"
            >
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>{viewMode === 'detailed' ? 'View Flow Architecture' : 'View Stage Details'}</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close methodology"
              className="p-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Category Filter Bar */}
        <div className="px-5 sm:px-6 py-2.5 bg-slate-900/40 border-b border-slate-800/60 flex items-center gap-2 overflow-x-auto text-xs font-medium">
          <span className="text-slate-400 font-mono text-[11px] mr-1">Filter Domain:</span>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-lg transition-all duration-150 whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Main Body */}
        {viewMode === 'flowchart' ? (
          /* High-Level Architecture Flowchart View */
          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            <div className="p-4 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-white">Strict Separation of Concerns:</strong> Visual extraction is completely separated from requirements parsing.
                The Computer Vision pipeline runs strictly on pixels without accessing requirements, preventing the LLM from hallucinating components that do not physically exist in the diagram.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {WORKFLOW_STAGES.map((stg) => {
                const IconComponent = stg.icon;
                return (
                  <div
                    key={stg.id}
                    onClick={() => {
                      setActiveStageId(stg.id);
                      setViewMode('detailed');
                    }}
                    className="p-4 rounded-2xl bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-indigo-500/40 transition cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          {stg.num}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">{stg.badge}</span>
                      </div>
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`p-2 rounded-xl border ${stg.color}`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <h4 className="text-xs font-bold text-white group-hover:text-indigo-300 transition leading-snug">
                          {stg.title}
                        </h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-3">
                        {stg.summary}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-indigo-400 font-semibold">
                      <span>Explore In-Depth</span>
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Detailed Stage-by-Stage Split View */
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Stage Selector Sidebar */}
            <aside className="w-full md:w-80 border-r border-slate-800 bg-slate-950/60 overflow-y-auto p-3 space-y-1.5 flex-shrink-0">
              <div className="px-2 py-1 text-[11px] font-mono text-slate-400 font-semibold uppercase tracking-wider">
                Auditing Pipeline Stages ({filteredStages.length})
              </div>
              {filteredStages.map((stg) => {
                const IconComponent = stg.icon;
                const isSelected = activeStageId === stg.id;
                return (
                  <button
                    key={stg.id}
                    onClick={() => setActiveStageId(stg.id)}
                    className={`w-full text-left p-3 rounded-2xl transition-all duration-150 border flex items-start gap-3 ${
                      isSelected
                        ? 'bg-gradient-to-r from-indigo-900/40 to-slate-900/90 border-indigo-500/40 shadow-lg shadow-indigo-950/30'
                        : 'bg-slate-900/30 hover:bg-slate-800/40 border-transparent hover:border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className={`p-2 rounded-xl border flex-shrink-0 mt-0.5 ${stg.color}`}>
                      <IconComponent className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-mono font-bold text-indigo-400">STAGE {stg.num}</span>
                        <span className="text-[9px] font-mono text-slate-400 uppercase">{stg.badge}</span>
                      </div>
                      <div className={`text-xs font-bold truncate mt-0.5 ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {stg.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {stg.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </aside>

            {/* Right Stage Deep-Dive Details */}
            <div className="flex-1 overflow-y-auto p-5 sm:p-8 space-y-6 bg-slate-900/30">
              {/* Active Stage Hero */}
              <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-950 border border-indigo-500/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      STAGE {activeStage.num}
                    </span>
                    <span className="text-xs font-mono text-slate-400 font-semibold px-2 py-0.5 rounded-md bg-slate-800">
                      {activeStage.category}
                    </span>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                    {activeStage.badge}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white tracking-tight">
                  {activeStage.title}
                </h3>
                <p className="text-xs font-medium text-indigo-200/90 leading-relaxed">
                  {activeStage.subtitle}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed pt-1 border-t border-slate-800/80">
                  {activeStage.summary}
                </p>
              </div>

              {/* In-Depth Technical Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>How It Works In-Depth</span>
                </h4>
                <div className="grid grid-cols-1 gap-3">
                  {activeStage.deepDive.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-indigo-500/25 transition space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <h5 className="text-xs font-bold text-white">{item.heading}</h5>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed pl-7">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mathematical & Algorithmic Specs */}
              {activeStage.mathSpecs && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
                    <Code className="w-4 h-4 text-cyan-400" />
                    <span>Algorithmic &amp; Mathematical Specifications</span>
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                    {activeStage.mathSpecs.map((spec, sidx) => (
                      <div key={sidx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 p-2 rounded-lg bg-slate-900/60 border border-slate-850">
                        <span className="text-[11px] font-semibold text-slate-300 font-mono">{spec.label}:</span>
                        <code className="text-[11px] text-cyan-300 font-mono bg-cyan-950/30 px-2.5 py-1 rounded border border-cyan-500/20">
                          {spec.formula}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input / Output Data Flow */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400 uppercase">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Stage Inputs</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {activeStage.inputs}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400 uppercase">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Stage Outputs</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-mono">
                    {activeStage.outputs}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer info bar */}
        <footer className="p-4 px-6 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Fully transparent execution: view actual stage-by-stage tensors &amp; JSON traces in Transparency Mode.</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/30"
          >
            Close Explorer
          </button>
        </footer>
      </section>
    </div>
  );
}
