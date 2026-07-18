import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../toast.jsx';

function fmtDuration(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);
  const [query, setQuery] = useState('');
  const [vendor, setVendor] = useState('All');
  const [category, setCategory] = useState('All');

  useEffect(() => {
    (async () => {
      try {
        const [ex, at] = await Promise.all([api.get('/exams'), api.get('/attempts')]);
        setExams(ex);
        setAttempts(at);
      } catch (e) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  async function start(examId, mode) {
    setStarting(examId + mode);
    try {
      const data = await api.post('/attempts', { examId, mode });
      nav(`/exam/${examId}/take`, { state: { attempt: data } });
    } catch (e) { toast.error(e.message); setStarting(null); }
  }

  const vendors = useMemo(() => ['All', ...new Set(exams.map((e) => e.vendor).filter(Boolean))], [exams]);
  const categories = useMemo(() => ['All', ...new Set(exams.map((e) => e.category).filter(Boolean))], [exams]);

  const filtered = exams.filter((e) => {
    if (vendor !== 'All' && e.vendor !== vendor) return false;
    if (category !== 'All' && e.category !== category) return false;
    if (query && !(`${e.title} ${e.vendor} ${e.category} ${e.description}`.toLowerCase().includes(query.toLowerCase()))) return false;
    return true;
  });

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  const bestByExam = {};
  attempts.forEach((a) => {
    if (!bestByExam[a.exam_id] || a.score_percent > bestByExam[a.exam_id]) bestByExam[a.exam_id] = a.score_percent;
  });

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Welcome back, {user.name.split(' ')[0]} 👋</h1>
          <p className="muted">Choose an exam. Take it timed in <strong>Exam mode</strong>, or learn with instant feedback in <strong>Practice mode</strong>.</p>
        </div>
        {isAdmin && <button className="btn primary" onClick={() => nav('/admin')}>Manage exams →</button>}
      </div>

      {/* search + filters */}
      <div className="card" style={{ marginBottom: 22, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="🔍  Search exams…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 2, minWidth: 200 }} />
        <select value={vendor} onChange={(e) => setVendor(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          {vendors.map((v) => <option key={v} value={v}>{v === 'All' ? 'All vendors' : v}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          {categories.map((c) => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
        </select>
      </div>

      <h2 style={{ marginBottom: 14 }}>Available exams <span className="muted small">({filtered.length})</span></h2>
      {filtered.length === 0 ? (
        <div className="card empty">No exams match your filters.</div>
      ) : (
        <div className="grid cols-2">
          {filtered.map((ex) => (
            <div key={ex.id} className="card hoverable" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {ex.vendor && <span className="badge brand">{ex.vendor}</span>}
                <span className="badge">{ex.category}</span>
                {!ex.is_published && <span className="badge warn">Draft</span>}
              </div>
              <h2>{ex.title}</h2>
              <p className="muted small" style={{ flex: 1, lineHeight: 1.5 }}>{ex.description || 'No description.'}</p>
              <div className="row small muted" style={{ margin: '10px 0 16px' }}>
                <span>📝 {ex.question_count} questions</span>
                <span>⏱ {ex.duration_minutes} min</span>
                <span>🎯 Pass {ex.passing_score}%</span>
              </div>
              {bestByExam[ex.id] != null && (
                <div className="small" style={{ marginBottom: 12 }}>
                  Best score: <strong style={{ color: bestByExam[ex.id] >= ex.passing_score ? 'var(--good)' : 'var(--warn)' }}>{bestByExam[ex.id]}%</strong>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn primary" style={{ flex: 1 }} disabled={ex.question_count === 0 || starting === ex.id + 'exam'} onClick={() => start(ex.id, 'exam')}>
                  {starting === ex.id + 'exam' ? 'Starting…' : '⏱ Exam mode'}
                </button>
                <button className="btn accent" style={{ flex: 1 }} disabled={ex.question_count === 0 || starting === ex.id + 'practice'} onClick={() => start(ex.id, 'practice')}>
                  {starting === ex.id + 'practice' ? 'Starting…' : '📚 Practice'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {attempts.length > 0 && (
        <>
          <h2 style={{ margin: '34px 0 14px' }}>Your recent attempts</h2>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {attempts.slice(0, 12).map((a, i) => (
              <div key={a.id} onClick={() => nav(`/result/${a.id}`)}
                   style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', cursor: 'pointer',
                            borderTop: i ? '1px solid var(--border)' : 'none' }}>
                <span className={'pill badge ' + (a.passed ? 'good' : 'bad')}>{a.passed ? 'PASS' : 'FAIL'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{a.exam_title}</div>
                  <div className="small muted">{new Date(a.submitted_at + 'Z').toLocaleString()} · {fmtDuration(a.duration_seconds)}</div>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{a.score_percent}%</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
