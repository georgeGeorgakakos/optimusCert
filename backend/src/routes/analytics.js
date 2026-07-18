import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/overview', requireAuth, requireAdmin, (req, res) => {
  const exams = db.prepare('SELECT COUNT(*) n FROM exams').get().n;
  const published = db.prepare('SELECT COUNT(*) n FROM exams WHERE is_published = 1').get().n;
  const questions = db.prepare('SELECT COUNT(*) n FROM questions').get().n;
  const users = db.prepare("SELECT COUNT(*) n FROM users WHERE role='user'").get().n;
  const attempts = db.prepare("SELECT COUNT(*) n FROM attempts WHERE status='completed'").get().n;
  const agg = db.prepare("SELECT AVG(score_percent) avg, AVG(passed) passRate FROM attempts WHERE status='completed' AND mode='exam'").get();
  const recent = db.prepare(`SELECT a.score_percent, a.passed, a.submitted_at, a.mode, e.title exam_title, u.name candidate
                             FROM attempts a JOIN exams e ON e.id=a.exam_id JOIN users u ON u.id=a.user_id
                             WHERE a.status='completed' ORDER BY a.submitted_at DESC LIMIT 8`).all();
  res.json({
    exams, published, questions, users, attempts,
    avgScore: agg.avg != null ? Math.round(agg.avg * 10) / 10 : 0,
    passRate: agg.passRate != null ? Math.round(agg.passRate * 100) : 0,
    recent: recent.map((r) => ({ ...r, passed: !!r.passed }))
  });
});

router.get('/exam/:id', requireAuth, requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const attempts = db.prepare("SELECT * FROM attempts WHERE exam_id = ? AND status='completed' AND mode='exam'").all(exam.id);
  const questions = db.prepare('SELECT id, prompt, domain FROM questions WHERE exam_id = ? ORDER BY order_index').all(exam.id);

  const n = attempts.length;
  const avgScore = n ? Math.round((attempts.reduce((s, a) => s + a.score_percent, 0) / n) * 10) / 10 : 0;
  const passRate = n ? Math.round((attempts.filter((a) => a.passed).length / n) * 100) : 0;
  const avgDuration = n ? Math.round(attempts.reduce((s, a) => s + (a.duration_seconds || 0), 0) / n) : 0;

  // per-question correctness across attempts
  const qStat = Object.fromEntries(questions.map((q) => [q.id, { prompt: q.prompt, domain: q.domain, correct: 0, seen: 0 }]));
  const domStat = {};
  for (const a of attempts) {
    for (const d of JSON.parse(a.detail || '[]')) {
      const s = qStat[d.questionId];
      if (!s) continue;
      s.seen += 1; if (d.correct) s.correct += 1;
      const dk = s.domain || 'General';
      if (!domStat[dk]) domStat[dk] = { correct: 0, seen: 0 };
      domStat[dk].seen += 1; if (d.correct) domStat[dk].correct += 1;
    }
  }
  const hardest = Object.values(qStat)
    .filter((s) => s.seen > 0)
    .map((s) => ({ prompt: s.prompt, domain: s.domain, accuracy: Math.round((s.correct / s.seen) * 100), seen: s.seen }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8);
  const domains = Object.entries(domStat).map(([name, v]) => ({ name, accuracy: v.seen ? Math.round((v.correct / v.seen) * 100) : 0, seen: v.seen }));
  const scoreBuckets = [0, 0, 0, 0, 0]; // 0-59,60-69,70-79,80-89,90-100
  attempts.forEach((a) => {
    const p = a.score_percent;
    const idx = p < 60 ? 0 : p < 70 ? 1 : p < 80 ? 2 : p < 90 ? 3 : 4;
    scoreBuckets[idx] += 1;
  });

  res.json({
    exam: { id: exam.id, title: exam.title, passing_score: exam.passing_score },
    attempts: n, avgScore, passRate, avgDuration, hardest, domains, scoreBuckets,
    questionCount: questions.length
  });
});

export default router;
