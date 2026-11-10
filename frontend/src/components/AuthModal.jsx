import React, { useState } from 'react';
import { X, Lock, User, KeyRound, AlertCircle, CheckCircle2 } from '../icons';

export default function AuthModal({ isOpen, onClose, onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        // Register API
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
          if (data.detail === 'Username is already taken.') {
            throw new Error('Username is already registered. Switch to "Sign In" to log in with this account.');
          }
          throw new Error(data.detail || 'Registration failed');
        }

        // Automatically log in with received token
        localStorage.setItem('df_token', data.token);
        onLoginSuccess({ username: data.username, role: data.role, id: data.id });
        onClose();
      } else {
        // Login API (OAuth2 form-encoded)
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString()
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Invalid credentials');

        localStorage.setItem('df_token', data.access_token);
        onLoginSuccess({ username: data.username, role: data.role, id: data.id });
        onClose();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md glass-panel rounded-2xl p-6 border border-slate-700/80 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-purple-600 mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20 mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">
            {isRegister ? 'Create DiagramFlow Account' : 'Sign in to DiagramFlow'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isRegister
              ? 'Self-register to save and manage your architecture diagram audits'
              : 'Enter your credentials to access your architecture audits'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-lg bg-slate-900/80 p-1 mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
              !isRegister ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition ${
              isRegister ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Register User
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full pl-9 pr-3 py-2 bg-slate-900/90 border border-slate-700/80 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs transition shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : isRegister ? 'Register & Sign In' : 'Sign In'}
          </button>
        </form>

        {/* Admin Credentials Hint & Quick Fill */}
        <div className="mt-5 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              Default Administrator:
            </span>
            <button
              type="button"
              onClick={() => {
                setIsRegister(false);
                setUsername('admin');
                setPassword('admin123');
                setError('');
              }}
              className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition"
            >
              Fill Admin Credentials
            </button>
          </div>
          <p className="font-mono text-slate-300">
            Username: <code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">admin</code>
            {' '}| Password: <code className="text-amber-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">admin123</code> <span className="text-slate-500">(or admin)</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-1.5">
            The Admin account has full visibility into <strong>ALL audits</strong> across all users in the system.
          </p>
        </div>
      </div>
    </div>
  );
}

