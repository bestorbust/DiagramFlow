import React from 'react';
import { Eye, EyeOff, Shield, User, History, LogIn, LogOut, Cpu, Sparkles, BookOpen } from '../icons';

export default function Navbar({
  user,
  onOpenAuth,
  onLogout,
  transparencyMode,
  setTransparencyMode,
  onToggleHistory,
  onOpenMethodology,
  adminFilterAll,
  setAdminFilterAll
}) {
  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 px-4 sm:px-6 py-3 transition-all duration-200">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-600 to-cyan-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-indigo-400">
              <Cpu className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-base sm:text-lg tracking-tight text-white">DiagramFlow</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/25">
                AI v2.0
              </span>
              <span className="hidden md:inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Classical CV + LangGraph
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">Automated Architecture Understanding &amp; Security Auditing</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Methodology & Flow Guide */}
          <button
            onClick={onOpenMethodology}
            className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 transition shadow-sm"
            title="Complete 8-Stage Architecture Flow & Mathematical Rationale"
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Methodology Guide</span>
          </button>

          {/* THE TRANSPARENCY TOGGLE BUTTON */}
          <button
            onClick={() => setTransparencyMode(!transparencyMode)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-300 border ${
              transparencyMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 glow-amber'
                : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:text-white hover:border-slate-600 hover:bg-slate-800'
            }`}
            title="Toggle full stage-by-stage transparency traces and why each stage exists"
          >
            <span className={`w-2 h-2 rounded-full ${transparencyMode ? 'bg-amber-400 animate-ping' : 'bg-slate-500'}`} />
            <span>Transparency: <strong className={transparencyMode ? 'text-amber-300' : 'text-slate-400'}>{transparencyMode ? 'ON' : 'OFF'}</strong></span>
          </button>

          {/* Admin All Audits Toggle */}
          {user && user.role === 'admin' && (
            <button
              onClick={() => setAdminFilterAll(!adminFilterAll)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                adminFilterAll
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 glow-purple'
                  : 'bg-slate-900/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-purple-400" />
              <span>{adminFilterAll ? 'Admin: All Audits' : 'Admin: My Audits'}</span>
            </button>
          )}

          {/* History Button */}
          {user && (
            <button
              onClick={onToggleHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition"
            >
              <History className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Audit History</span>
            </button>
          )}

          {/* Auth State Button */}
          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-semibold text-white truncate max-w-[100px]">{user.username}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300">
                  {user.role}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In / Register</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
