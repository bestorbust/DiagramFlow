import React, { useState, useEffect } from 'react';
import { Eye, Layers, Box, GitBranch, Code, Copy, Check } from '../icons';

export default function VisualGraphViewer({ audit }) {
  const [viewMode, setViewMode] = useState('overlay'); // 'overlay', 'original', 'json'
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => setImageError(false), [audit?.id, viewMode]);

  if (!audit) return null;

  const archGraph = audit.architecture_graph || {};
  const evidenceGraph = audit.visual_evidence_graph || {};
  const components = archGraph.components || [];
  const relationships = archGraph.relationships || [];
  const labels = Object.fromEntries(components.map(component => [component.id, component.label || component.id]));
  const imageUrl = viewMode === 'overlay' ? audit.overlay_url || audit.overlay_path : audit.image_url || audit.image_path;
  const uncertainties = evidenceGraph.uncertainties || [];

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ architecture_graph: archGraph, visual_evidence_graph: evidenceGraph }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setCopyError('Clipboard unavailable. Select and copy the JSON below.'); }
  };

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>FOCV Visual Detections &amp; Evidence Graph</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Classical computer vision detections with OCR labels, connector directions, and confidence estimates.
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setViewMode('overlay')}
            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'overlay' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Visual Overlay
          </button>
          <button
            onClick={() => setViewMode('original')}
            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'original' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            Raw Diagram
          </button>
          <button
            onClick={() => setViewMode('json')}
            className={`px-3 py-1.5 rounded-lg transition ${viewMode === 'json' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
          >
            JSON Graphs
          </button>
        </div>
      </div>

      {viewMode === 'overlay' || viewMode === 'original' ? (
        <div className="space-y-6">
          <div className="rounded-2xl bg-slate-950/90 border border-slate-800 p-4 flex items-center justify-center min-h-[340px] overflow-hidden shadow-inner relative group">
            {imageUrl && !imageError ? <img
              src={imageUrl}
              onError={() => setImageError(true)}
              alt="Diagram Visual"
              className="max-h-[480px] max-w-full object-contain rounded-lg shadow-xl"
            /> : <p role="status" className="text-sm text-amber-300">Diagram image unavailable. Reload this audit from history to refresh the image link.</p>}
            <span className="absolute bottom-3 right-3 text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-700">
              {viewMode === 'overlay' ? 'Annotated Bounding Boxes & Arrowheads' : 'Original Source Image'}
            </span>
          </div>

          {/* Detections Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Components Detected */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Extracted Components ({components.length})
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  Detected
                </span>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {components.length === 0 && <p className="text-amber-300 text-xs py-4">No components detected. Try a clearer source image and inspect the original diagram.</p>}
                {components.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs hover:border-slate-700 transition">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[10px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <span className="font-bold text-white">{c.label || `Unlabeled ${c.id}`}</span>
                      <span className="text-[10px] text-slate-500 font-mono">({c.shape})</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/25">
                      {c.type || 'Unknown'} · {Number.isFinite(c.confidence) ? `${Math.round(c.confidence * 100)}% confidence` : 'Confidence unavailable'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connectors Detected */}
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Traced Connectors &amp; Directions ({relationships.length})
                  </h4>
                </div>
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 font-bold">
                  Skeletonized
                </span>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {relationships.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No connectors traced.</p>
                ) : (
                  relationships.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs hover:border-slate-700 transition">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-semibold text-slate-200 truncate">{r.source_label || labels[r.source] || r.source}</span>
                        <span className="text-indigo-400 font-bold">{r.direction === 'bidirectional' ? '↔' : ['forward', 'directed', 'DIRECTED'].includes(r.direction) ? '→' : r.direction === 'backward' ? '←' : '—'}</span>
                        <span className="font-semibold text-slate-200 truncate">{r.target_label || labels[r.target] || r.target}</span>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 whitespace-nowrap ml-2">
                        {r.direction || 'unknown'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">Architecture &amp; Visual Evidence Graphs (JSON)</span>
            <button
              onClick={handleCopyJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied JSON!' : 'Copy Graph JSON'}</span>
            </button>
          </div>
          <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-emerald-400/90 max-h-[460px] overflow-auto leading-relaxed shadow-inner">
            {JSON.stringify({ architecture_graph: archGraph, visual_evidence_graph: evidenceGraph }, null, 2)}
          </pre>
        </div>
      )}
      {copyError && <p role="alert" className="text-amber-300 text-xs">{copyError}</p>}
      {uncertainties.length > 0 && <details className="text-xs text-amber-300"><summary>Uncertain detections ({uncertainties.length})</summary><ul className="list-disc pl-5 mt-2 space-y-1">{uncertainties.map((item, index) => <li key={index}>{item.detail || item.description || JSON.stringify(item)}</li>)}</ul></details>}
    </div>
  );
}
