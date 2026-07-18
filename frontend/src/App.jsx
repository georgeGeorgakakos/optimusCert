import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Navbar from './components/Navbar.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ExamRunner from './pages/ExamRunner.jsx';
import Results from './pages/Results.jsx';
import AdminExams from './pages/AdminExams.jsx';
import AdminExamEditor from './pages/AdminExamEditor.jsx';
import AdminImport from './pages/AdminImport.jsx';
import AdminAnalytics from './pages/AdminAnalytics.jsx';
import Certificate from './pages/Certificate.jsx';

function Protected({ children, admin }) {
  const { user, isAdmin } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/exam/:id/take" element={<Protected><ExamRunner /></Protected>} />
        <Route path="/result/:attemptId" element={<Protected><Results /></Protected>} />
        <Route path="/certificate/:attemptId" element={<Protected><Certificate /></Protected>} />
        <Route path="/admin" element={<Protected admin><AdminExams /></Protected>} />
        <Route path="/admin/analytics" element={<Protected admin><AdminAnalytics /></Protected>} />
        <Route path="/admin/analytics/:id" element={<Protected admin><AdminAnalytics /></Protected>} />
        <Route path="/admin/exam/:id" element={<Protected admin><AdminExamEditor /></Protected>} />
        <Route path="/admin/import" element={<Protected admin><AdminImport /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
