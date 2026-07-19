import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const num = async (sql, ...p) => Number((await db.get(sql, ...p))?.n || 0);
    const exams = await num('SELECT COUNT(*) AS n FROM oc_exams');
    const published = await num('SELECT COUNT(*) AS n FROM oc_exams WHERE is_published = 1');
    const questions = await num('SELECT COUNT(*) AS n FROM oc_questions');
    const users = await num("SELECT COUNT(*) AS n FROM oc_users WHERE role='user'");
    const attempts = await num("SELECT COUNT(*) AS n FROM oc_attempts WHERE status='completed'");
    const agg = await db.get("SELECT AVG(score_percent) AS avg_score, AVG(passed) AS pass_rate FROM oc_attempts WHERE status='completed' AND mode='exam'");
    const recent = await db.all(`SELECT a.score_percent, a.passed, a.submitted_at, a.mode, e.title AS exam_title, u.name AS candidate
                                 FROM oc_attempts a JOIN oc_exams e ON e.id=a.exam_id JOIN oc_users u ON u.id=a.user_id
                                 WHERE a.status='completed' ORDER BY a.submitted_at DESC LIMIT 8`);
    res.json({
      exams, published, questions, users, attempts,
      avgScore: agg?.avg_score != null ? Math.round(agg.avg_score * 10) / 10 : 0,
      passRate: agg?.pass_rate != null ? Math.round(agg.pass_rate * 100) : 0,
      recent: recent.map((r) => ({ ...r, passed: !!r.passed }))
    });
  } catch (e) { next(e); }
});

router.get('/exam/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const attempts = await db.all("SELECT * FROM oc_attempts WHERE exam_id = ? AND status='completed' AND mode='exam'", exam.id);
    const questions = await db.all('SELECT id, prompt, domain FROM oc_questions WHERE exam_id = ? ORDER BY order_index', exam.id);

    const n = attempts.length;
    const avgScore = n ? Math.round((attempts.reduce((s, a) => s + a.score_percent, 0) / n) * 10) / 10 : 0;
    const passRate = n ? Math.round((attempts.filter((a) => a.passed).length / n) * 100) : 0;
    const avgDuration = n ? Math.round(attempts.reduce((s, a) => s + (a.duration_seconds || 0), 0) / n) : 0;

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
    const hardest = Object.values(qStat).filter((s) => s.seen > 0)
      .map((s) => ({ prompt: s.prompt, domain: s.domain, accuracy: Math.round((s.correct / s.seen) * 100), seen: s.seen }))
      .sort((a, b) => a.accuracy - b.accuracy).slice(0, 8);
    const domains = Object.entries(domStat).map(([name, v]) => ({ name, accuracy: v.seen ? Math.round((v.correct / v.seen) * 100) : 0, seen: v.seen }));
    const scoreBuckets = [0, 0, 0, 0, 0];
    attempts.forEach((a) => {
      const p = a.score_percent;
      scoreBuckets[p < 60 ? 0 : p < 70 ? 1 : p < 80 ? 2 : p < 90 ? 3 : 4] += 1;
    });

    res.json({ exam: { id: exam.id, title: exam.title, passing_score: exam.passing_score }, attempts: n, avgScore, passRate, avgDuration, hardest, domains, scoreBuckets, questionCount: questions.length });
  } catch (e) { next(e); }
});

export default router;
