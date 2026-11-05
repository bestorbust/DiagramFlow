import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Bot, User, Sparkles, ShieldCheck, AlertCircle } from '../icons';

export default function RAGChatbot({ audit }) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setMessages([]);
    setHistoryLoading(true);
    setHistoryError('');
    if (audit?.id) {
      fetch(`/api/audits/${audit.id}/chat`, {
        signal: controller.signal,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('df_token')}` }
      })
        .then((r) => { if (!r.ok) throw new Error('Could not load conversation history.'); return r.json(); })
        .then((data) => setMessages(data.messages || []))
        .catch((error) => { if (error.name !== 'AbortError') setHistoryError(error.message); })
        .finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    }
    else setHistoryLoading(false);
    return () => controller.abort();
  }, [audit?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async (queryText) => {
    const text = queryText || inputQuery;
    if (!text.trim() || !audit?.id || loading || historyLoading) return;

    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const res = await fetch(`/api/audits/${audit.id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('df_token')}`
        },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Chat query failed');

      const botMsg = { role: 'assistant', content: data.answer, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, created_at: new Date().toISOString() }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const sampleQueries = [
    'Which discrepancies were detected?',
    'What components were visually detected?',
    'Which relationships have uncertain direction?',
    'What changes are required by the specification?'
  ];

  return (
    <div className="glass-panel rounded-2xl p-6 shadow-2xl flex flex-col h-[540px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Grounded Architecture Assistant</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                Evidence citations
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Answers from retrieved diagram evidence and specification clauses.
            </p>
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      {historyError && <p role="alert" className="text-amber-300 text-xs py-2">{historyError}</p>}
      {historyLoading && <p role="status" className="text-slate-400 text-xs py-2">Loading conversation…</p>}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-200">Interactive Architecture Q&amp;A</p>
              <p className="text-xs text-slate-400 max-w-md mt-1">
                Ask about security boundaries, discrepancies, missing components, or compliance rules. The assistant will refuse to guess details not in the evidence.
              </p>
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="flex flex-wrap justify-center gap-2 max-w-lg pt-2">
              {sampleQueries.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(q)}
                  disabled={historyLoading || loading}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs border border-slate-800 hover:border-slate-700 transition"
                >
                  "{q}"
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`max-w-[80%] p-3.5 rounded-2xl text-xs leading-relaxed shadow-md ${
                  m.role === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none'
                    : 'bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-none font-sans'
                }`}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.created_at && (
                  <span className={`text-[9px] font-mono mt-1.5 block opacity-60 ${m.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span>Verifying visual coordinates &amp; requirements evidence...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="flex items-center gap-2 pt-3 border-t border-slate-800 flex-shrink-0"
      >
        <input
          type="text"
          value={inputQuery}
          maxLength={4000}
          disabled={loading || historyLoading}
          onChange={(e) => setInputQuery(e.target.value)}
          placeholder="Ask an architectural question about this audit (e.g. 'Why was the Redis connector flagged?')..."
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 shadow-inner"
        />
        <button
          type="submit"
          disabled={!inputQuery.trim() || loading || historyLoading || !audit?.id}
          className="p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-indigo-600/20 disabled:opacity-40 transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
