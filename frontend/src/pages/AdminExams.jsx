import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';

const BLANK = { title: '', description: '', category: 'General', vendor: '', duration_minutes: 60, passing_score: 70, shuffle: 1 };

export default function AdminExams() {
  const nav = useNavigate();
  const toast = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(BLANK);
  const importRef = useRef();

  async function load() {
    try { setExams(await api.get('/exams')); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function exportExam(ex) {
    try {
      const data = await api.get(`/exams/${ex.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (ex.title || 'exam').replace(/[^\w.-]+/g, '_').slice(0, 60);
      a.href = url; a.download = `${safe}.cfexam`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Exported .cfexam file');
    } catch (e) { toast.error(e.message); }
  }

  async function importFile(file) {
    try {
      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('That file is not a valid .cfexam (could not read JSON).'); }
      const created = await api.post('/exams/import-file', payload);
      toast.success(`Imported “${created.title}” with ${created.imported_questions} questions`);
      nav(`/admin/exam/${created.id}`);
    } catch (e) { toast.error(e.message); }
  }

  async function create(e) {
    e.preventDefault();
    try {
      const created = await api.post('/exams', form);
      toast.success('Exam created');
      setShowNew(false); setForm(BLANK);
      nav(`/admin/exam/${created.id}`);
    } catch (err) { toast.error(err.message); }
  }

  async function togglePublish(ex) {
    try {
      await api.put(`/exams/${ex.id}`, { is_published: ex.is_published ? 0 : 1 });
      toast.success(ex.is_published ? 'Unpublished' : 'Published');
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function remove(ex) {
    if (!confirm(`Delete "${ex.title}" and all its questions?`)) return;
    try { await api.del(`/exams/${ex.id}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Exam management</h1>
          <p className="muted">Create exams by hand or import them from a PDF, then build questions with drag & drop.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={() => importRef.current?.click()}>⬆ Import .cfexam</button>
          <button className="btn ghost" onClick={() => nav('/admin/import')}>📄 Import from PDF</button>
          <button className="btn primary" onClick={() => setShowNew(true)}>+ New exam</button>
          <input ref={importRef} type="file" accept=".cfexam,application/json" hidden
                 onChange={(e) => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; }} />
        </div>
      </div>

      {exams.length === 0 ? (
        <div className="card empty">No exams yet. Create one or import from a PDF to get started.</div>
      ) : (
        <div className="grid cols-2">
          {exams.map((ex) => (
            <div key={ex.id} className="card">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {ex.vendor && <span className="badge brand">{ex.vendor}</span>}
                <span className="badge">{ex.category}</span>
                <span className={'badge ' + (ex.is_published ? 'good' : 'warn')}>{ex.is_published ? 'Published' : 'Draft'}</span>
              </div>
              <h2>{ex.title}</h2>
              <p className="small muted" style={{ lineHeight: 1.5 }}>{ex.description || 'No description.'}</p>
              <div className="row small muted" style={{ margin: '8px 0 16px' }}>
                <span>📝 {ex.question_count} Q</span><span>⏱ {ex.duration_minutes}m</span><span>🎯 {ex.passing_score}%</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm primary" onClick={() => nav(`/admin/exam/${ex.id}`)}>Edit & build</button>
                <button className="btn sm ghost" onClick={() => togglePublish(ex)}>{ex.is_published ? 'Unpublish' : 'Publish'}</button>
                <button className="btn sm ghost" onClick={() => nav(`/admin/analytics/${ex.id}`)}>📊 Stats</button>
                <button className="btn sm ghost" onClick={() => exportExam(ex)}>⬇ Export</button>
                <button className="btn sm danger" onClick={() => remove(ex)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            <h2>Create a new exam</h2>
            <form onSubmit={create}>
              <label className="field"><span>Title</span>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="AZ-104: Azure Administrator" /></label>
              <label className="field"><span>Description</span>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              <div className="row">
                <label className="field"><span>Vendor</span>
                  <input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Microsoft" /></label>
                <label className="field"><span>Category</span>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label>
              </div>
              <div className="row">
                <label className="field"><span>Duration (min)</span>
                  <input type="number" min="1" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: +e.target.value })} /></label>
                <label className="field"><span>Passing score (%)</span>
                  <input type="number" min="1" max="100" value={form.passing_score} onChange={(e) => setForm({ ...form, passing_score: +e.target.value })} /></label>
              </div>
              <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={!!form.shuffle} onChange={(e) => setForm({ ...form, shuffle: e.target.checked ? 1 : 0 })} />
                <span style={{ margin: 0 }}>Shuffle question order for each candidate</span>
              </label>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowNew(false)}>Cancel</button>
                <button className="btn primary">Create exam</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
