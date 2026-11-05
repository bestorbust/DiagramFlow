import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check, Sparkles, Code } from '../icons';

let renderSequence = 0;
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MermaidViewer({ audit }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [svgSource, setSvgSource] = useState('');
  const [synthMode, setSynthMode] = useState('remediation'); // 'remediation' | 'requirements'
  const containerRef = useRef(null);

  const inner = audit?.synthesized_architecture?.synthesized_architecture || audit?.synthesized_architecture || {};
  const remediationCode = audit?.mermaid_code || inner.mermaid_code || '';
  const reqOnlyCode = inner.requirements_only_mermaid || audit?.requirements_only_mermaid || '';
  const code = (synthMode === 'requirements' && reqOnlyCode) ? reqOnlyCode : remediationCode;
  const remediation = synthMode === 'remediation' ? (inner.remediation_summary || []) : [];
  const filename = (audit?.diagram_name || 'architecture').replace(/[^a-zA-Z0-9_-]/g, '_');

  useEffect(() => {
    let cancelled = false;
    setSvgSource('');
    setError('');
    if (containerRef.current) containerRef.current.replaceChildren();
    if (!code) return;
    setRendering(true);
    const renderId = `diagramflow-mermaid-${++renderSequence}`;
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict',
          fontFamily: 'system-ui, sans-serif', flowchart: { htmlLabels: false }, suppressErrorRendering: true });
        const { svg } = await mermaid.render(renderId, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setSvgSource(svg);
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Diagram rendering failed: ${err.message || 'Invalid Mermaid syntax'}`);
          setShowCode(true);
        }
      } finally {
        document.getElementById(`d${renderId}`)?.remove();
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError('Clipboard unavailable. Select and copy the Mermaid code below.'); setShowCode(true); }
  };

  const exportPng = async () => {
    let url;
    try {
      const svg = containerRef.current?.querySelector('svg')?.cloneNode(true);
      if (!svg) throw new Error('Render the diagram before exporting.');
      const box = svg.viewBox.baseVal;
      const width = Math.max(1, box.width || 1200);
      const height = Math.max(1, box.height || 800);
      svg.setAttribute('width', width);
      svg.setAttribute('height', height);
      svg.style.maxWidth = 'none';
      url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Unable to rasterize the diagram. Download SVG instead.')); image.src = url; });
      const scale = Math.min(2, 8192 / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * scale);
      canvas.height = Math.ceil(height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#020617';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNG export failed. Download SVG instead.');
      download(blob, `${filename}_target.png`);
    } catch (err) { setError(err.message); }
    finally { if (url) URL.revokeObjectURL(url); }
  };

  if (!audit) return null;
  const buttonClass = 'px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-xs border border-slate-700 hover:bg-slate-700 disabled:opacity-40';
  return (
    <section className="glass-panel rounded-2xl p-6 shadow-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h3 className="font-bold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            {synthMode === 'requirements' ? 'Requirements Specification Architecture' : 'Proposed Target Remediation'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {synthMode === 'requirements'
              ? 'Synthesized purely and directly from the parsed architecture requirements specification.'
              : 'Synthesized remediation combining observed visual evidence with mandated requirements.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Synthesis Source Selector */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSynthMode('remediation')}
              className={`px-3 py-1.5 rounded-lg transition ${
                synthMode === 'remediation'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ⚡ Remediation (Hybrid)
            </button>
            <button
              type="button"
              onClick={() => setSynthMode('requirements')}
              className={`px-3 py-1.5 rounded-lg transition ${
                synthMode === 'requirements'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📄 Requirements Only
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} onClick={() => setShowCode(!showCode)}><Code className="inline w-4 h-4 mr-1" />{showCode ? 'Hide Code' : 'View Code'}</button>
            <button className={buttonClass} disabled={!code} onClick={copyCode}>{copied ? <Check className="inline w-4 h-4 mr-1" /> : <Copy className="inline w-4 h-4 mr-1" />}{copied ? 'Copied' : 'Copy Code'}</button>
            <button className={buttonClass} disabled={!svgSource} onClick={() => download(new Blob([svgSource], { type: 'image/svg+xml' }), `${filename}_${synthMode}.svg`)}>Download SVG</button>
            <button className={buttonClass} disabled={!svgSource} onClick={exportPng}>Download PNG</button>
          </div>
        </div>
      </div>
      {!code && <p role="status" className="text-amber-300 text-sm">No target diagram was generated. Check the audit status and provider configuration.</p>}
      {rendering && <p role="status" className="text-slate-400 text-sm">Rendering target diagram…</p>}
      <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 min-h-[300px] overflow-auto">
        <div ref={containerRef} className="min-w-[400px] flex justify-center" />
      </div>
      {error && <p role="alert" className="p-3 rounded-xl bg-amber-500/10 text-amber-300 text-xs whitespace-pre-wrap">{error}</p>}
      {remediation.length > 0 && <div className="space-y-2"><h4 className="text-sm font-bold">Proposed changes</h4><ul className="list-disc pl-5 text-sm text-slate-300 space-y-2">{remediation.map((item, index) => <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>)}</ul></div>}
      {showCode && <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-cyan-300 overflow-auto max-h-96">{code || 'No Mermaid source available.'}</pre>}
    </section>
  );
}
