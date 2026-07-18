import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../toast.jsx';

export default function Certificate() {
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
  if (!res.passed) {
    return (
      <div className="container">
        <div className="card empty">A certificate is only issued for a passing score. <button className="btn sm" onClick={() => nav(`/result/${attemptId}`)}>Back to results</button></div>
      </div>
    );
  }

  const date = new Date((res.submitted_at || '') + 'Z').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const certId = res.id.slice(0, 8).toUpperCase();

  return (
    <div className="container">
      <div className="page-head no-print">
        <div>
          <h1>Certificate of Achievement</h1>
          <p className="muted">Congratulations, {res.candidate}! Print this or save it as a PDF.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn ghost" onClick={() => nav(`/result/${attemptId}`)}>← Results</button>
          <button className="btn primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
        </div>
      </div>

      <div className="cert-wrap">
        <div className="cert">
          <div className="cert-inner">
            <div className="cert-seal">◆</div>
            <div className="brand" style={{ justifyContent: 'center', fontSize: 22, marginBottom: 6 }}>
              <span>Optimus<span className="grad">Cert</span></span>
            </div>
            <div className="cert-kicker">Certificate of Achievement</div>
            <p className="cert-sub">This is proudly presented to</p>
            <div className="cert-name">{res.candidate}</div>
            <p className="cert-sub">for successfully passing</p>
            <div className="cert-exam">{res.exam.title}</div>
            <div className="cert-stats">
              <div><div className="cert-stat-n">{res.score_percent}%</div><div className="cert-stat-l">Final score</div></div>
              <div><div className="cert-stat-n">{res.exam.passing_score}%</div><div className="cert-stat-l">Passing mark</div></div>
              <div><div className="cert-stat-n">{res.exam.vendor || '—'}</div><div className="cert-stat-l">Vendor</div></div>
            </div>
            <div className="cert-foot">
              <div><div className="cert-line" /><div className="cert-foot-l">{date}</div><div className="cert-foot-s">Date</div></div>
              <div><div className="cert-line" /><div className="cert-foot-l">OptimusCert</div><div className="cert-foot-s">Issued by</div></div>
            </div>
            <div className="cert-id">Certificate ID: {certId}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
