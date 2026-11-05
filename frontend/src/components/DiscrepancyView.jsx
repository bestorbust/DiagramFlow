import React, { useState } from 'react';
import { AlertCircle, CheckCircle, ShieldAlert, AlertTriangle, ArrowRight, Filter, ShieldCheck } from '../icons';

export default function DiscrepancyView({ audit }) {
  const [filterSeverity, setFilterSeverity] = useState('ALL');

  if (!audit) return null;

  const report = audit.discrepancy_report || {};
  const summary = report.audit_summary || {};
  const discrepancies = report.discrepancies || [];

  const [reviews, setReviews] = useState(() => {
    const init = {};
    for (const d of discrepancies) {
      if (d.user_review?.decision) {
        init[d.id] = d.user_review.decision;
      }
    }
    return init;
  });

  const handleReview = async (discrepancyId, decision) => {
    setReviews((prev) => ({ ...prev, [discrepancyId]: decision }));
    const token = localStorage.getItem('df_token');
    if (!token || !audit.id) return;
    try {
      await fetch(`/api/audits/${audit.id}/discrepancies/${discrepancyId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ decision })
      });
    } catch (e) {
      console.error('Failed to save review', e);
    }
  };

  const filteredDiscrepancies = filterSeverity === 'ALL'
    ? discrepancies
    : discrepancies.filter((d) => d.severity === filterSeverity);

  const getSeverityStyle = (sev) => {
    switch (sev) {
      case 'CRITICAL':
        return {
          badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40 glow-rose',
          border: 'border-l-rose-500',
          dot: 'bg-rose-500'
        };
      case 'HIGH':
        return {
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/40 glow-amber',
          border: 'border-l-amber-500',
          dot: 'bg-amber-500'
        };
      case 'MEDIUM':
        return {
          badge: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
          border: 'border-l-blue-500',
          dot: 'bg-blue-500'
        };
      default:
        return {
          badge: 'bg-slate-700/40 text-slate-300 border-slate-600',
          border: 'border-l-slate-500',
          dot: 'bg-slate-500'
        };
    }
  };

  const countBySeverity = {
    CRITICAL: discrepancies.filter(d => d.severity === 'CRITICAL').length,
    HIGH: discrepancies.filter(d => d.severity === 'HIGH').length,
    MEDIUM: discrepancies.filter(d => d.severity === 'MEDIUM').length,
    LOW: discrepancies.filter(d => d.severity === 'LOW').length,
  };

  const rawScore = summary.alignment_score_percentage ?? audit.alignment_score;
  const alignmentScore = Number.isFinite(Number(rawScore)) && rawScore != null ? Math.max(0, Math.min(100, Number(rawScore))) : null;
  const isCompliant = audit.status !== 'needs_review' && summary.executive_verdict === 'Compliant' && discrepancies.length === 0;

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-2xl space-y-6">
      {/* Top Executive Summary Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-950/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl flex-shrink-0 ${
            isCompliant
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-emerald-500/20'
              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-rose-500/20'
          }`}>
            {isCompliant ? <ShieldCheck className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Executive Verdict:</span>
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider border shadow-sm ${
                isCompliant
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {summary.executive_verdict || audit.executive_verdict || 'Not assessed'}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Compares extracted diagram evidence against the supplied requirements. Review uncertain detections before relying on this assessment.
            </p>
          </div>
        </div>

        {/* Alignment Score Meter & Distribution */}
        <div className="flex items-center gap-5 bg-slate-950/90 px-5 py-3 rounded-2xl border border-slate-800 self-start md:self-auto shadow-inner">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Alignment Score</span>
            <span className="text-3xl font-extrabold text-white font-mono">{alignmentScore == null ? 'N/A' : `${alignmentScore}%`}</span>
          </div>

          <div className="w-24 h-2.5 rounded-full bg-slate-800 overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                alignmentScore > 75 ? 'bg-emerald-500' : alignmentScore > 45 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${alignmentScore ?? 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Discrepancies Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Audit Discrepancies ({discrepancies.length})
          </h3>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25">
              {countBySeverity.CRITICAL} Critical
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25">
              {countBySeverity.HIGH} High
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25">
              {countBySeverity.MEDIUM} Medium
            </span>
          </div>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`px-3 py-1 rounded-lg font-semibold transition text-xs ${
                filterSeverity === sev
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {filteredDiscrepancies.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/30 border border-slate-800 text-slate-400 text-xs space-y-2">
          <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto" />
          <p className="font-semibold text-slate-200">No discrepancies matching "{filterSeverity}".</p>
          <p className="text-[11px] text-slate-500">No findings were returned for this filter. This does not establish that every requirement was verified.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDiscrepancies.map((d, idx) => {
            const style = getSeverityStyle(d.severity);
            return (
              <div
                key={d.id || idx}
                className={`p-5 rounded-2xl bg-slate-900/80 border border-slate-800 border-l-4 ${style.border} hover:border-slate-700 transition shadow-lg space-y-3.5`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${style.badge}`}>
                      {d.severity}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-400">{d.id}</span>
                    <span className="text-sm font-bold text-white">{d.title}</span>
                  </div>
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-800">
                    Category: {d.category}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed">{d.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/25">
                    <span className="font-bold text-cyan-300 block mb-1 text-[11px] uppercase tracking-wide">
                      Visual Diagram Reality (FOCV)
                    </span>
                    <span className="text-slate-300 text-xs">{d.visual_evidence || 'Not observed in diagram.'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-indigo-500/25">
                    <span className="font-bold text-indigo-300 block mb-1 text-[11px] uppercase tracking-wide">
                      Requirements Specification Rule
                    </span>
                    <span className="text-slate-300 text-xs">{d.requirements_clause || 'Mandated in specification.'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs">
                  <span className="font-bold text-emerald-300 block mb-0.5 text-[11px] uppercase tracking-wide">
                    Automated Remediation Action
                  </span>
                  <span className="text-slate-200 text-xs leading-relaxed">{d.recommendation}</span>
                </div>

                {/* User Human-In-The-Loop Review Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400">Review Action:</span>
                    <button
                      type="button"
                      onClick={() => handleReview(d.id, 'accepted')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                        reviews[d.id] === 'accepted'
                          ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60 shadow-sm shadow-emerald-500/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-300 hover:border-emerald-500/40'
                      }`}
                    >
                      ✓ Accept Discrepancy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(d.id, 'rejected')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                        reviews[d.id] === 'rejected'
                          ? 'bg-rose-500/25 text-rose-300 border-rose-500/60 shadow-sm shadow-rose-500/30 line-through'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-300 hover:border-rose-500/40'
                      }`}
                    >
                      ✕ Reject / False Positive
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(d.id, 'flagged')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition border ${
                        reviews[d.id] === 'flagged'
                          ? 'bg-amber-500/25 text-amber-300 border-amber-500/60 shadow-sm shadow-amber-500/30'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-amber-300 hover:border-amber-500/40'
                      }`}
                    >
                      ⚐ Flag for Discussion
                    </button>
                  </div>
                  {reviews[d.id] && (
                    <span className={`text-[10px] font-mono px-2.5 py-1 rounded uppercase font-bold tracking-wider border ${
                      reviews[d.id] === 'accepted'
                        ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                        : reviews[d.id] === 'rejected'
                        ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                        : 'bg-amber-950/80 text-amber-300 border-amber-500/40'
                    }`}>
                      Decision: {reviews[d.id]}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
