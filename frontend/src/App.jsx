import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import AuditsHistoryDrawer from './components/AuditsHistoryDrawer';
import UploadAndConfig from './components/UploadAndConfig';
import VisualGraphViewer from './components/VisualGraphViewer';
import DiscrepancyView from './components/DiscrepancyView';
import MermaidViewer from './components/MermaidViewer';
import TransparencyDrawer from './components/TransparencyDrawer';
import RAGChatbot from './components/RAGChatbot';
import MethodologyModal from './components/MethodologyModal';
import { Layers, ShieldAlert, Sparkles, MessageSquare, BookOpen, CheckCircle } from './icons';

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [adminFilterAll, setAdminFilterAll] = useState(false);
  const [transparencyMode, setTransparencyMode] = useState(false);

  const [activeAudit, setActiveAudit] = useState(null);
  const [activeTab, setActiveTab] = useState('visual');
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');

  // Scroll to transparency panel when enabled
  useEffect(() => {
    if (transparencyMode) {
      setTimeout(() => {
        const el = document.getElementById('transparency-panel');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [transparencyMode]);

  // Check login on mount
  useEffect(() => {
    const token = localStorage.getItem('df_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Token expired');
        })
        .then((userData) => setUser(userData))
        .catch(() => {
          localStorage.removeItem('df_token');
          setUser(null);
        });
    }
  }, []);

  // Run new audit
  const handleRunAudit = async (formData) => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setLoading(true);
    setErrorBanner('');
    try {
      const token = localStorage.getItem('df_token');
      const res = await fetch('/api/audit/execute', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Audit execution failed');

      setActiveAudit(data);
      setActiveTab('visual');
    } catch (err) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load past audit from history
  const handleSelectAudit = async (auditId) => {
    setErrorBanner('');
    try {
      setLoading(true);
      const token = localStorage.getItem('df_token');
      const res = await fetch(`/api/audits/${auditId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load audit');

      setActiveAudit(data);
      setActiveTab('visual');
    } catch (err) {
      setErrorBanner(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('df_token');
    setUser(null);
    setActiveAudit(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070a12] text-slate-100 selection:bg-indigo-500/30 selection:text-white">
      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        transparencyMode={transparencyMode}
        setTransparencyMode={setTransparencyMode}
        onToggleHistory={() => setIsHistoryOpen(true)}
        onOpenMethodology={() => setIsMethodologyOpen(true)}
        adminFilterAll={adminFilterAll}
        setAdminFilterAll={setAdminFilterAll}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Sleek Methodology Ribbon */}
        <div className="p-3.5 px-4 rounded-2xl glass-card border border-indigo-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">8-Stage Architecture Analysis Pipeline</span>
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                  Classical FOCV + LangGraph
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Inspect how diagram images and requirements are parsed, compared, and remediated with full mathematical explainability.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsMethodologyOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 font-semibold text-xs transition flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0 shadow-sm"
          >
            <span>Explore Methodology</span>
            <span className="text-indigo-400 font-mono">→</span>
          </button>
        </div>

        {errorBanner && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg">
            <span>{errorBanner}</span>
            <button onClick={() => setErrorBanner('')} className="text-slate-400 hover:text-white ml-2 text-sm">✕</button>
          </div>
        )}

        {/* Input Section (Diagram + Any Document Format) */}
        <UploadAndConfig onRunAudit={handleRunAudit} loading={loading} />

        {/* TRANSPARENCY DRAWER / PANEL (Displayed whenever Transparency Mode is enabled!) */}
        <TransparencyDrawer audit={activeAudit} isEnabled={transparencyMode} />

        {/* Audit Results Dashboard */}
        {activeAudit && (
          <div className="space-y-6 animate-fade-in">
            {(activeAudit.status === 'needs_review' || activeAudit.warnings?.length > 0) && (
              <div role="status" className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
                <strong>Review required</strong>
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  {(activeAudit.warnings || ['Some diagram evidence remains uncertain.']).map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : JSON.stringify(warning)}</li>)}
                </ul>
              </div>
            )}
            {/* Dashboard Tabs */}
            <div className="flex rounded-2xl bg-slate-900/90 p-1.5 border border-slate-800 text-xs font-semibold overflow-x-auto shadow-lg backdrop-blur-md">
              <button
                onClick={() => setActiveTab('discrepancies')}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl transition-all duration-200 ${
                  activeTab === 'discrepancies'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Discrepancy Audit ({activeAudit.discrepancy_report?.discrepancies?.length || 0})</span>
              </button>

              <button
                onClick={() => setActiveTab('mermaid')}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl transition-all duration-200 ${
                  activeTab === 'mermaid'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Synthesized Target Architecture</span>
              </button>

              <button
                onClick={() => setActiveTab('visual')}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl transition-all duration-200 ${
                  activeTab === 'visual'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Layers className="w-4 h-4 text-purple-400" />
                <span>FOCV Visual Overlay &amp; Graphs</span>
              </button>

              <button
                onClick={() => setActiveTab('chat')}
                className={`flex items-center gap-2 py-2 px-4 rounded-xl transition-all duration-200 ${
                  activeTab === 'chat'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-blue-400" />
                <span>Grounded RAG Assistant</span>
              </button>
            </div>

            {/* Active Tab View */}
            {activeTab === 'discrepancies' && <DiscrepancyView audit={activeAudit} />}
            {activeTab === 'mermaid' && <MermaidViewer audit={activeAudit} />}
            {activeTab === 'visual' && <VisualGraphViewer audit={activeAudit} />}
            {activeTab === 'chat' && <RAGChatbot key={activeAudit.id} audit={activeAudit} />}
          </div>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(userData) => setUser(userData)}
      />

      {/* History Drawer */}
      <AuditsHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectAudit={handleSelectAudit}
        currentUser={user}
        adminFilterAll={adminFilterAll}
      />

      {/* Methodology & Flow Modal */}
      <MethodologyModal
        isOpen={isMethodologyOpen}
        onClose={() => setIsMethodologyOpen(false)}
      />
    </div>
  );
}
