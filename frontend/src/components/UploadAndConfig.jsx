import React, { useState, useEffect, useRef } from 'react';
import { Upload, Sparkles, CheckCircle, ArrowRight, RefreshCw, X, Image as ImageIcon, FileText } from '../icons';

export default function UploadAndConfig({ onRunAudit, loading }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [requirementsText, setRequirementsText] = useState('');
  const diagramInputRef = useRef(null);

  // Requirements document upload state
  const [reqUploadMode, setReqUploadMode] = useState('upload'); // 'upload' or 'paste'
  const [uploadedDocMeta, setUploadedDocMeta] = useState(null);
  const [parsingDoc, setParsingDoc] = useState(false);
  const [docError, setDocError] = useState('');
  const [reqFile, setReqFile] = useState(null);
  const reqFileInputRef = useRef(null);

  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    }
  };

  const clearDiagramFile = () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
    if (diagramInputRef.current) diagramInputRef.current.value = '';
  };

  const handleReqDocumentUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingDoc(true);
    setDocError('');
    setUploadedDocMeta(null);
    setRequirementsText('');
    setReqFile(file);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/requirements/parse-document', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('df_token')}` },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to parse document');
      }

      const data = await res.json();
      setUploadedDocMeta(data);
      setRequirementsText(data.extracted_text || '');
    } catch (err) {
      setDocError(`Could not extract requirements: ${err.message}. Choose a supported document or paste the text.`);
      setReqFile(null);
    } finally {
      setParsingDoc(false);
    }
  };

  const clearUploadedDoc = () => {
    setUploadedDocMeta(null);
    setReqFile(null);
    setDocError('');
    if (reqFileInputRef.current) reqFileInputRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('requirements_text', requirementsText);
    formData.append('image_file', selectedFile);
    formData.append('diagram_name', selectedFile.name.replace(/\.[^/.]+$/, ''));

    onRunAudit(formData);
  };

  return (
    <div className="glass-panel rounded-2xl p-5 sm:p-6 shadow-2xl transition-all duration-300">
      {/* Title header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-slate-800/80">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <span>Architecture Audit Input</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Upload an architecture diagram and its formal requirements specification (supports <strong>PDF, Word, Markdown, Text, JSON, YAML</strong>).
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left: Diagram Image Upload */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <span>1. Upload Diagram Image</span>
              </label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={clearDiagramFile}
                  className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold transition px-2 py-0.5 rounded bg-slate-950 border border-rose-900/40"
                  title="Remove selected diagram"
                >
                  Remove Image
                </button>
              )}
            </div>

            <div className="h-60 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500/60 bg-slate-950/60 p-4 flex flex-col items-center justify-center relative transition group cursor-pointer">
              <input
                ref={diagramInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              {filePreview ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center">
                  <img
                    src={filePreview}
                    alt="Uploaded Diagram"
                    className="max-h-48 max-w-full object-contain rounded shadow-md"
                  />
                  <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between pointer-events-none">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-cyan-300 border border-slate-800 truncate max-w-[200px]">
                      {selectedFile?.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900/90 text-slate-400 border border-slate-800">
                      {(selectedFile?.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-2.5">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/25 flex items-center justify-center text-cyan-400 mx-auto group-hover:scale-110 transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Click or drag &amp; drop architecture diagram</p>
                    <p className="text-[10px] text-slate-400 mt-1">PNG, JPG, or WebP &bull; High resolution recommended</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Requirements Document Input */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-indigo-400" />
                <span>2. Upload / Input Requirements</span>
              </label>
              <div className="flex items-center rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => setReqUploadMode('upload')}
                  className={`px-2.5 py-1 rounded-md transition font-semibold ${
                    reqUploadMode === 'upload' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => setReqUploadMode('paste')}
                  className={`px-2.5 py-1 rounded-md transition font-semibold ${
                    reqUploadMode === 'paste' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Direct Editor
                </button>
              </div>
            </div>

            {/* Document Upload Zone */}
            {reqUploadMode === 'upload' && (
              <div className="p-3.5 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-950/20 text-center relative transition hover:border-indigo-400 group">
                <input
                  ref={reqFileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown,.json,.yaml,.yml,.csv,.tsv,.html,.xml,.rtf"
                  onChange={handleReqDocumentUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="py-1.5 space-y-1">
                  <Upload className="w-6 h-6 text-indigo-400 mx-auto group-hover:scale-110 transition" />
                  <p className="text-xs font-semibold text-slate-200">
                    Upload Requirements Document
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Select a file to automatically extract architectural specifications
                  </p>
                  <div className="flex flex-wrap justify-center gap-1 pt-1">
                    {['PDF', 'DOCX', 'TXT', 'Markdown', 'JSON', 'YAML', 'CSV'].map((ext) => (
                      <span key={ext} className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-slate-900/90 text-indigo-300 border border-indigo-500/20">
                        {ext}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Parsing Indicator */}
            {parsingDoc && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Extracting document text and analyzing architectural concepts...</span>
              </div>
            )}

            {/* Document Analysis Meta Badge */}
            {uploadedDocMeta && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="font-semibold text-emerald-300 block truncate">{uploadedDocMeta.filename}</span>
                    <span className="text-[10px] text-slate-400">
                      {uploadedDocMeta.doc_type} &bull; {uploadedDocMeta.word_count || 0} words &bull; {uploadedDocMeta.character_count || 0} characters
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearUploadedDoc}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  title="Remove uploaded document"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {docError && <p role="alert" className="text-xs text-rose-300">{docError}</p>}

            {/* Requirements Text Area */}
            <textarea
              required
              rows={reqUploadMode === 'upload' ? (uploadedDocMeta ? 4 : 5) : 8}
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              placeholder="Requirements text will appear here once uploaded, or paste directly: mandatory services, databases, protocols, security zones, and communication constraints..."
              className="w-full p-3 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 leading-relaxed resize-none shadow-inner"
            />
          </div>
        </div>

        {/* Submit Execution Button */}
        <div className="flex justify-end pt-3 border-t border-slate-800/80">
          <button
            type="submit"
            disabled={loading || parsingDoc || !requirementsText.trim() || !selectedFile}
            className="flex items-center justify-center gap-2.5 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Executing End-to-End FOCV &amp; LangGraph Pipeline...</span>
              </>
            ) : (
              <>
                <span>Execute End-to-End Audit &amp; Remediate</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
