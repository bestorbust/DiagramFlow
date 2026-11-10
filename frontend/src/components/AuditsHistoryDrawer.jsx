import React, { useEffect, useState } from 'react';
import { X, Clock, Shield, User, ChevronRight, CheckCircle2, AlertTriangle, FileText } from '../icons';

export default function AuditsHistoryDrawer({ isOpen, onClose, onSelectAudit, currentUser, adminFilterAll, setAdminFilterAll }) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (isOpen) fetchAudits();
  }, [isOpen, adminFilterAll, currentUser]);

  const fetchAudits = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('df_token');
      const shouldFetchAll = currentUser?.role === 'admin' && adminFilterAll;
      const res = await fetch(`/api/audits?all_users=${shouldFetchAll ? 'true' : 'false'}`, {
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

  const filteredAudits = audits.filter((a) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const diagramName = (a.diagram_name || '').toLowerCase();
    const username = (a.username || '').toLowerCase();
    const verdict = (a.executive_verdict || '').toLowerCase();
    return diagramName.includes(query) || username.includes(query) || verdict.includes(query);
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md glass-panel border-l border-slate-700/80 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                <h2 className="font-bold text-white text-base">
                  {currentUser?.role === 'admin' && adminFilterAll ? 'All Architecture Audits' : 'My Audit History'}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {filteredAudits.length}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Admin Filter Tabs */}
            {currentUser?.role === 'admin' && setAdminFilterAll && (
              <div className="flex rounded-lg bg-slate-900/90 p-1 mb-3 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdminFilterAll(true)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    adminFilterAll
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Users Audits
                </button>
                <button
                  type="button"
                  onClick={() => setAdminFilterAll(false)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
                    !adminFilterAll
                      ? 'bg-purple-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  My Audits Only
                </button>
              </div>
            )}

            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by diagram name or user..."
              className="w-full px-3 py-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-slate-400 text-xs">Loading audit history...</div>
            ) : error ? (
              <div className="p-3 rounded-lg bg-rose-500/10 text-rose-300 text-xs">{error}</div>
            ) : filteredAudits.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                {searchQuery ? 'No matching audits found.' : 'No architecture audits recorded yet.'}
              </div>
            ) : (
              filteredAudits.map((a) => (
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
                      Score: <strong className="text-slate-300">{typeof a.alignment_score === 'number' ? Math.round(a.alignment_score) : a.alignment_score}%</strong>
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

