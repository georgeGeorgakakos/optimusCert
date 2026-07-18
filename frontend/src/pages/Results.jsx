import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';
import QuestionView, { typeLabel } from '../components/QuestionView.jsx';

function ScoreRing({ percent, passed }) {
  const r = 78, c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  const color = passed ? 'var(--good)' : 'var(--bad)';
  return (
    <div className="score-ring">
      <svg width="180" height="180">
        <circle cx="90" cy="90" r={r} stroke="#e6eaf6" strokeWidth="14" fill="none" />
        <circle cx="90" cy="90" r={r} stroke={color} strokeWidth="14" fill="none"
                strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="val" style={{ flexDirection: 'column' }}>
        <div className="n" style={{ color }}>{percent}%</div>
        <div className="small muted">score</div>
      </div>
    </div>
  );
}

function fmt(s) { return `${Math.floor(s / 60)}m ${s % 60}s`; }

export default function Results() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [res, setRes] = useState(null);

  useEffect(() => {
    (async () => {
      try { setRes(await api.get(`/attempts/${attemptId}`)); }
      catch (e) { toast.error(e.message); nav('/'); }
    })();
  }, [attemptId]);

  if (!res) return <div className="loading-screen"><div className="spinner" /></div>;

  const correctCount = res.review.filter((r) => r.correct).length;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <div className="small muted">{res.exam.vendor} · {res.exam.category}</div>
          <h1>{res.exam.title}</h1>
        </div>
        <button className="btn ghost" onClick={() => nav('/')}>← Back to exams</button>
      </div>

      <div className="card" style={{ display: 'flex', gap: 34, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <ScoreRing percent={res.score_percent} passed={res.passed} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={'pill badge ' + (res.passed ? 'good' : 'bad')} style={{ fontSize: 14 }}>
              {res.passed ? '✓ PASSED' : '✕ NOT PASSED'}
            </span>
            {res.mode === 'practice' && <span className="badge accent-badge">Practice</span>}
            {res.passed && <button className="btn sm primary" onClick={() => nav(`/certificate/${res.id}`)}>🏆 View certificate</button>}
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            You needed <strong>{res.exam.passing_score}%</strong> to pass and scored <strong>{res.score_percent}%</strong>.
          </p>
          <div className="grid cols-3" style={{ marginTop: 16 }}>
            <div className="card" style={{ textAlign: 'center', padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{correctCount}/{res.review.length}</div>
              <div className="small muted">Correct</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{res.earned_points}/{res.total_points}</div>
              <div className="small muted">Points</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: 14 }}>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{fmt(res.duration_seconds)}</div>
              <div className="small muted">Time</div>
            </div>
          </div>
        </div>
      </div>

      {res.domains?.length > 1 && (
        <>
          <h2 style={{ margin: '30px 0 14px' }}>Performance by domain</h2>
          <div className="card">
            {res.domains.map((d) => (
              <div key={d.name} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="small" style={{ fontWeight: 600 }}>{d.name}</span>
                  <span className="small muted">{d.correct}/{d.total} · {d.percent}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${d.percent}%`, background: d.percent >= res.exam.passing_score ? 'linear-gradient(90deg,var(--good),#0f9d58)' : 'linear-gradient(90deg,var(--warn),#e2a03b)' }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 style={{ margin: '30px 0 14px' }}>Answer review</h2>
      {res.review.map((r, i) => (
        <div key={r.id} className="card" style={{ marginBottom: 14, borderLeft: `4px solid ${r.correct ? 'var(--good)' : 'var(--bad)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span className="q-index">Question {i + 1} · {typeLabel(r.type)}{r.domain ? ' · ' + r.domain : ''}</span>
            <span className={'badge ' + (r.correct ? 'good' : 'bad')}>{r.correct ? 'Correct' : 'Incorrect'}</span>
          </div>
          <div className="q-prompt" style={{ fontSize: 16, marginBottom: 14 }}>{r.prompt}</div>
          <QuestionView question={r} value={r.yourAnswer} onChange={() => {}} review />
          {r.explanation && (
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: 'rgba(91,124,250,0.08)', border: '1px solid var(--border)' }}>
              <strong className="small">💡 Explanation</strong>
              <p className="small muted" style={{ margin: '4px 0 0' }}>{r.explanation}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
