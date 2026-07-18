import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  if (!user) return null;
  const active = (p) => (loc.pathname === p || loc.pathname.startsWith(p + '/') ? ' primary' : ' ghost');

  return (
    <div className="navbar">
      <Link to="/" className="brand">
        <span className="logo">◆</span>
        <span>Optimus<span className="grad">Cert</span></span>
      </Link>
      <div className="nav-links">
        <Link to="/" className={'btn sm' + active('/')}>Exams</Link>
        {isAdmin && <Link to="/admin" className={'btn sm' + active('/admin')}>Admin</Link>}
        {isAdmin && <Link to="/admin/analytics" className={'btn sm' + active('/admin/analytics')}>Analytics</Link>}
        {isAdmin && <Link to="/admin/import" className={'btn sm' + active('/admin/import')}>Import</Link>}
      </div>
      <div className="nav-user">
        {isAdmin && <span className="pill badge brand">ADMIN</span>}
        <div className="avatar">{(user.name || user.email)[0]?.toUpperCase()}</div>
        <span className="small">{user.name}</span>
        <button className="btn sm ghost" onClick={() => { logout(); nav('/login'); }}>Sign out</button>
      </div>
    </div>
  );
}
