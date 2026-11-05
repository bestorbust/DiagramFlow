import React from 'react';
import { X, BookOpen } from '../icons';

const stages = [
  ['1–4 · Diagram extraction', 'Classical computer vision detects shapes, reads labels with Tesseract OCR, and traces visible connector strokes. Requirements are not used to invent missing visual detections. Labels, bounding boxes, directions, and uncertainty are retained for inspection.'],
  ['5 · Requirements', 'The uploaded document or edited text is parsed into a structured specification. The configured text model interprets free-form requirements; explicit structured requirements can be validated directly.'],
  ['6 · Comparison', 'The extracted components and relationships are compared against the specification. Findings identify their visual evidence and requirement clause. Detection gaps may appear as unobserved requirements; the alignment score is not a measure of extraction accuracy.'],
  ['7 · Proposed target', 'A target graph is assembled from observed components and required changes, then rendered as Mermaid. Download the generated diagram as SVG or PNG. The target is a proposed architecture, not a deployment or a proof of security.'],
  ['8 · Grounded Q&A', 'The assistant retrieves relevant evidence from this audit and cites its sources. Questions unsupported by the evidence should receive an explicit limitation. Citations make answers inspectable but cannot guarantee that every interpretation is correct.'],
];

export default function MethodologyModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="methodology-title" className="glass-panel rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <header className="flex items-center justify-between gap-4">
          <h2 id="methodology-title" className="text-lg font-bold flex items-center gap-2"><BookOpen className="text-indigo-400" /> How DiagramFlow works</h2>
          <button onClick={onClose} aria-label="Close methodology" className="p-2 rounded-lg hover:bg-slate-800"><X /></button>
        </header>
        <p className="text-sm text-slate-300">The pipeline runs automatically from a diagram and requirements. Its outputs include confidence estimates and review warnings where the available evidence is incomplete.</p>
        {stages.map(([title, description]) => <div key={title} className="rounded-xl bg-slate-950 border border-slate-800 p-4"><h3 className="font-bold text-sm text-indigo-300">{title}</h3><p className="mt-2 text-sm text-slate-300 leading-relaxed">{description}</p></div>)}
        <p className="text-xs text-amber-200">Best results use readable labels and visible connector strokes. Dense icon layouts, low resolution, crossed lines, and faint arrowheads can reduce extraction accuracy. The transparency panel shows actual stage outputs after an audit.</p>
      </section>
    </div>
  );
}
