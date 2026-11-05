import React, { useEffect, useState } from 'react';
import { X, Clock, Shield, User, ChevronRight, CheckCircle2, AlertTriangle, FileText } from '../icons';

export default function AuditsHistoryDrawer({ isOpen, onClose, onSelectAudit, currentUser, adminFilterAll }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) fetchAudits();
  }, [isOpen, adminFilterAll]);

  const fetchAudits = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('df_token');
      const res = await fetch(`/api/audits?all_users=${currentUser?.role === 'admin' && adminFilterAll ? 'true' : 'false'}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to load audits');
      const data = await res.json();
      setAudits(data.audits || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md glass-panel border-l border-slate-700/80 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <h2 className="font-bold text-white text-base">
                {currentUser?.role === 'admin' && adminFilterAll ? 'All User Audits (Admin)' : 'My Audit History'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">Loading audit history...</div>
            ) : error ? (
              <div className="p-3 rounded-lg bg-rose-500/10 text-rose-300 text-xs">{error}</div>
            ) : audits.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">No architecture audits recorded yet.</div>
            ) : (
              audits.map((a) => (
                <div
                  key={a.id}
                  onClick={() => { onSelectAudit(a.id); onClose(); }}
                  className="group p-3.5 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800 hover:border-blue-500/40 cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-sm text-white group-hover:text-blue-400 transition truncate">
                      {a.diagram_name}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      a.executive_verdict === 'Compliant'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {a.executive_verdict || 'Audited'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-slate-300">{a.username}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Score: <strong className="text-slate-300">{a.alignment_score}%</strong>
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                    <span className="flex items-center text-blue-400 group-hover:translate-x-1 transition">
                      View Details <ChevronRight className="w-3 h-3 ml-0.5" />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

