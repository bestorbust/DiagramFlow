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
    subtitle: 'Canvas polarity detection, adaptive thresholding, and solid fill isolation',
    category: 'Classical Computer Vision',
    icon: Eye,
    color: 'from-blue-500/20 to-cyan-500/20 text-cyan-400 border-cyan-500/30',
    badge: 'Deterministic CV',
    summary: 'Normalizes arbitrary software diagrams (dark/light themes, JPEG artifacts, screenshot scaling) into a high-contrast binary stroke map.',
    deepDive: [
      {
        heading: 'Polarity & Luminance Inversion',
        detail: 'Computes median intensity of perimeter border pixels to classify dark vs. light canvas. Dark backgrounds (mean < 128) undergo strict inversion (255 - I) so all downstream structural operations process standardized dark-ink-on-light geometry.'
      },
      {
        heading: 'Adaptive Stroke Binarization',
        detail: 'Applies calibrated thresholding (stroke_bin_threshold = 210) to distinguish genuine vector strokes from faint gridlines, compression noise, and light pastel container fills.'
      },
      {
        heading: 'Solid 2D Fill Removal',
        detail: 'Performs morphological opening with a 17×17 rectangular kernel to isolate solid filled container interiors or solid background blocks. Subtracting these blobs isolates thin 1–5px communication connector shafts without degrading solid triangular arrowheads.'
      }
    ],
    mathSpecs: [
      { label: 'Polarity Metric', formula: 'Canvas = Dark if Median(Border_Pixels) < 128 else Light' },
      { label: 'Solid Kernel', formula: 'K_solid = Rect(17, 17); Blobs = Opening(I, K_solid)' },
      { label: 'Shaft Preservation', formula: 'Strokes = Binarize(I) - Blobs' }
    ],
    inputs: 'Raw uploaded diagram image (PNG, JPG, WebP, SVG rasterization)',
    outputs: 'Contrast-normalized binary stroke canvas & polarity metadata'
  },
  {
    id: 'stage-2',
    num: '02',
    title: 'Shape & Group Boundary Detection',
    subtitle: 'Geometric contour hierarchy, VPC/enclosing boundary segregation & component classification',
    category: 'Classical Computer Vision',
    icon: Box,
    color: 'from-indigo-500/20 to-purple-500/20 text-purple-400 border-purple-500/30',
    badge: 'Contour Geometry',
    summary: 'Discovers functional architecture components (services, databases, queues) and separates them from enclosing grouping zones (VPCs, subnets, trust domains).',
    deepDive: [
      {
        heading: 'Hierarchical Contour Extraction',
        detail: 'Extracts 2-level contour trees via Suzuki-Abe topological border following (cv2.RETR_CCOMP). Polygons are classified into candidate bounding boxes [x, y, w, h] with spatial area and aspect ratio filtering.'
      },
      {
        heading: 'Grouping vs. Component Segregation',
        detail: 'Calculates enclosing spatial containment. Boxes encompassing two or more smaller disjoint components or occupying >25% of the total canvas area are tagged as Containers / System Perimeters (e.g. AWS VPC, Kubernetes Cluster) rather than functional nodes.'
      },
      {
        heading: 'Shape Role Classification',
        detail: 'Contour vertex complexity and aspect ratio determine physical shape: Rectangular Services (4 vertices), Cylindrical Storage / Databases (detected via dual horizontal arc caps), and Microservice Compute nodes.'
      }
    ],
    mathSpecs: [
      { label: 'Contour Approximation', formula: 'Approx = DouglasPeucker(Contour, ε = 0.02 * Perimeter)' },
      { label: 'Container Rule', formula: 'Is_Container = True if Area(B) > 0.25 * W * H or Contains(B, Comps) >= 2' },
      { label: 'Component Masking', formula: 'Comp_Exclusion = Dilate(Union(Bboxes), Pad = 2px)' }
    ],
    inputs: 'Normalized binary stroke canvas',
    outputs: 'List of Components (id, bbox, center, shape) and Container Groups (id, bbox, child_nodes)'
  },
  {
    id: 'stage-3',
    num: '03',
    title: 'Multi-Pass OCR & Spatial Label Binding',
    subtitle: 'Dual-resolution Tesseract engine with exterior Voronoi label association',
    category: 'Classical Computer Vision',
    icon: FileText,
    color: 'from-emerald-500/20 to-teal-500/20 text-teal-400 border-teal-500/30',
    badge: 'Dual-Pass OCR',
    summary: 'Extracts all textual tokens without hallucination, binding service names, database labels, and protocol badges to their exact physical components.',
    deepDive: [
      {
        heading: 'Pass 1: Global Full-Canvas OCR',
        detail: 'Runs global Tesseract page-segmentation mode (PSM 11 / sparse text) across the full canvas to harvest all text tokens, confidence scores, and baseline coordinate bounding boxes.'
      },
      {
        heading: 'Pass 2: Targeted High-Res ROI OCR',
        detail: 'Crops individual component bounding boxes with multi-threaded localized OCR (PSM 6 / uniform block) at 2× bicubic interpolation to read low-contrast or fine-print service names accurately.'
      },
      {
        heading: 'Spatial Label Proximity & Icon Clustering',
        detail: 'For unbordered architecture diagrams or exterior text labels situated beneath cloud icons, Voronoi/Euclidean nearest-neighbor clustering binds labels to their corresponding functional symbol.'
      }
    ],
    mathSpecs: [
      { label: 'Confidence Filter', formula: 'Token_Valid = True if OCR_Confidence >= 48%' },
      { label: 'Label Attachment', formula: 'Argmin_comp Dist(Center(Text_Box), Center(Comp_Box))' },
      { label: 'OCR Text Masking', formula: 'Text_Exclusion = Dilate(Union(Text_Bboxes), Pad = 1px)' }
    ],
    inputs: 'Component bounding boxes & normalized image canvas',
    outputs: 'Resolved textual labels per component, unattached edge annotations, and text occlusion masks'
  },
  {
    id: 'stage-4',
    num: '04',
    title: 'Centerline Skeletonization & Connector Tracing',
    subtitle: 'Zhang-Suen thinning, dashed gap bridging, and bilateral flare arrowhead resolution',
    category: 'Classical Computer Vision',
    icon: GitBranch,
    color: 'from-amber-500/20 to-orange-500/20 text-orange-400 border-orange-500/30',
    badge: 'Topology Engine',
    summary: 'Extracts exact network topology: resolves orthogonal paths, bridges broken/dashed connectors, and classifies directionality (forward, bidirectional, undirected).',
    deepDive: [
      {
        heading: 'Zhang-Suen Centerline Thinning',
        detail: 'Preserves 8-connectivity while iteratively eroding stroke boundaries into a 1-pixel wide morphological skeleton. Unlike simple erosion, this guarantees that topological junctions and orthogonal corners never break.'
      },
      {
        heading: 'Dashed & Broken Line Collinear Bridging',
        detail: 'Detects collinear stroke segments with gaps up to 45px. Endpoints calculate tangent vectors using BFS connected-component traversal along the active stroke (preventing bounding-box skew). Aligned endpoints (cos(θ) > 0.85) are bridged with continuous lines.'
      },
      {
        heading: 'Vertical Downward & Horizontal Arrowhead Verification',
        detail: 'Casts normal sweep lines (nx = -dy, ny = dx) at distance d=0..36 behind endpoints. Dynamically detects bilateral flare expansion (p ≥ 3, n ≥ 3, tot ≥ 6) and verifies the thin connector shaft (tot ≤ 5) behind the arrowhead base. This robustly resolves both standard horizontal chevrons and tall orthogonal vertical drop arrows (| v).'
      },
      {
        heading: 'Douglas-Peucker Waypoint Approximation',
        detail: 'Compresses traced pixel chains into polygonal waypoints using epsilon = 2.0px, producing clean vector paths ready for architecture graph representation.'
      }
    ],
    mathSpecs: [
      { label: 'Collinear Cosine', formula: 'cos(θ1) = dot(v1, d12) > 0.85 and cos(θ2) = dot(v2, -d12) > 0.85' },
      { label: 'Normal Sweep', formula: 'Ray(dist, offset) = Endpoint - dir * dist + normal * offset' },
      { label: 'Shaft Verification', formula: 'Baseline = Median(Widths[d >= 14]) <= 4.5px; Flare = Widths[1..24] >= Baseline + 3' }
    ],
    inputs: 'Binary skeleton, component exclusion masks, OCR text masks',
    outputs: 'Traced relationships (source, target, direction: forward/bidirectional/undirected, waypoints, confidence)'
  },
  {
    id: 'stage-5',
    num: '05',
    title: 'Universal Requirements Parsing & AST Specification',
    subtitle: 'Multi-format document ingestion (PDF, DOCX, YAML, JSON, TXT) and formal rule compilation',
    category: 'Requirements Engineering',
    icon: FileText,
    color: 'from-pink-500/20 to-rose-500/20 text-rose-400 border-rose-500/30',
    badge: 'AST Compiler',
    summary: 'Parses engineering requirement specifications into a normalized Abstract Syntax Tree of expected components, allowed connectors, protocol rules, and SLA constraints.',
    deepDive: [
      {
        heading: 'Universal Document Ingestion',
        detail: 'Ingests specifications from PDF (PyMuPDF / pdfplumber), Word (.docx XML parser), structured YAML/JSON, or raw text. Tables, clause numbers, and structural hierarchies are preserved.'
      },
      {
        heading: 'Architecture Semantic Extraction',
        detail: 'Extracts functional entities, required protocols (REST, gRPC, AMQP, Kafka, WebSocket), async messaging queues, database persistence guarantees, and authentication gateways.'
      },
      {
        heading: 'SLA & Timeout Constraint Modeling',
        detail: 'Compiles specific latency, circuit breaker, timeout (e.g. 100ms vs 5000ms), and buffering constraints into machine-verifiable rule clauses with exact sentence citations.'
      }
    ],
    mathSpecs: [
      { label: 'AST Nodes', formula: 'V_req = { (name, type, zone, required_protocols) }' },
      { label: 'AST Edges', formula: 'E_req = { (src, tgt, type: sync|async, max_timeout_ms, queue_buffer) }' },
      { label: 'Clause Indexing', formula: 'Clause_Map = { rule_id: (clause_text, document_offset) }' }
    ],
    inputs: 'Requirements file (PDF, DOCX, TXT, YAML, JSON, MD)',
    outputs: 'Parsed Requirements AST (expected components, expected relationships, protocols, timeouts, security boundaries)'
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
        heading: 'Dual-Graph Alignment Matching',
        detail: 'Matches extracted visual nodes to requirement specification entities using fuzzy Levenshtein distance, token set ratios, and synonym role dictionaries (e.g. Orders DB = Order Storage = PostgreSQL).'
      },
      {
        heading: '6-Category Architectural Discrepancy Taxonomy',
        detail: 'Audits every path and flags violations into 6 formal categories: (1) Missing Required Components, (2) Missing Direct Connectors, (3) Unapproved / Direct Bypass Connections, (4) Missing Async Queues / Buffers, (5) Conflicting Timeouts / SLAs, (6) Security Boundary Violations (e.g. bypassing API Gateway).'
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
    subtitle: 'Automated compliant graph compilation, Mermaid diagram rendering, and visual diffing',
    category: 'Architecture Synthesis',
    icon: Sparkles,
    color: 'from-violet-500/20 to-indigo-500/20 text-indigo-400 border-indigo-500/30',
    badge: 'Remediation Engine',
    summary: 'Synthesizes the remediated target architecture that satisfies all specification constraints while preserving genuine visual components from the diagram.',
    deepDive: [
      {
        heading: 'Graph Remediation Assembly',
        detail: 'Merges observed visual components with required remediations: inserts missing message queues, introduces authentication gateways between public clients and private services, and routes async events through verified brokers.'
      },
      {
        heading: 'Production-Grade Mermaid Code Synthesis',
        detail: 'Generates clean, styled Mermaid flowchart code (graph TD / flowchart LR) with subgraphs for VPC/Security boundaries, customized node styles for databases/queues, and labeled edge protocols.'
      },
      {
        heading: 'Exportable Vector Artifacts',
        detail: 'Renders interactive Mermaid diagrams directly in the browser with high-resolution SVG and PNG export capabilities for engineering design reviews and compliance documentation.'
      }
    ],
    mathSpecs: [
      { label: 'Target Graph', formula: 'G_target = (V_observed ∪ V_missing) \\ V_unapproved, (E_observed ∪ E_missing) \\ E_unapproved' },
      { label: 'Mermaid Generation', formula: 'Target_Code = CompileMermaid(G_target, Styling_Rules)' }
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
