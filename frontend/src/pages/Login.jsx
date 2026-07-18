import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useToast } from '../toast.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      nav('/');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function quick(email, password) {
    setForm({ ...form, email, password });
  }

  return (
    <div className="center-screen">
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="brand" style={{ justifyContent: 'center', fontSize: 28, marginBottom: 8 }}>
          <span className="logo" style={{ width: 44, height: 44, fontSize: 24 }}>◆</span>
          <span>Optimus<span className="grad">Cert</span></span>
        </div>
        <p className="muted" style={{ textAlign: 'center', marginTop: 0, marginBottom: 24 }}>
          The certification exam engine, powered by OptimusDB. Build, import, and practice like the real thing.
        </p>
        <div className="card">
          <div className="tabs" style={{ justifyContent: 'center' }}>
            <button className={'tab' + (mode === 'login' ? ' active' : '')} onClick={() => setMode('login')}>Sign in</button>
            <button className={'tab' + (mode === 'register' ? ' active' : '')} onClick={() => setMode('register')}>Create account</button>
          </div>
          <form onSubmit={submit}>
            {mode === 'register' && (
              <label className="field">
                <span>Full name</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Jane Candidate" />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="you@example.com" />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="••••••••" />
            </label>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <div className="divider" />
          <p className="small muted" style={{ marginTop: 0 }}>Demo accounts (click to fill):</p>
          <div className="row">
            <button className="btn sm ghost" type="button" onClick={() => quick('admin@exam.local', 'admin123')}>👑 Admin</button>
            <button className="btn sm ghost" type="button" onClick={() => quick('user@exam.local', 'user123')}>🎓 Candidate</button>
          </div>
        </div>
      </div>
    </div>
  );
}
