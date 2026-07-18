import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';

function Stat({ n, label, accent }) {
  return (
    <div className="card" style={{ textAlign: 'center', padding: 18 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent ? 'var(--brand)' : 'var(--text)' }}>{n}</div>
      <div className="small muted">{label}</div>
    </div>
  );
}

function Bar({ label, value, sub, max = 100 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span className="small" style={{ fontWeight: 600 }}>{label}</span>
        <span className="small muted">{sub}</span>
      </div>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} /></div>
    </div>
  );
}

export default function AdminAnalytics() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [exams, setExams] = useState([]);
  const [selected, setSelected] = useState(id || '');
  const [exam, setExam] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [ov, ex] = await Promise.all([api.get('/analytics/overview'), api.get('/exams')]);
        setOverview(ov); setExams(ex);
      } catch (e) { toast.error(e.message); }
    })();
  }, []);

  useEffect(() => {
    if (!selected) { setExam(null); return; }
    (async () => {
      try { setExam(await api.get(`/analytics/exam/${selected}`)); }
      catch (e) { toast.error(e.message); }
    })();
  }, [selected]);

  if (!overview) return <div className="loading-screen"><div className="spinner" /></div>;

  const buckets = exam?.scoreBuckets || [];
  const bucketLabels = ['0–59', '60–69', '70–79', '80–89', '90–100'];
  const maxBucket = Math.max(1, ...buckets);

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p className="muted">Platform-wide performance and per-exam insights.</p>
        </div>
        <button className="btn ghost" onClick={() => nav('/admin')}>← Admin</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
        <Stat n={overview.attempts} label="Exam attempts" accent />
        <Stat n={overview.passRate + '%'} label="Pass rate" />
        <Stat n={overview.avgScore + '%'} label="Avg score" />
        <Stat n={overview.exams} label="Exams" />
        <Stat n={overview.questions} label="Questions" />
        <Stat n={overview.users} label="Candidates" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 20, alignItems: 'start' }}>
        <div className="card">
          <h2>Recent activity</h2>
          {overview.recent.length === 0 ? <div className="empty">No attempts yet.</div> : (
            <div style={{ marginTop: 10 }}>
              {overview.recent.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                  <span className={'pill badge ' + (r.passed ? 'good' : 'bad')}>{r.passed ? 'PASS' : 'FAIL'}</span>
                  <div style={{ flex: 1 }}>
                    <div className="small" style={{ fontWeight: 600 }}>{r.candidate}</div>
                    <div className="small muted">{r.exam_title}{r.mode === 'practice' ? ' · practice' : ''}</div>
                  </div>
                  <strong>{r.score_percent}%</strong>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2>Per-exam analytics</h2>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginTop: 6 }}>
            <option value="">Choose an exam…</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>

          {exam && (
            <div style={{ marginTop: 16 }}>
              {exam.attempts === 0 ? (
                <div className="empty">No exam-mode attempts yet for this exam.</div>
              ) : (
                <>
                  <div className="row" style={{ marginBottom: 16 }}>
                    <div><div style={{ fontSize: 22, fontWeight: 800 }}>{exam.attempts}</div><div className="small muted">Attempts</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--good)' }}>{exam.passRate}%</div><div className="small muted">Pass rate</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800 }}>{exam.avgScore}%</div><div className="small muted">Avg score</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(exam.avgDuration / 60)}m</div><div className="small muted">Avg time</div></div>
                  </div>

                  <h3 className="small muted" style={{ marginBottom: 8 }}>Score distribution</h3>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, marginBottom: 16 }}>
                    {buckets.map((b, i) => (
                      <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ height: `${(b / maxBucket) * 70}px`, minHeight: 3, borderRadius: 6, background: 'linear-gradient(180deg,var(--brand),var(--brand-2))' }} />
                        <div className="small muted" style={{ marginTop: 4 }}>{bucketLabels[i]}</div>
                        <div className="small" style={{ fontWeight: 700 }}>{b}</div>
                      </div>
                    ))}
                  </div>

                  {exam.domains.length > 0 && (
                    <>
                      <h3 className="small muted" style={{ marginBottom: 8 }}>Accuracy by domain</h3>
                      {exam.domains.map((d) => <Bar key={d.name} label={d.name} value={d.accuracy} sub={d.accuracy + '%'} />)}
                    </>
                  )}

                  {exam.hardest.length > 0 && (
                    <>
                      <h3 className="small muted" style={{ margin: '14px 0 8px' }}>Hardest questions</h3>
                      {exam.hardest.slice(0, 5).map((h, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
                          <span className={'badge ' + (h.accuracy < 50 ? 'bad' : 'warn')}>{h.accuracy}%</span>
                          <span className="small" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.prompt}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
