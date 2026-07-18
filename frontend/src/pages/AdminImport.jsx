import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';
import { typeLabel } from '../components/QuestionView.jsx';

const SAMPLE = `1. What does CPU stand for?
A. Central Processing Unit
B. Computer Personal Unit
C. Central Process Union
Answer: A
Explanation: CPU = Central Processing Unit.

2. Which of these are programming languages? (Choose two)
A. Python
B. HTML
C. Java
Answer: A, C`;

export default function AdminImport() {
  const nav = useNavigate();
  const toast = useToast();
  const fileRef = useRef();
  const [status, setStatus] = useState(null);
  const [exams, setExams] = useState([]);
  const [source, setSource] = useState('pdf');    // 'pdf' | 'text'
  const [method, setMethod] = useState('ai');      // 'ai' | 'structured'
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});
  const [target, setTarget] = useState('new');
  const [newExam, setNewExam] = useState({ title: '', vendor: 'Microsoft', category: 'Cloud', duration_minutes: 60, passing_score: 70 });
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [st, ex] = await Promise.all([api.get('/import/status'), api.get('/exams')]);
        setStatus(st); setExams(ex);
        setMethod(st.aiEnabled ? 'ai' : 'structured');
      } catch (e) { toast.error(e.message); }
    })();
  }, []);

  function afterParse(data, fileName) {
    setResult(data);
    setSelected(Object.fromEntries(data.questions.map((_, i) => [i, true])));
    if (fileName && !newExam.title) setNewExam((n) => ({ ...n, title: fileName.replace(/\.pdf$/i, '') }));
    if (data.count === 0) toast.error('No questions found. Try the other method or check the format.');
    else toast.success(`Extracted ${data.count} questions (${data.method === 'ai' ? 'AI' : 'parser'})`);
  }

  async function parsePdf(file) {
    setParsing(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('method', method);
      afterParse(await api.upload('/import/pdf', fd), file.name);
    } catch (e) { toast.error(e.message); } finally { setParsing(false); }
  }

  async function parseText() {
    if (!rawText.trim()) return toast.error('Paste some exam text first.');
    setParsing(true); setResult(null);
    try {
      afterParse(await api.post('/import/text', { text: rawText, method }));
    } catch (e) { toast.error(e.message); } finally { setParsing(false); }
  }

  async function commit() {
    const chosen = result.questions.filter((_, i) => selected[i]);
    if (chosen.length === 0) return toast.error('Select at least one question.');
    setCommitting(true);
    try {
      let examId = target;
      if (target === 'new') {
        if (!newExam.title.trim()) { setCommitting(false); return toast.error('Enter a title for the new exam.'); }
        const created = await api.post('/exams', newExam);
        examId = created.id;
      }
      await api.post(`/exams/${examId}/questions/bulk`, { questions: chosen });
      toast.success(`Added ${chosen.length} questions`);
      nav(`/admin/exam/${examId}`);
    } catch (e) { toast.error(e.message); } finally { setCommitting(false); }
  }

  const aiOff = status && !status.aiEnabled;
  const canRun = method === 'structured' || status?.aiEnabled;
  const allSelected = result && result.questions.every((_, i) => selected[i]);
  const chosenCount = result ? Object.values(selected).filter(Boolean).length : 0;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <button className="btn sm ghost" onClick={() => nav('/admin')} style={{ marginBottom: 8 }}>← Admin</button>
          <h1>Import questions</h1>
          <p className="muted">Upload a PDF or paste text. Choose AI extraction (any layout) or the structured parser (no API key needed).</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="small muted" style={{ marginBottom: 8 }}>Extraction method</div>
        <div className="grid cols-2">
          <button className={'card hoverable' + (method === 'ai' ? '' : '')} onClick={() => status?.aiEnabled && setMethod('ai')}
                  style={{ textAlign: 'left', cursor: status?.aiEnabled ? 'pointer' : 'not-allowed', border: method === 'ai' ? '1px solid var(--brand)' : undefined, opacity: status?.aiEnabled ? 1 : 0.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>🤖 AI extraction</strong>
              {method === 'ai' && <span className="badge brand">Selected</span>}
              {aiOff && <span className="badge warn">Needs API key</span>}
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>Handles messy or mixed layouts and every question type. Requires <code>ANTHROPIC_API_KEY</code>.</p>
          </button>
          <button className="card hoverable" onClick={() => setMethod('structured')}
                  style={{ textAlign: 'left', cursor: 'pointer', border: method === 'structured' ? '1px solid var(--brand)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>📐 Structured parser</strong>
              {method === 'structured' && <span className="badge brand">Selected</span>}
              <span className="badge good">No key</span>
            </div>
            <p className="small muted" style={{ margin: '6px 0 0' }}>Fast & offline for predictably-formatted files (numbered questions, A–D options, an “Answer:” line).</p>
          </button>
        </div>

        {method === 'structured' && (
          <details style={{ marginTop: 14 }}>
            <summary className="small" style={{ cursor: 'pointer', color: 'var(--brand)' }}>Show the expected format</summary>
            <pre style={{ background: 'var(--surface)', padding: 14, borderRadius: 10, marginTop: 10, fontSize: 12.5, overflow: 'auto', border: '1px solid var(--border)' }}>{SAMPLE}</pre>
            <p className="small muted">Also accepts <code>A)</code> / <code>(A)</code> option styles, <code>Q1.</code> / <code>Question 1:</code> numbering, and <code>Correct Answer:</code>. Two+ answer letters become a multiple-choice question.</p>
          </details>
        )}
      </div>

      <div className="card">
        <div className="tabs">
          <button className={'tab' + (source === 'pdf' ? ' active' : '')} onClick={() => setSource('pdf')}>📄 PDF upload</button>
          <button className={'tab' + (source === 'text' ? ' active' : '')} onClick={() => setSource('text')}>📝 Paste text</button>
          {method === 'structured' && source === 'text' && (
            <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setRawText(SAMPLE)}>Insert sample</button>
          )}
        </div>

        {source === 'pdf' ? (
          <div
            onClick={() => canRun && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (canRun && e.dataTransfer.files[0]) parsePdf(e.dataTransfer.files[0]); }}
            style={{ border: '2px dashed var(--border-strong)', borderRadius: 14, padding: '40px 20px', textAlign: 'center', cursor: canRun ? 'pointer' : 'not-allowed', opacity: canRun ? 1 : 0.6 }}>
            <div style={{ fontSize: 40 }}>📄</div>
            <p style={{ marginBottom: 4 }}><strong>Click to choose a PDF</strong> or drag it here</p>
            <p className="small muted">Using {method === 'ai' ? 'AI extraction' : 'the structured parser'} · up to 25 MB</p>
            <input ref={fileRef} type="file" accept="application/pdf" hidden
                   onChange={(e) => e.target.files[0] && parsePdf(e.target.files[0])} />
          </div>
        ) : (
          <div>
            <textarea rows={9} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste raw questions here…" />
            <button className="btn primary" style={{ marginTop: 10 }} disabled={parsing || !canRun} onClick={parseText}>
              {parsing ? 'Extracting…' : 'Extract questions'}
            </button>
          </div>
        )}

        {parsing && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
            <div className="spinner" /><span className="muted">{method === 'ai' ? 'Reading and structuring with AI — can take a minute for large files.' : 'Parsing…'}</span>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="card" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2>{result.count} questions extracted</h2>
                <p className="small muted" style={{ margin: 0 }}>
                  {result.fileName ? `${result.fileName} · ` : ''}{result.textChars} chars · via {result.method === 'ai' ? 'AI' : 'structured parser'}
                  {result.truncated && ' · ⚠ large document may be truncated'}
                </p>
              </div>
              {result.count > 0 && (
                <button className="btn sm ghost" onClick={() => setSelected(Object.fromEntries(result.questions.map((_, i) => [i, !allSelected])))}>
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              )}
            </div>
            {result.count === 0 ? (
              <div className="empty">No questions found. Try switching method or check the input format.</div>
            ) : (
              <div style={{ maxHeight: 420, overflow: 'auto', marginTop: 12 }}>
                {result.questions.map((q, i) => (
                  <label key={i} className="q-row" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={!!selected[i]} onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })} />
                    <div style={{ flex: 1 }}>
                      <span className="type-tag">{typeLabel(q.type)}</span>
                      <div style={{ marginTop: 6 }}>{q.prompt}</div>
                      <div className="small muted" style={{ marginTop: 4 }}>
                        {q.data.options ? `${q.data.options.length} options` :
                         q.data.statements ? `${q.data.statements.length} statements` :
                         q.data.targets ? `${q.data.targets.length} targets` :
                         q.data.segments ? `${q.data.segments.filter(s => s.type === 'blank').length} blanks` : ''}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {result.count > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <h2>Save to</h2>
              <div className="tabs">
                <button className={'tab' + (target === 'new' ? ' active' : '')} onClick={() => setTarget('new')}>+ New exam</button>
                {exams.map((ex) => (
                  <button key={ex.id} className={'tab' + (target === ex.id ? ' active' : '')} onClick={() => setTarget(ex.id)}>{ex.title}</button>
                ))}
              </div>
              {target === 'new' && (
                <div>
                  <label className="field"><span>Exam title</span>
                    <input value={newExam.title} onChange={(e) => setNewExam({ ...newExam, title: e.target.value })} placeholder="AZ-104 Practice Exam" /></label>
                  <div className="row">
                    <label className="field"><span>Vendor</span>
                      <input value={newExam.vendor} onChange={(e) => setNewExam({ ...newExam, vendor: e.target.value })} /></label>
                    <label className="field"><span>Category</span>
                      <input value={newExam.category} onChange={(e) => setNewExam({ ...newExam, category: e.target.value })} /></label>
                    <label className="field"><span>Duration</span>
                      <input type="number" value={newExam.duration_minutes} onChange={(e) => setNewExam({ ...newExam, duration_minutes: +e.target.value })} /></label>
                    <label className="field"><span>Pass %</span>
                      <input type="number" value={newExam.passing_score} onChange={(e) => setNewExam({ ...newExam, passing_score: +e.target.value })} /></label>
                  </div>
                </div>
              )}
              <button className="btn primary" onClick={commit} disabled={committing || chosenCount === 0}>
                {committing ? 'Saving…' : `Save ${chosenCount} question${chosenCount === 1 ? '' : 's'} →`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
