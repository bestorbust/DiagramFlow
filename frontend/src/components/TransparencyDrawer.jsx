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
  ['PREPROCESSING', 'Image preprocessing', 'Normalize image polarity and contrast so dark and light diagrams can be analyzed.'],
  ['SHAPE_DETECTION', 'Component detection', 'Detect candidate component boundaries and enclosing groups. Shape detection can miss icons or mistake decoration for a component.'],
  ['OCR', 'Text recognition', 'Read labels with OCR and associate them with nearby detected components. OCR confidence is an estimate, not a guarantee.'],
  ['CONNECTOR_TRACING', 'Relationship tracing', 'Trace visible connector strokes between components and inspect arrowheads. Ambiguous direction remains unknown.'],
  ['REQUIREMENTS_PARSING', 'Requirements parsing', 'Convert the supplied document into components, groups, and flow constraints for comparison.'],
  ['DIFF_AUDITING', 'Graph comparison', 'Compare the extracted diagram graph with requirements and retain the evidence supporting each finding.'],
  ['ARCHITECTURE_SYNTHESIS', 'Target diagram synthesis', 'Generate a proposed target graph and Mermaid diagram from validated requirements and observed components.'],
  ['RAG_INDEXING', 'Evidence indexing', 'Index diagram evidence, requirements, and findings for retrieval with citations. Missing evidence limits what the assistant can answer.'],
].map(([id, name, description], index) => ({
  stage_id: `STAGE_${index + 1}_${id}`, stage_number: index + 1, stage_name: name,
  why: description, why_plain_english: description, status: 'not_run',
  key_findings: 'Run an audit to inspect this stage’s actual output.',
  how_analyzed_diagram: index < 4 ? description : 'Uses the extracted diagram graph as evidence.',
  how_analyzed_requirements: index < 4 ? 'Requirements do not determine what is detected in the image.' : description,
  output_summary: { status: 'not_run' },
}));

export default function TransparencyDrawer({ audit, isEnabled }) {

  const activeTraces = audit?.transparency_traces && audit.transparency_traces.length > 0
    ? audit.transparency_traces
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
