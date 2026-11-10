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
    why_plain_english: 'Before looking for boxes or text, the system checks whether the image has a dark or light background by sampling the perimeter border. It inverts dark themes to a standard light canvas, enhances contrast with CLAHE, and removes solid background fills so thin connector lines stand out clearly.',
    why_technical: 'Samples pixel intensities along 2% perimeter borders. If border median luminance < 110, bitwise inverts canvas (255 - I) to standardize on dark-ink-on-light geometry. Applies CLAHE (clipLimit = 2.0, tileGridSize = 8×8) for gradient-robust contrast, and subtracts 17×17 morphological opening solid blobs to isolate 1–5px connector shafts.',
    how_analyzed_diagram: 'Border pixel median sampling detects dark vs. light canvas. CLAHE enhances local contrast, and morphological opening isolates thin connector shafts from solid background fills.',
    how_analyzed_requirements: 'Requirements text is held in raw memory buffer; preprocessing operates strictly on diagram pixels without prior requirement bias.',
    step_by_step_breakdown: [
      'Step 1: Compute median luminance across 2% border margins of W×H canvas.',
      'Step 2: Trigger bitwise inversion (255 - I) if border median < 110 to standardize light canvas.',
      'Step 3: Apply CLAHE (clipLimit = 2.0, tileGridSize = 8×8) for gradient-robust contrast.',
      'Step 4: Subtract 17×17 morphological opening solid blobs to isolate 1–5px connector shafts.'
    ],
    status: 'Recorded',
    key_findings: 'Polarity standardized to light background; connector stroke contours isolated with high SNR.',
    output_summary: {
      border_median_threshold: 110,
      contrast_enhancement: 'clahe_clip_2.0_tile_8x8',
      solid_blob_kernel: 'rect_17x17',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_2_SHAPE_DETECTION',
    stage_number: 2,
    stage_name: 'Classical Geometric Component Detection',
    why: 'Finds component boxes, databases, and subsystem boundary groups using deterministic computer vision algorithms.',
    why_plain_english: 'The system detects closed component shapes across edge, threshold, and color cues. It verifies real ink on perimeters (filtering out gridlines) and separates functional services from enclosing container groups (like VPCs and subnets).',
    why_technical: 'Multi-cue contour detection runs across 5 visual paths: Canny edges (30, 150), threshold binary (245), HSV saturation, soft Canny (10, 40), and adaptive Gaussian. Verifies minimum area ≥ 1200px², min dimension ≥ 24px, and perimeter ink support ≥ 85%. Containers are segregated if area > 15% of canvas or enclosing child components.',
    how_analyzed_diagram: 'Extracts closed contours across edge, threshold, saturation, and adaptive passes. Filters by ink support and classifies into components or container groups.',
    how_analyzed_requirements: 'Requirements do not determine what shapes exist in the image; shape detection is completely independent of the text document.',
    step_by_step_breakdown: [
      'Step 1: Extract multi-cue contours via Canny, threshold, HSV saturation, and adaptive passes.',
      'Step 2: Verify candidate bounding boxes meet min area (1200px²) and ink support (≥ 85%).',
      'Step 3: Classify shape geometry (rectangle, circle, cylinder) using perimeter circularity and approxPolyDP.',
      'Step 4: Segregate container groups if area > 15% of canvas or enclosing child components.'
    ],
    status: 'Recorded',
    key_findings: 'All visible component boundaries and boundary groups mapped to spatial coordinates.',
    output_summary: {
      min_node_area_px: 1200,
      min_ink_support: 0.85,
      container_area_threshold: 0.15,
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_3_OCR',
    stage_number: 3,
    stage_name: 'Multi-Pass Tesseract OCR & Spatial Binding',
    why: 'Reads service labels and associates text with nearby component boxes without hallucinating names.',
    why_plain_english: 'The system reads text using dual global OCR passes and targeted component ROI crops. It trims outer box borders and cylinder caps to avoid reading shape strokes as letters, normalizes architectural terms, and binds labels via geometric proximity.',
    why_technical: 'Global OCR combines Tesseract PSM 11 (sparse text) and PSM 3 (automatic segmentation) with token IoU deduplication (> 0.45). Component ROIs apply a 2–4px border margin inset, cylinder cap insets (top 18%, bottom 8%), and bicubic upscaling (up to 3×) evaluated across PSM 7, 6, and 11. Binds edge labels to connectors via minimum point-to-polyline Euclidean distance.',
    how_analyzed_diagram: 'Global multi-pass OCR harvests canvas words. Targeted ROI OCR reads component labels with border and cylinder insets, followed by architectural lexicon normalization.',
    how_analyzed_requirements: 'Requirements text is parsed independently; OCR text labels are never invented or corrected by requirements to maintain audit objectivity.',
    step_by_step_breakdown: [
      'Step 1: Global dual-pass OCR (PSM 11 + PSM 3) harvests words and confidence scores.',
      'Step 2: Deduplicate overlapping tokens from multiple passes using IoU threshold 0.45.',
      'Step 3: Targeted ROI OCR on components with 2–4px border inset and cylinder cap masking.',
      'Step 4: Normalize architectural terms (PostgreSQL, Kafka, Redis) and bind labels via polyline distance.'
    ],
    status: 'Recorded',
    key_findings: 'Component labels and floating protocol annotations mapped to detected shape nodes.',
    output_summary: {
      global_ocr_psm: ['PSM_11_sparse', 'PSM_3_auto'],
      roi_ocr_psm: ['PSM_7_line', 'PSM_6_block', 'PSM_11_sparse'],
      token_iou_dedup_threshold: 0.45,
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_4_CONNECTOR_TRACING',
    stage_number: 4,
    stage_name: 'Topological Connector Tracing & Arrowhead Detection',
    why: 'Traces data flow lines and discovers arrow directions for both horizontal and vertical downward arrows.',
    why_plain_english: 'The system traces all arrows connecting boxes. It connects dashed and broken lines using stroke tangent vectors, and verifies arrowheads at endpoints using bilateral flare sampling for both horizontal arrows and vertical downward drop arrows (| v).',
    why_technical: 'Component boxes (+2px pad) and text blocks are masked. Vectorized Zhang-Suen 2-phase skeleton thinning preserves 8-connectivity. bridge_collinear_gaps() runs 4 BFS passes to compute tangent vectors, connecting dashed lines (≤ 45px) or text occlusions (coverage ≥ 60%) where cos(θ) > 0.85. detect_arrowhead_at_endpoint() evaluates normal sweep rays up to 36px, verifying shaft baseline ≤ 4.5px and bilateral flare width for horizontal and vertical downward arrows.',
    how_analyzed_diagram: 'Zhang-Suen thinning reduces strokes to 1px skeletons. Collinear gaps are bridged via BFS stroke tangents, and bilateral flare sweep lines detect arrowheads in any orientation.',
    how_analyzed_requirements: 'Connector direction is extracted strictly from visual pixels; uncertain or missing arrows are flagged as visual evidence uncertainties.',
    step_by_step_breakdown: [
      'Step 1: Mask component bounding boxes (+2px pad) and OCR text to isolate free connector ink.',
      'Step 2: Apply 2-phase vectorized Zhang-Suen thinning to generate 1-pixel skeleton paths.',
      'Step 3: Bridge collinear dashed lines (≤ 45px) and text occlusions using BFS stroke tangent vectors.',
      'Step 4: Probe perpendicular sweep lines (0..36px) to detect baseline shaft and bilateral flare arrowheads (→, | v).'
    ],
    status: 'Recorded',
    key_findings: 'Solid, dashed, and right-angle connectors traced with endpoint arrowhead orientation.',
    output_summary: {
      thinning_algorithm: 'zhang_suen_2phase_vectorized',
      collinear_gap_max_px: 45,
      arrowhead_probe_max_dist_px: 36,
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_5_REQUIREMENTS_PARSING',
    stage_number: 5,
    stage_name: 'Requirements Structural AST Compilation',
    why: 'Converts unstructured requirements documents into an unambiguous, typed Architectural Specification AST.',
    why_plain_english: 'The system reads the requirements document (PDF via pypdf, Word via python-docx, Markdown, or text) and extracts all mandatory components, allowed communication flows, security boundaries, and protocol rules with verbatim source quotations.',
    why_technical: 'Parses documents into strictly typed Pydantic models: Entity, Flow, and Zone. Enforces the zero-hallucination source quote containment invariant: every item source_quote must strictly exist as a verbatim substring in the raw source text (quote in source_normal), otherwise the extraction is rejected.',
    how_analyzed_diagram: 'Visual evidence graph is frozen and preserved as an immutable ground-truth benchmark.',
    how_analyzed_requirements: 'Ingests documents into structural AST entities, validating that all components, flows, and zones contain verifiable verbatim source quotes from the original specification.',
    step_by_step_breakdown: [
      'Step 1: Extract clean text from uploaded document (pypdf, python-docx, YAML, Markdown, TXT).',
      'Step 2: Compile requirements AST conforming to typed Pydantic models (Entity, Flow, Zone).',
      'Step 3: Validate verbatim substring containment invariant (quote in source_normal).',
      'Step 4: Verify referential integrity across flow endpoints and zone memberships.'
    ],
    status: 'Recorded',
    key_findings: 'Natural language requirements converted into strongly-typed AST specification.',
    output_summary: {
      document_parser: 'pypdf_docx_yaml_json_markdown',
      schema_engine: 'pydantic_v2',
      grounding_invariant: 'verbatim_substring_containment',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_6_DIFF_AUDITING',
    stage_number: 6,
    stage_name: 'Grounded Dual-Graph Alignment Diffing',
    why: 'Performs mathematical dual-graph alignment between the visual diagram and requirements to detect every discrepancy.',
    why_plain_english: 'The system compares the diagram graph with the requirements specification. It detects missing components, undocumented components, missing connections, reversed arrowheads, and security boundary violations, calculating the verified-check ratio from 0% to 100%.',
    why_technical: 'Deterministic dual-graph alignment compares Visual Graph G_V = (V_V, E_V) with Requirements Graph G_R = (V_R, E_R). Evaluates symmetric difference in vertices, directed flows, and security zones. Categorizes findings into Missing Component, Missing Flow, Reversed Flow, and Protocol Mismatch. Calculates the alignment score as the verified-check ratio: Score (%) = round(100 * N_verified / N_checked, 1).',
    how_analyzed_diagram: 'Visual nodes and edges provide the actual observed architecture facts.',
    how_analyzed_requirements: 'Requirements AST entities and flows provide the expected architecture specification.',
    step_by_step_breakdown: [
      'Step 1: Perform exact and compact alphanumeric label matching between visual nodes and requirement entities.',
      'Step 2: Identify missing components (v in V_R \\ V_V) and undocumented shadow IT (v in V_V \\ V_R).',
      'Step 3: Verify directed adjacency matrix: identify missing connectors and reversed data flows.',
      'Step 4: Calculate verified-check ratio score: Score (%) = round(100 * N_verified / N_checked, 1) and generate executive verdict.'
    ],
    status: 'Recorded',
    key_findings: 'Every discrepancy pinpointed with evidence citations and severity classification.',
    output_summary: {
      entity_matching: 'compact_alphanumeric_alias_intersection',
      scoring_model: 'verified_check_ratio_percentage',
      discrepancy_categories: ['missing_node', 'missing_edge', 'reversed_flow', 'forbidden_flow', 'zone_unconfirmed'],
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_7_ARCHITECTURE_SYNTHESIS',
    stage_number: 7,
    stage_name: 'Remediated Target Architecture Synthesis',
    why: 'Synthesizes an executable Mermaid architecture diagram showing the compliant, remediated design.',
    why_plain_english: 'The system generates a corrected architecture diagram in Mermaid flowchart TD code. It preserves what was correctly drawn (status: Unchanged), adds missing components (status: Added_From_Requirements), fixes reversed arrows, and escapes special characters to prevent syntax errors.',
    why_technical: 'Merges verified observed components (status: Unchanged) with missing requirements entities (status: Added_From_Requirements). Corrects reversed flows and removes forbidden bypass paths. Compiles sanitized Mermaid flowchart TD with subgraph groupings and entity escaping (&, ", <, >, |) to prevent syntax injection.',
    how_analyzed_diagram: 'Retains valid visual component positions and labels to maintain developer recognition.',
    how_analyzed_requirements: 'Injects mandatory missing services and correct directional data flows from the requirements AST.',
    step_by_step_breakdown: [
      'Step 1: Retain verified visual components with status Unchanged and provenance visual_observation.',
      'Step 2: Inject missing required services with status Added_From_Requirements.',
      'Step 3: Correct flow directions, add required protocol connectors, and remove forbidden bypasses.',
      'Step 4: Compile sanitized Mermaid flowchart TD code with subgraphs and escape entities (&, ", <, >, |).'
    ],
    status: 'Recorded',
    key_findings: 'Executable Mermaid flowchart TD code synthesized with interactive rendering and vector export.',
    output_summary: {
      target_flowchart_mode: 'flowchart_td',
      provenance_tracking: 'visual_observation_vs_requirement',
      syntax_sanitization: 'mermaid_text_entity_escaping',
      vector_export: 'svg_png_high_res_render',
      status: 'completed'
    }
  },
  {
    stage_id: 'STAGE_8_RAG_INDEXING',
    stage_number: 8,
    stage_name: 'Grounded RAG Multi-Source Evidence Indexing',
    why: 'Indexes visual coordinates, requirement clauses, and discrepancy findings for hallucination-free AI chat.',
    why_plain_english: 'The system indexes all visual evidence, requirement quotes, and audit findings into a local BM25 search index so you can ask any architectural question in the Copilot Chat and receive exact, verified answers referencing specific paragraphs and image coordinates.',
    why_technical: 'Chunks three distinct corpora: (1) Visual Evidence Chunks (bounding boxes, OCR confidence, pixel coordinates), (2) Requirements Spec Chunks (clause citations, paragraphs), and (3) Discrepancy Findings (severity, remediation rationale). Indexes into an in-memory BM25 lexical inverted index with stopword filtering and Okapi BM25 scoring (k1=1.5, b=0.75) for deterministic, reproducible retrieval without vector drift.',
    how_analyzed_diagram: 'Visual nodes, coordinates, and OCR tokens are chunked into searchable fact objects.',
    how_analyzed_requirements: 'Requirements paragraphs and acceptance criteria are indexed with clause identifiers.',
    step_by_step_breakdown: [
      'Step 1: Chunk visual evidence graph into spatially-referenced component and connector fact objects.',
      'Step 2: Chunk requirements document into clause-level paragraphs with markdown headers.',
      'Step 3: Generate metadata tags: source type, entity names, confidence scores, and discrepancy references.',
      'Step 4: Execute Okapi BM25 ranking (k1=1.5, b=0.75) and verify exact verbatim citations before delivering answers.'
    ],
    status: 'Recorded',
    key_findings: 'Evidence index initialized across visual bounding boxes, text clauses, and findings.',
    output_summary: {
      indexing_engine: 'local_bm25_lexical_retriever',
      scoring_function: 'okapi_bm25_k1_1.5_b_0.75',
      source_corpora: ['visual_evidence', 'requirements_spec', 'audit_discrepancies'],
      citation_verification: 'zero_hallucination_verbatim_grounding',
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
