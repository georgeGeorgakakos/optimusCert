import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { gradeAttempt, gradeQuestion } from '../services/grading.js';

const router = Router();

function parseData(raw) { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); }

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sanitizeQuestion(q) {
  const data = parseData(q.data);
  const clean = { ...data };
  delete clean.correct;
  if (Array.isArray(clean.targets)) clean.targets = clean.targets.map(({ correct, ...t }) => t);
  if (Array.isArray(clean.statements)) clean.statements = clean.statements.map(({ correct, ...s }) => s);
  if (Array.isArray(clean.segments)) clean.segments = clean.segments.map(({ correct, ...s }) => s);
  return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, domain: q.domain, data: clean };
}

// Start an attempt (mode: 'exam' | 'practice')
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { examId } = req.body || {};
    const mode = req.body?.mode === 'practice' ? 'practice' : 'exam';
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', examId);
    if (!exam || (!exam.is_published && req.user.role !== 'admin')) return res.status(404).json({ error: 'Exam not available' });
    let questions = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', examId);
    if (questions.length === 0) return res.status(400).json({ error: 'This exam has no questions yet' });
    if (exam.shuffle) questions = shuffle(questions);

    const id = uuid();
    const total = questions.reduce((s, q) => s + (q.points || 1), 0);
    await db.run('INSERT INTO oc_attempts (id,exam_id,user_id,mode,total_points) VALUES (?,?,?,?,?)', id, examId, req.user.id, mode, total);

    res.json({
      attemptId: id, mode,
      exam: { id: exam.id, title: exam.title, category: exam.category, vendor: exam.vendor, duration_minutes: exam.duration_minutes, passing_score: exam.passing_score },
      startedAt: Date.now(),
      questions: questions.map(sanitizeQuestion)
    });
  } catch (e) { next(e); }
});

// Practice mode: check a single question and reveal the correct answer + explanation
router.post('/:id/check', requireAuth, async (req, res, next) => {
  try {
    const attempt = await db.get('SELECT * FROM oc_attempts WHERE id = ?', req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not your attempt' });
    if (attempt.mode !== 'practice') return res.status(400).json({ error: 'Answer checking is only available in practice mode' });

    const { questionId, answer } = req.body || {};
    const q = await db.get('SELECT * FROM oc_questions WHERE id = ? AND exam_id = ?', questionId, attempt.exam_id);
    if (!q) return res.status(404).json({ error: 'Question not found' });

    const r = gradeQuestion(q, answer);
    const data = parseData(q.data);
    const solution = {};
    if (data.correct) solution.correct = data.correct;
    if (data.targets) solution.targets = data.targets;
    if (data.statements) solution.statements = data.statements;
    if (data.segments) solution.segments = data.segments;
    res.json({ correct: r.correct, explanation: q.explanation, solution });
  } catch (e) { next(e); }
});

// Submit an attempt
router.post('/:id/submit', requireAuth, async (req, res, next) => {
  try {
    const attempt = await db.get('SELECT * FROM oc_attempts WHERE id = ?', req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.user_id !== req.user.id) return res.status(403).json({ error: 'Not your attempt' });
    if (attempt.status === 'completed') return res.status(400).json({ error: 'Attempt already submitted' });

    const answers = req.body?.answers || {};
    const durationSeconds = req.body?.duration_seconds || 0;
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', attempt.exam_id);
    const questions = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', attempt.exam_id);

    const { earned, total, scorePercent, detail } = gradeAttempt(questions, answers);
    const passed = scorePercent >= exam.passing_score ? 1 : 0;

    await db.run(`UPDATE oc_attempts SET status='completed', submitted_at=datetime('now'),
                  duration_seconds=?, earned_points=?, total_points=?, score_percent=?, passed=?, answers=?, detail=? WHERE id=?`,
      durationSeconds, earned, total, scorePercent, passed, JSON.stringify(answers), JSON.stringify(detail), attempt.id);

    res.json(await buildResult(attempt.id));
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const attempt = await db.get('SELECT * FROM oc_attempts WHERE id = ?', req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    res.json(await buildResult(attempt.id));
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.all(`
      SELECT a.*, e.title AS exam_title, e.category, e.vendor
      FROM oc_attempts a JOIN oc_exams e ON e.id = a.exam_id
      WHERE a.user_id = ? AND a.status='completed'
      ORDER BY a.submitted_at DESC`, req.user.id);
    res.json(rows.map((r) => ({
      id: r.id, exam_id: r.exam_id, exam_title: r.exam_title, category: r.category, vendor: r.vendor,
      score_percent: r.score_percent, passed: !!r.passed, submitted_at: r.submitted_at, duration_seconds: r.duration_seconds
    })));
  } catch (e) { next(e); }
});

async function buildResult(attemptId) {
  const a = await db.get('SELECT * FROM oc_attempts WHERE id = ?', attemptId);
  const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', a.exam_id);
  const user = await db.get('SELECT name FROM oc_users WHERE id = ?', a.user_id);
  const questions = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', a.exam_id);
  const answers = parseData(a.answers || '{}');
  const detailMap = Object.fromEntries(JSON.parse(a.detail || '[]').map((d) => [d.questionId, d]));

  const domains = {};
  for (const q of questions) {
    const dkey = q.domain || 'General';
    if (!domains[dkey]) domains[dkey] = { correct: 0, total: 0 };
    domains[dkey].total += 1;
    if (detailMap[q.id]?.correct) domains[dkey].correct += 1;
  }

  return {
    id: a.id, mode: a.mode, candidate: user?.name || 'Candidate',
    exam: { id: exam.id, title: exam.title, passing_score: exam.passing_score, vendor: exam.vendor, category: exam.category },
    score_percent: a.score_percent, earned_points: a.earned_points, total_points: a.total_points,
    passed: !!a.passed, duration_seconds: a.duration_seconds, submitted_at: a.submitted_at,
    domains: Object.entries(domains).map(([name, v]) => ({ name, ...v, percent: v.total ? Math.round((v.correct / v.total) * 100) : 0 })),
    review: questions.map((q) => ({
      id: q.id, type: q.type, prompt: q.prompt, points: q.points, domain: q.domain,
      data: parseData(q.data), explanation: q.explanation,
      yourAnswer: answers[q.id] ?? null,
      correct: detailMap[q.id]?.correct ?? false,
      earned: detailMap[q.id]?.earned ?? 0
    }))
  };
}

export default router;
