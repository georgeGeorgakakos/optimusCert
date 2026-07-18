import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';
import QuestionView, { typeLabel } from '../components/QuestionView.jsx';

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function mergeSolution(q, solution) {
  const data = { ...q.data };
  if (solution.correct) data.correct = solution.correct;
  if (solution.targets) data.targets = solution.targets;
  if (solution.statements) data.statements = solution.statements;
  if (solution.segments) data.segments = solution.segments;
  return { ...q, data };
}

export default function ExamRunner() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();

  const [attempt, setAttempt] = useState(loc.state?.attempt || null);
  const [loading, setLoading] = useState(!loc.state?.attempt);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [checked, setChecked] = useState({}); // practice: qId -> {correct, explanation, solution}
  const [current, setCurrent] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (attempt) return;
    (async () => {
      try {
        const data = await api.post('/attempts', { examId: id });
        setAttempt(data);
      } catch (e) { toast.error(e.message); nav('/'); }
      finally { setLoading(false); }
    })();
  }, [id]);

  const isPractice = attempt?.mode === 'practice';
  const deadline = useMemo(() => {
    if (!attempt) return 0;
    return attempt.startedAt + attempt.exam.duration_minutes * 60 * 1000;
  }, [attempt]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const timeLeft = (deadline - now) / 1000;
  const elapsed = attempt ? (now - attempt.startedAt) / 1000 : 0;

  useEffect(() => {
    if (attempt && !isPractice && timeLeft <= 0 && !submittedRef.current) submit(true);
  }, [timeLeft, attempt, isPractice]);

  if (loading || !attempt) return <div className="loading-screen"><div className="spinner" /></div>;

  const questions = attempt.questions;
  const q = questions[current];
  const isChecked = !!checked[q.id];
  const answeredCount = questions.filter((qq) => {
    const v = answers[qq.id];
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object') return Object.keys(v).length > 0;
    return true;
  }).length;

  function setAnswer(val) { if (!isChecked) setAnswers((a) => ({ ...a, [q.id]: val })); }
  function toggleFlag() {
    setFlagged((f) => { const n = new Set(f); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n; });
  }

  async function checkAnswer() {
    try {
      const r = await api.post(`/attempts/${attempt.attemptId}/check`, { questionId: q.id, answer: answers[q.id] ?? null });
      setChecked((c) => ({ ...c, [q.id]: r }));
    } catch (e) { toast.error(e.message); }
  }

  async function submit(auto = false) {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const durationSeconds = Math.round((Date.now() - attempt.startedAt) / 1000);
    try {
      await api.post(`/attempts/${attempt.attemptId}/submit`, { answers, duration_seconds: durationSeconds });
      if (auto) toast.info('Time is up — your exam was submitted automatically.');
      nav(`/result/${attempt.attemptId}`);
    } catch (e) {
      toast.error(e.message);
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  const danger = !isPractice && timeLeft < 60;
  const progress = (answeredCount / questions.length) * 100;
  const displayQ = isChecked ? mergeSolution(q, checked[q.id].solution) : q;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <div className="small muted">{attempt.exam.vendor} · {attempt.exam.category} {isPractice && <span className="badge accent-badge" style={{ marginLeft: 6 }}>Practice</span>}</div>
          <h1 style={{ fontSize: 22 }}>{attempt.exam.title}</h1>
        </div>
        <div className="card" style={{ padding: '10px 18px', textAlign: 'center', minWidth: 130 }}>
          <div className="small muted">{isPractice ? 'Elapsed' : 'Time remaining'}</div>
          <div className={'timer' + (danger ? ' danger' : '')}>{isPractice ? fmt(elapsed) : fmt(timeLeft)}</div>
        </div>
      </div>

      <div className="runner">
        <div className="card q-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="q-index">Question {current + 1} of {questions.length}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {q.domain && <span className="type-tag" style={{ background: 'rgba(18,183,166,0.14)', color: 'var(--accent)' }}>{q.domain}</span>}
              <span className="type-tag">{typeLabel(q.type)}</span>
              <button className={'btn sm ' + (flagged.has(q.id) ? 'accent' : 'ghost')} onClick={toggleFlag}>
                {flagged.has(q.id) ? '★ Flagged' : '☆ Flag'}
              </button>
            </div>
          </div>
          <div className="q-prompt">{q.prompt}</div>
          <div style={{ flex: 1 }}>
            <QuestionView question={displayQ} value={answers[q.id]} onChange={setAnswer} review={isChecked} />
          </div>

          {/* practice feedback */}
          {isPractice && isChecked && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12,
                          background: checked[q.id].correct ? 'rgba(23,163,74,0.1)' : 'rgba(226,59,87,0.1)',
                          border: `1px solid ${checked[q.id].correct ? 'var(--good)' : 'var(--bad)'}` }}>
              <strong style={{ color: checked[q.id].correct ? 'var(--good)' : 'var(--bad)' }}>
                {checked[q.id].correct ? '✓ Correct!' : '✕ Not quite'}
              </strong>
              {checked[q.id].explanation && <p className="small muted" style={{ margin: '6px 0 0' }}>{checked[q.id].explanation}</p>}
            </div>
          )}

          <div className="divider" />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button className="btn ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>← Previous</button>
            <div style={{ display: 'flex', gap: 10 }}>
              {isPractice && !isChecked && (
                <button className="btn accent" disabled={answers[q.id] == null} onClick={checkAnswer}>Check answer</button>
              )}
              {current < questions.length - 1 ? (
                <button className="btn primary" onClick={() => setCurrent((c) => c + 1)}>Next →</button>
              ) : (
                <button className="btn accent" disabled={submitting} onClick={() => submit(false)}>Finish ✓</button>
              )}
            </div>
          </div>
        </div>

        <div className="side-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="small muted" style={{ marginBottom: 8 }}>Progress · {answeredCount}/{questions.length}</div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            <div className="q-nav-grid" style={{ marginTop: 14 }}>
              {questions.map((qq, i) => {
                const v = answers[qq.id];
                const isAns = v != null && (Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : true);
                let cls = 'q-nav-btn';
                if (checked[qq.id]) cls += checked[qq.id].correct ? ' nav-correct' : ' nav-wrong';
                else if (isAns) cls += ' answered';
                if (i === current) cls += ' current';
                return (
                  <button key={qq.id} className={cls} onClick={() => setCurrent(i)} style={{ position: 'relative' }}>
                    {flagged.has(qq.id) ? '★' : i + 1}
                  </button>
                );
              })}
            </div>
          </div>
          <button className="btn accent" disabled={submitting} onClick={() => submit(false)}>
            {submitting ? 'Submitting…' : isPractice ? 'Finish & see results' : 'Submit exam'}
          </button>
          <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>
            {questions.length - answeredCount > 0 ? `${questions.length - answeredCount} unanswered` : 'All questions answered'}
          </p>
        </div>
      </div>
    </div>
  );
}
