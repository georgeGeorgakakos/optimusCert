import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';
import SortableList from '../components/SortableList.jsx';
import QuestionBuilder from '../components/QuestionBuilder.jsx';
import { typeLabel } from '../components/QuestionView.jsx';

export default function AdminExamEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [editing, setEditing] = useState(null); // question being edited
  const [creating, setCreating] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  async function load() {
    try {
      const data = await api.get(`/exams/${id}?mode=edit`);
      setExam(data);
      setQuestions(data.questions);
    } catch (e) { toast.error(e.message); nav('/admin'); }
  }
  useEffect(() => { load(); }, [id]);

  async function exportExam() {
    try {
      const data = await api.get(`/exams/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (exam.title || 'exam').replace(/[^\w.-]+/g, '_').slice(0, 60);
      a.href = url; a.download = `${safe}.cfexam`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('Exported .cfexam file');
    } catch (e) { toast.error(e.message); }
  }

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await api.put(`/exams/${id}`, exam);
      toast.success('Exam settings saved');
    } catch (e) { toast.error(e.message); } finally { setSavingMeta(false); }
  }

  async function reorder(newOrder) {
    setQuestions(newOrder);
    try { await api.put(`/exams/${id}/questions/reorder`, { order: newOrder.map((q) => q.id) }); }
    catch (e) { toast.error(e.message); }
  }

  async function saveQuestion(payload) {
    try {
      if (editing) {
        await api.put(`/questions/${editing.id}`, payload);
        toast.success('Question updated');
      } else {
        await api.post(`/exams/${id}/questions`, payload);
        toast.success('Question added');
      }
      setEditing(null); setCreating(false);
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function removeQuestion(qid) {
    if (!confirm('Delete this question?')) return;
    try { await api.del(`/questions/${qid}`); toast.success('Deleted'); load(); }
    catch (e) { toast.error(e.message); }
  }

  if (!exam) return <div className="loading-screen"><div className="spinner" /></div>;
  const set = (k, v) => setExam({ ...exam, [k]: v });

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <button className="btn sm ghost" onClick={() => nav('/admin')} style={{ marginBottom: 8 }}>← All exams</button>
          <h1>{exam.title}</h1>
          <p className="muted">{questions.length} questions · {exam.is_published ? 'Published' : 'Draft'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn ghost" onClick={exportExam}>⬇ Export .cfexam</button>
          <button className="btn ghost" onClick={() => set('is_published', exam.is_published ? 0 : 1)}>
            {exam.is_published ? 'Set to draft' : 'Mark published'}
          </button>
          <button className="btn primary" onClick={saveMeta} disabled={savingMeta}>{savingMeta ? 'Saving…' : 'Save settings'}</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '340px 1fr', alignItems: 'start' }}>
        {/* Settings panel */}
        <div className="card">
          <h2>Exam settings</h2>
          <label className="field"><span>Title</span>
            <input value={exam.title} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="field"><span>Description</span>
            <textarea value={exam.description || ''} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="row">
            <label className="field"><span>Vendor</span>
              <input value={exam.vendor || ''} onChange={(e) => set('vendor', e.target.value)} /></label>
            <label className="field"><span>Category</span>
              <input value={exam.category || ''} onChange={(e) => set('category', e.target.value)} /></label>
          </div>
          <div className="row">
            <label className="field"><span>Duration (min)</span>
              <input type="number" value={exam.duration_minutes} onChange={(e) => set('duration_minutes', +e.target.value)} /></label>
            <label className="field"><span>Pass %</span>
              <input type="number" value={exam.passing_score} onChange={(e) => set('passing_score', +e.target.value)} /></label>
          </div>
          <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={!!exam.shuffle} onChange={(e) => set('shuffle', e.target.checked ? 1 : 0)} />
            <span style={{ margin: 0 }}>Shuffle questions</span>
          </label>
        </div>

        {/* Questions panel */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2>Questions</h2>
            <button className="btn primary" onClick={() => setCreating(true)}>+ Add question</button>
          </div>
          {questions.length === 0 ? (
            <div className="empty">No questions yet. Click “Add question” to build one, or import from a PDF.</div>
          ) : (
            <SortableList items={questions} onReorder={reorder}
              renderItem={(q, i) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="type-tag">{typeLabel(q.type)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong className="small muted">{i + 1}.</strong> {q.prompt || <em className="muted">Untitled</em>}
                  </span>
                  <span className="small muted">{q.points}pt</span>
                  <button className="btn sm ghost" onClick={() => setEditing(q)}>Edit</button>
                  <button className="btn sm danger" onClick={() => removeQuestion(q.id)}>✕</button>
                </div>
              )} />
          )}
        </div>
      </div>

      {(creating || editing) && (
        <QuestionBuilder question={editing} onSave={saveQuestion} onClose={() => { setEditing(null); setCreating(false); }} />
      )}
    </div>
  );
}
