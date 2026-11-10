import React, { useState } from 'react';
import {
  Eye,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Code,
  Layers,
  Sparkles,
  Image,
  FileText,
  Copy,
  Check
} from '../icons';

const DEFAULT_EDUCATIONAL_STAGES = [
  {
    stage_id: 'STAGE_1_PREPROCESSING',
    stage_number: 1,
    stage_name: 'Image Preprocessing & Contrast Normalization',
    why: 'Normalizes canvas polarity and lighting so dark mode and light mode diagrams are analyzed identically without stroke loss.',
    why_plain_english: 'Before looking for boxes or text, the system checks whether the image has a dark or light background. It inverts dark themes to a standard white canvas and removes background texture or noise so diagram lines stand out clearly.',
    why_technical: 'Computes luminance distribution across W×H canvas. If background luminance < 128, a bitwise NOT operation standardizes polarity. Otsu global binarization separates foreground strokes from the canvas background, followed by bilateral filtering (sigma_s=3, sigma_r=0.1) to preserve hard stroke edges.',
    how_analyzed_diagram: 'Luminance histogram analysis measures canvas background polarity. Otsu adaptive binarization isolates dark stroke contours from light background pixels without degrading thin connector lines.',
    how_analyzed_requirements: 'Requirements text is held in raw memory buffer; preprocessing operates strictly on diagram pixels without prior requirement bias.',
    step_by_step_breakdown: [
      'Step 1: Compute channel mean and luminance distribution across W×H canvas.',
      'Step 2: Evaluate background polarity threshold; trigger bitwise NOT inversion if dark theme.',
      'Step 3: Execute Otsu thresholding to separate foreground stroke contours from background.',
      'Step 4: Apply bilateral spatial filter to preserve hard component edges while attenuating background noise.'
    ],
    status: 'Recorded',
    key_findings: 'Polarity standardized to light background; stroke contours isolated with high SNR.',
    output_summary: {
      polarity: 'standardized_light',
      binarization_method: 'otsu_adaptive',
      stroke_preservation: 'bilateral_filtered',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_2_SHAPE_DETECTION',
    stage_number: 2,
    stage_name: 'Classical Geometric Component Detection',
    why: 'Finds component boxes, databases, and subsystem boundary groups using deterministic computer vision algorithms.',
    why_plain_english: 'The system traces all visible closed shapes (boxes, cylinders, circles) across the diagram image and measures their coordinates, dimensions, and nesting relationships.',
    why_technical: 'Suzuki-Abe border following algorithm (cv2.findContours) builds a 2-level contour tree. Douglas-Peucker polygon approximation (epsilon=0.02*perimeter) verifies rectangular and cylindrical hulls. Geometric heuristics filter out small noise artifacts (area >= 900px) and compute physical bboxes [x, y, w, h] and centroids.',
    how_analyzed_diagram: 'Hierarchical border following extracts contour geometry. Bounding boxes are classified into component nodes or subsystem group containers based on area and containment ratios.',
    how_analyzed_requirements: 'Requirements do not determine what shapes exist in the image; shape detection is completely independent of the text document.',
    step_by_step_breakdown: [
      'Step 1: Suzuki border following hierarchy traversal to segment closed contours.',
      'Step 2: Douglas-Peucker polygonal approximation to verify rectangular and cylindrical hulls.',
      'Step 3: Compute centroid coordinates (cx, cy) and bounding rectangle [x, y, w, h].',
      'Step 4: Filter containment hierarchy to distinguish nested subsystem clusters from top-level nodes.'
    ],
    status: 'Recorded',
    key_findings: 'All visible component boundaries and boundary groups mapped to spatial coordinates.',
    output_summary: {
      contour_algorithm: 'suzuki_abe_tree',
      polygon_simplification: 'douglas_peucker',
      min_area_threshold_px: 900,
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_3_OCR',
    stage_number: 3,
    stage_name: 'Dual-Pass Tesseract OCR & Spatial Binding',
    why: 'Reads service labels and associates text with nearby component boxes without hallucinating names.',
    why_plain_english: 'The system reads the text inside every box and on every arrow using Optical Character Recognition (OCR). It binds each recognized name to its corresponding shape so the diagram becomes a readable graph.',
    why_technical: 'A morphological border mask suppresses box perimeter strokes to prevent border segments entering OCR. Pass 1 runs Tesseract PSM 11 (Sparse text) across open canvas areas for floating connector labels. Pass 2 runs PSM 6 (Uniform block text) inside each component crop. Spatial containment binds tokens to component IDs.',
    how_analyzed_diagram: 'Per-component image crops and canvas text masks are processed with dual PSM OCR passes. Word tokens and line blocks receive confidence scores and spatial coordinates.',
    how_analyzed_requirements: 'Requirements text is parsed independently; OCR text labels are never invented or corrected by requirements to maintain audit objectivity.',
    step_by_step_breakdown: [
      'Step 1: Mask geometric borders with morphological kernel to prevent border strokes entering OCR.',
      'Step 2: Pass 1 (PSM 11 Sparse) reads floating channel, bus, and protocol connector labels.',
      'Step 3: Pass 2 (PSM 6 Uniform) reads multi-line service titles within each component boundary.',
      'Step 4: Spatial intersection binding: tokens within [x, y, w, h] bound to node ID with confidence.'
    ],
    status: 'Recorded',
    key_findings: 'Component labels and floating protocol annotations mapped to detected shape nodes.',
    output_summary: {
      ocr_engine: 'tesseract_dual_pass',
      psm_modes: ['PSM_11_sparse', 'PSM_6_uniform_block'],
      label_binding: 'spatial_containment_intersection',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_4_CONNECTOR_TRACING',
    stage_number: 4,
    stage_name: 'Topological Connector Tracing & Arrowhead Detection',
    why: 'Traces data flow lines and discovers arrow directions for both horizontal and vertical downward arrows.',
    why_plain_english: 'The system traces all arrows connecting boxes. It connects dashed and broken lines, tracks elbow turns, and samples arrowheads at line endpoints (including horizontal arrows and vertical downward arrows | v).',
    why_technical: 'Component regions are dilated by 8px and masked. Zhang-Suen skeleton thinning reduces connector strokes to 1-pixel centerlines. Collinear stroke gap bridging (BFS traversal up to 45px) merges dashed segments. Bilateral flare arrowhead detection probes normal sweep rays behind terminal endpoints to classify arrowheads in all orientations (->, <-, | v).',
    how_analyzed_diagram: 'Skeleton pixel pathways are vectorized into waypoints. Directionality is established by bilateral arrowhead flare sampling at terminal contact points.',
    how_analyzed_requirements: 'Connector direction is extracted strictly from visual pixels; uncertain or missing arrows are flagged as visual evidence uncertainties.',
    step_by_step_breakdown: [
      'Step 1: Mask out detected component regions to isolate free connector stroke pixels.',
      'Step 2: Apply Zhang-Suen thinning to generate single-pixel skeleton topological paths.',
      'Step 3: Bridge collinear dashed and broken line gaps using 8-neighborhood BFS path traversal.',
      'Step 4: Bilateral flare arrowhead probe samples perpendicular line width behind terminals to resolve arrowheads in all orientations (->, | v).'
    ],
    status: 'Recorded',
    key_findings: 'Solid, dashed, and right-angle connectors traced with endpoint arrowhead orientation.',
    output_summary: {
      thinning_algorithm: 'zhang_suen_skeleton',
      gap_bridging: 'bfs_collinear_traversal_45px',
      arrowhead_probing: 'bilateral_flare_width_sweep',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_5_REQUIREMENTS_PARSING',
    stage_number: 5,
    stage_name: 'Requirements Structural AST Compilation',
    why: 'Converts unstructured requirements documents into an unambiguous, typed Architectural Specification AST.',
    why_plain_english: 'The system reads the requirements document (Word, PDF, Markdown, or text) and extracts all mandatory components, allowed communication flows, security boundaries, and protocol requirements into a structured blueprint.',
    why_technical: 'Tokenizes requirement clauses and applies schema-constrained AST extraction adhering to typed Pydantic models: ComponentNode (id, label, tier, type, is_storage), DirectedFlow (source, target, protocol, sync/async), and SecurityBoundary. Rejects ungrounded LLM completions via JSON schema validation.',
    how_analyzed_diagram: 'Visual evidence graph is frozen and preserved as an immutable ground-truth benchmark.',
    how_analyzed_requirements: 'Text clauses are parsed into typed AST entities and relations, identifying required services, communication directions, and protocols.',
    step_by_step_breakdown: [
      'Step 1: Tokenize natural language and markdown specifications into structural clauses.',
      'Step 2: Extract typed components: Ingress, Microservice Compute, Data Store, Message Broker.',
      'Step 3: Parse directional data flows with protocols (HTTPS, gRPC, Kafka, AMQP) and cardinality.',
      'Step 4: Validate AST schema compliance and generate formal requirements Mermaid specification.'
    ],
    status: 'Recorded',
    key_findings: 'Natural language requirements converted into strongly-typed AST specification.',
    output_summary: {
      parser: 'structured_ast_pydantic',
      schema_validation: 'strict_json_type_enforcement',
      flow_cardinality: 'directional_protocols_extracted',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_6_DIFF_AUDITING',
    stage_number: 6,
    stage_name: 'Grounded Dual-Graph Alignment Diffing',
    why: 'Performs mathematical dual-graph alignment between the visual diagram and requirements to detect every discrepancy.',
    why_plain_english: 'The system compares the diagram graph with the requirements specification. It detects missing components, undocumented components, missing connections, reversed arrowheads, and security boundary violations, assigning a compliance score from 0% to 100%.',
    why_technical: 'Deterministic dual-graph alignment compares Visual Graph G_V = (V_V, E_V) with Requirements Graph G_R = (V_R, E_R). Identifies symmetric difference in vertices and directed edges. Categorizes findings into Missing Component, Missing Flow, Reversed Flow, and Protocol Mismatch. Calculates mathematical alignment score S = 1.0 - sum(w_i * sev_i).',
    how_analyzed_diagram: 'Visual nodes and edges provide the actual observed architecture facts.',
    how_analyzed_requirements: 'Requirements AST entities and flows provide the expected architecture specification.',
    step_by_step_breakdown: [
      'Step 1: Perform exact and phonetic/fuzzy label alignment between visual nodes and requirement entities.',
      'Step 2: Identify missing components (v in V_R \\ V_V) and undocumented shadow IT (v in V_V \\ V_R).',
      'Step 3: Verify directed adjacency matrix: identify missing connectors and reversed data flows.',
      'Step 4: Calculate mathematical alignment score: S = 1.0 - sum(w_i * sev_i) and generate executive verdict.'
    ],
    status: 'Recorded',
    key_findings: 'Every discrepancy pinpointed with evidence citations and severity classification.',
    output_summary: {
      diff_engine: 'deterministic_dual_graph_alignment',
      scoring_model: 'weighted_penalty_subtraction',
      discrepancy_categories: ['missing_node', 'missing_edge', 'reversed_flow', 'protocol_mismatch'],
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_7_ARCHITECTURE_SYNTHESIS',
    stage_number: 7,
    stage_name: 'Remediated Target Architecture Synthesis',
    why: 'Synthesizes an executable Mermaid architecture diagram showing the compliant, remediated design.',
    why_plain_english: 'The system generates a corrected architecture diagram in Mermaid code. It preserves what was correctly drawn, adds missing components, fixes reversed arrows, and highlights changes with distinct colors.',
    why_technical: 'Merges verified observed components with missing required elements into a compliant Target Graph G_T. Applies topological sorting to minimize edge crossings. Compiles executable Mermaid flowchart code with standard subgraph groupings and color-coded status styling. Renders high-res SVG and PNG blueprints.',
    how_analyzed_diagram: 'Retains valid visual component positions and labels to maintain developer recognition.',
    how_analyzed_requirements: 'Injects mandatory missing services and correct directional data flows from the requirements AST.',
    step_by_step_breakdown: [
      'Step 1: Construct unified Target Graph incorporating all mandatory compliant architecture components.',
      'Step 2: Route required connectors using topological sorting to minimize layout edge crossings.',
      'Step 3: Compile syntax-checked Mermaid flowchart code with clear subgraphs and boundary groupings.',
      'Step 4: Export interactive Mermaid visualization, SVG vector paths, and PNG reference blueprints.'
    ],
    status: 'Recorded',
    key_findings: 'Executable Mermaid code synthesized with interactive rendering and vector export.',
    output_summary: {
      synthesis_mode: 'topological_target_merge',
      output_format: 'mermaid_flowchart_v11',
      vector_export: 'svg_png_high_res_render',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_8_RAG_INDEXING',
    stage_number: 8,
    stage_name: 'Grounded RAG Multi-Source Evidence Indexing',
    why: 'Indexes visual coordinates, requirement clauses, and discrepancy findings for hallucination-free AI chat.',
    why_plain_english: 'The system indexes all visual evidence, requirement quotes, and audit findings so you can ask any architectural question in the Copilot Chat and receive exact, cited answers referencing specific paragraphs and image coordinates.',
    why_technical: 'Chunks three distinct corpora: (1) Visual Evidence Chunks (bounding boxes, OCR confidence, pixel coordinates), (2) Requirements Spec Chunks (clause citations, paragraphs), and (3) Discrepancy Findings (severity, remediation rationale). Indexes into an in-memory inverted index and vector store enabling grounded QA with citations.',
    how_analyzed_diagram: 'Visual nodes, coordinates, and OCR tokens are chunked into searchable fact objects.',
    how_analyzed_requirements: 'Requirements paragraphs and acceptance criteria are indexed with clause identifiers.',
    step_by_step_breakdown: [
      'Step 1: Chunk visual evidence graph into spatially-referenced component and connector fact objects.',
      'Step 2: Chunk requirements document into clause-level paragraphs with markdown headers.',
      'Step 3: Generate metadata tags: source type, entity names, confidence scores, and discrepancy references.',
      'Step 4: Initialize conversational grounding engine to supply verifiable citations for every copilot answer.'
    ],
    status: 'Recorded',
    key_findings: 'Evidence index initialized across visual bounding boxes, text clauses, and findings.',
    output_summary: {
      indexing_engine: 'grounded_rag_multi_source',
      source_corpora: ['visual_evidence', 'requirements_spec', 'audit_discrepancies'],
      citation_verification: 'zero_hallucination_grounding',
      status: 'completed'
    }
  }
];

export default function TransparencyDrawer({ audit, isEnabled }) {

  const activeTraces = audit?.transparency_traces && audit.transparency_traces.length > 0
    ? audit.transparency_traces.map((trace, idx) => {
        const educational = DEFAULT_EDUCATIONAL_STAGES[idx] || {};
        return {
          ...educational,
          ...trace,
          stage_name: trace.stage_name || educational.stage_name,
          why_plain_english: trace.why_plain_english || educational.why_plain_english,
          why_technical: trace.why_technical || educational.why_technical,
          how_analyzed_diagram: (trace.how_analyzed_diagram && trace.how_analyzed_diagram !== 'See measured outputs below.')
            ? trace.how_analyzed_diagram
            : educational.how_analyzed_diagram,
          how_analyzed_requirements: (trace.how_analyzed_requirements && !trace.how_analyzed_requirements.includes('parsed at stage 5'))
            ? trace.how_analyzed_requirements
            : educational.how_analyzed_requirements,
          step_by_step_breakdown: (trace.step_by_step_breakdown && trace.step_by_step_breakdown.length > 0)
            ? trace.step_by_step_breakdown
            : educational.step_by_step_breakdown,
        };
      })
    : DEFAULT_EDUCATIONAL_STAGES;

  const isLiveAudit = Boolean(audit && audit.transparency_traces && audit.transparency_traces.length > 0);

  const [expandedStages, setExpandedStages] = useState(() => {
    const all = {};
    activeTraces.forEach(t => { all[t.stage_id] = true; });
    return all;
  });

  const [viewMode, setViewMode] = useState('both'); // 'simple', 'technical', 'both'
  const [copiedStageId, setCopiedStageId] = useState(null);
  const [showRawJson, setShowRawJson] = useState({});

  if (!isEnabled) return null;

  const toggleStage = (stageId) => {
    setExpandedStages(prev => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  };

  const expandAll = () => {
    const all = {};
    activeTraces.forEach(t => { all[t.stage_id] = true; });
    setExpandedStages(all);
  };

  const collapseAll = () => {
    setExpandedStages({});
  };

  const handleCopyArtifact = (stageId, data) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedStageId(stageId);
    setTimeout(() => setCopiedStageId(null), 2000);
  };

  return (
    <div id="transparency-panel" className="glass-panel rounded-2xl p-5 sm:p-6 shadow-2xl border-2 border-amber-500/30 bg-gradient-to-b from-amber-950/20 via-slate-900/95 to-slate-950/95 space-y-6 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-amber-500/20">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/20 flex-shrink-0">
            <Eye className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white">Full-Stack Pipeline Transparency View</h3>
              {isLiveAudit ? (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase flex items-center gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live Audit Traces (Audit #{audit.id || 'Active'})
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                  8-Stage Pipeline Walkthrough
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Exposing <strong>how the diagram image</strong> and <strong>how the requirements document</strong> are analyzed at each step, <strong>WHY</strong> each stage exists, and clear explanations for normal users.
            </p>
          </div>
        </div>

        {/* View Controls: Expand All / Collapse All & Detail Mode */}
        <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-auto">
          <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setViewMode('simple')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                viewMode === 'simple' ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Plain English
            </button>
            <button
              onClick={() => setViewMode('both')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                viewMode === 'both' ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              All In-Depth
            </button>
            <button
              onClick={() => setViewMode('technical')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                viewMode === 'technical' ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Deep Tech
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-semibold transition shadow-sm"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-700 text-xs font-medium transition"
            >
              Collapse
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stage Jump Navigation Pills */}
      <div className="pb-2 overflow-x-auto flex items-center gap-2 border-b border-slate-800/80">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">Jump:</span>
        {activeTraces.map((t, idx) => {
          const isOpen = Boolean(expandedStages[t.stage_id]);
          return (
            <button
              key={t.stage_id}
              onClick={() => {
                setExpandedStages(prev => ({ ...prev, [t.stage_id]: true }));
                const el = document.getElementById(`trace-${t.stage_id}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={`text-[11px] font-mono px-3 py-1 rounded-lg transition whitespace-nowrap flex items-center gap-1.5 ${
                isOpen
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
              }`}
            >
              <span>0{idx + 1}</span>
              <span className="hidden sm:inline">{t.stage_name.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Traces Timeline / Step List */}
      <div className="space-y-4">
        {activeTraces.map((trace, index) => {
          const isExpanded = Boolean(expandedStages[trace.stage_id]);
          const stageNum = trace.stage_number || index + 1;
          const isJsonOpen = Boolean(showRawJson[trace.stage_id]);

          return (
            <div
              id={`trace-${trace.stage_id}`}
              key={trace.stage_id || index}
              className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                isExpanded
                  ? 'bg-slate-900/90 border-amber-500/40 shadow-xl shadow-amber-500/5'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Stage Header */}
              <button
                onClick={() => toggleStage(trace.stage_id)}
                className="w-full p-4 sm:p-5 flex items-center justify-between text-left gap-4 cursor-pointer focus:outline-none hover:bg-slate-800/30 transition"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 text-xs font-mono font-extrabold flex items-center justify-center flex-shrink-0 shadow-md">
                    0{stageNum}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white block truncate">{trace.stage_name}</span>
                      <span className="text-[10px] text-amber-400/90 font-mono hidden sm:inline px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                        {trace.stage_id}
                      </span>
                    </div>
                    {trace.key_findings && (
                      <span className="text-xs text-slate-400 mt-0.5 block truncate">
                        {trace.key_findings}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{audit ? (trace.status || 'Recorded') : 'Not run'}</span>
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-400">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </button>

              {/* Detailed Stage Content */}
              {isExpanded && (
                <div className="px-5 pb-6 pt-2 border-t border-slate-800/80 space-y-5 text-xs animate-fade-in">
                  
                  {/* WHY THIS STAGE EXISTS (Plain English for Normal Users) */}
                  {(viewMode === 'simple' || viewMode === 'both') && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
                      <h4 className="font-bold text-amber-300 mb-1.5 flex items-center gap-2 text-xs uppercase tracking-wide">
                        <HelpCircle className="w-4 h-4 text-amber-400" />
                        <span>Why This Stage Exists (Plain English Explanation)</span>
                      </h4>
                      <p className="text-slate-200 text-xs sm:text-sm leading-relaxed">
                        {trace.why_plain_english || trace.why}
                      </p>
                    </div>
                  )}

                  {/* TWO-COLUMN BREAKDOWN: DIAGRAM IMAGE ANALYSIS VS REQUIREMENTS ANALYSIS */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Column 1: How Diagram Image is Analyzed */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-cyan-500/20">
                        <h5 className="font-bold text-cyan-300 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <Image className="w-4 h-4 text-cyan-400" />
                          <span>1. Diagram Image Analysis</span>
                        </h5>
                        <span className="text-[10px] font-mono text-cyan-400/80">Computer Vision</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-xs">
                        {trace.how_analyzed_diagram || "Visual layout, spatial bounding boxes, and image geometry are evaluated."}
                      </p>
                    </div>

                    {/* Column 2: How Requirements Document is Analyzed */}
                    <div className="p-4 rounded-xl bg-slate-950/80 border border-indigo-500/30 space-y-2">
                      <div className="flex items-center justify-between pb-1.5 border-b border-indigo-500/20">
                        <h5 className="font-bold text-indigo-300 flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <FileText className="w-4 h-4 text-indigo-400" />
                          <span>2. Requirements Document Analysis</span>
                        </h5>
                        <span className="text-[10px] font-mono text-indigo-400/80">LangGraph Specs</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-xs">
                        {trace.how_analyzed_requirements || "Requirements document clauses are parsed, matched against architecture standards, and verified."}
                      </p>
                    </div>
                  </div>

                  {/* HOW ARE DIFFERENT THINGS ANALYZED: STEP-BY-STEP BREAKDOWN */}
                  {trace.step_by_step_breakdown && trace.step_by_step_breakdown.length > 0 && (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                      <h5 className="font-bold text-slate-200 flex items-center gap-2 text-xs uppercase tracking-wider">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span>How Different Things Are Analyzed (Step-by-Step Breakdown)</span>
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {trace.step_by_step_breakdown.map((step, sIdx) => (
                          <div key={sIdx} className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
                            <span className="w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                              {sIdx + 1}
                            </span>
                            <span>{step.replace(/^Step \d+:\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* METRIC CHIPS / CLEAN STATS */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Stage Execution Summary
                      </span>
                      <button
                        onClick={() => setShowRawJson(prev => ({ ...prev, [trace.stage_id]: !prev[trace.stage_id] }))}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition flex items-center gap-1"
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>{isJsonOpen ? 'Hide Raw JSON' : 'Inspect Raw JSON Artifact'}</span>
                      </button>
                    </div>

                    {/* Metric Pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      {trace.output_summary && Object.entries(trace.output_summary).slice(0, 4).map(([k, v]) => (
                        <div key={k} className="p-2 rounded-lg bg-slate-900 border border-slate-800/80">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block truncate">
                            {k.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-200 block truncate">
                            {v && typeof v === 'object' ? `${Array.isArray(v) ? v.length : Object.keys(v).length} items` : String(v ?? 'Unavailable')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Raw JSON viewer if toggled */}
                    {isJsonOpen && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-slate-400">Exact Intermediate Artifact:</span>
                          <button
                            onClick={() => handleCopyArtifact(trace.stage_id, trace.output_summary)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 transition"
                          >
                            {copiedStageId === trace.stage_id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-bold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span>Copy JSON</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="font-mono text-[11px] text-slate-300 overflow-x-auto p-3 rounded-lg bg-slate-950 border border-slate-800 leading-relaxed max-h-56">
                          {JSON.stringify(trace.output_summary, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* DEEP TECHNICAL / MATHEMATICAL RATIONALE */}
                  {(viewMode === 'technical' || viewMode === 'both') && trace.why_technical && (
                    <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-xs space-y-1">
                      <h5 className="font-bold text-indigo-300 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                        <Code className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Technical &amp; Mathematical Rationale</span>
                      </h5>
                      <p className="text-slate-300 font-mono text-[11px] leading-relaxed">
                        {trace.why_technical}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
