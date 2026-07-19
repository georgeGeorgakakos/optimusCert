import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

function parseData(raw) {
  if (raw == null) return {};
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

// Remove correct-answer info before sending a question to a candidate.
function sanitizeQuestion(q) {
  const data = parseData(q.data);
  const clean = { ...data };
  delete clean.correct;
  if (Array.isArray(clean.targets)) clean.targets = clean.targets.map(({ correct, ...t }) => t);
  if (Array.isArray(clean.statements)) clean.statements = clean.statements.map(({ correct, ...s }) => s);
  if (Array.isArray(clean.segments)) clean.segments = clean.segments.map(({ correct, ...s }) => s);
  return { id: q.id, type: q.type, prompt: q.prompt, points: q.points, domain: q.domain, order_index: q.order_index, data: clean };
}

function fullQuestion(q) {
  return { ...q, data: parseData(q.data) };
}

async function touchExam(id) {
  await db.run("UPDATE oc_exams SET updated_at = datetime('now') WHERE id = ?", id);
}

// ---------- Exams ----------
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const rows = isAdmin
      ? await db.all('SELECT * FROM oc_exams ORDER BY updated_at DESC')
      : await db.all('SELECT * FROM oc_exams WHERE is_published = 1 ORDER BY updated_at DESC');
    const withCount = [];
    for (const e of rows) {
      const c = await db.get('SELECT COUNT(*) AS n FROM oc_questions WHERE exam_id = ?', e.id);
      withCount.push({ ...e, question_count: Number(c?.n || 0) });
    }
    res.json(withCount);
  } catch (e) { next(e); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const isAdmin = req.user.role === 'admin';
    if (!exam.is_published && !isAdmin) return res.status(403).json({ error: 'Exam not available' });

    const questions = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', exam.id);
    const withMode = req.query.mode === 'edit' && isAdmin;
    res.json({
      ...exam,
      question_count: questions.length,
      questions: questions.map((q) => (withMode ? fullQuestion(q) : sanitizeQuestion(q)))
    });
  } catch (e) { next(e); }
});

router.post('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { title, description = '', category = 'General', vendor = '', duration_minutes = 60, passing_score = 70, shuffle = 1 } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const id = uuid();
    await db.run(`INSERT INTO oc_exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,created_by)
                  VALUES (?,?,?,?,?,?,?,?,?)`,
      id, title, description, category, vendor, duration_minutes, passing_score, shuffle ? 1 : 0, req.user.id);
    res.json(await db.get('SELECT * FROM oc_exams WHERE id = ?', id));
  } catch (e) { next(e); }
});

router.put('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const f = req.body || {};
    await db.run(`UPDATE oc_exams SET title=?,description=?,category=?,vendor=?,duration_minutes=?,passing_score=?,shuffle=?,is_published=?,updated_at=datetime('now') WHERE id=?`,
      f.title ?? exam.title, f.description ?? exam.description, f.category ?? exam.category, f.vendor ?? exam.vendor,
      f.duration_minutes ?? exam.duration_minutes, f.passing_score ?? exam.passing_score,
      (f.shuffle ?? exam.shuffle) ? 1 : 0, (f.is_published ?? exam.is_published) ? 1 : 0, exam.id);
    res.json(await db.get('SELECT * FROM oc_exams WHERE id = ?', exam.id));
  } catch (e) { next(e); }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    await db.run('DELETE FROM oc_questions WHERE exam_id = ?', req.params.id);
    await db.run('DELETE FROM oc_attempts WHERE exam_id = ?', req.params.id);
    await db.run('DELETE FROM oc_exams WHERE id = ?', req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Questions ----------
router.get('/:id/questions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const rows = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', req.params.id);
    res.json(rows.map(fullQuestion));
  } catch (e) { next(e); }
});

router.post('/:id/questions', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT id FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const { type, prompt, data = {}, explanation = '', domain = '', points = 1 } = req.body || {};
    if (!type || !prompt) return res.status(400).json({ error: 'type and prompt are required' });
    const max = await db.get('SELECT COALESCE(MAX(order_index),-1) AS m FROM oc_questions WHERE exam_id = ?', req.params.id);
    const id = uuid();
    await db.run('INSERT INTO oc_questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)',
      id, req.params.id, type, prompt, JSON.stringify(data), explanation, domain, points, Number(max.m) + 1);
    await touchExam(req.params.id);
    res.json(fullQuestion(await db.get('SELECT * FROM oc_questions WHERE id = ?', id)));
  } catch (e) { next(e); }
});

// Bulk insert (used by AI/structured import)
router.post('/:id/questions/bulk', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT id FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const items = Array.isArray(req.body?.questions) ? req.body.questions : [];
    const maxRow = await db.get('SELECT COALESCE(MAX(order_index),-1) AS m FROM oc_questions WHERE exam_id = ?', req.params.id);
    let order = Number(maxRow.m);
    for (const it of items) {
      order += 1;
      await db.run('INSERT INTO oc_questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)',
        uuid(), req.params.id, it.type, it.prompt, JSON.stringify(it.data || {}), it.explanation || '', it.domain || '', it.points || 1, order);
    }
    await touchExam(req.params.id);
    res.json({ inserted: items.length });
  } catch (e) { next(e); }
});

router.put('/:id/questions/reorder', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const order = req.body?.order || [];
    for (let i = 0; i < order.length; i++) {
      await db.run('UPDATE oc_questions SET order_index = ? WHERE id = ? AND exam_id = ?', i, order[i], req.params.id);
    }
    await touchExam(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------- Portable .cfexam file format ----------
const CFEXAM_FORMAT = 'optimuscert-exam';
const CFEXAM_VERSION = 1;
const ACCEPTED_FORMATS = ['optimuscert-exam', 'certforge-exam'];

router.get('/:id/export', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const exam = await db.get('SELECT * FROM oc_exams WHERE id = ?', req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    const questions = await db.all('SELECT * FROM oc_questions WHERE exam_id = ? ORDER BY order_index', exam.id);
    res.json({
      format: CFEXAM_FORMAT, version: CFEXAM_VERSION, exportedAt: new Date().toISOString(),
      exam: { title: exam.title, description: exam.description, category: exam.category, vendor: exam.vendor, duration_minutes: exam.duration_minutes, passing_score: exam.passing_score, shuffle: exam.shuffle },
      questions: questions.map((q) => ({ type: q.type, prompt: q.prompt, data: parseData(q.data), explanation: q.explanation, domain: q.domain, points: q.points }))
    });
  } catch (e) { next(e); }
});

router.post('/import-file', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!ACCEPTED_FORMATS.includes(body.format)) return res.status(400).json({ error: 'Not a valid .cfexam file (unexpected format).' });
    const e = body.exam || {};
    if (!e.title) return res.status(400).json({ error: 'The exam file is missing a title.' });
    const questions = Array.isArray(body.questions) ? body.questions : [];

    const examId = uuid();
    await db.run(`INSERT INTO oc_exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,is_published,created_by)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`,
      examId, e.title, e.description || '', e.category || 'General', e.vendor || '',
      e.duration_minutes || 60, e.passing_score || 70, e.shuffle ? 1 : 0, 0, req.user.id);
    let i = 0;
    for (const q of questions) {
      if (!q.type || !q.prompt) continue;
      await db.run('INSERT INTO oc_questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)',
        uuid(), examId, q.type, q.prompt, JSON.stringify(q.data || {}), q.explanation || '', q.domain || '', q.points || 1, i++);
    }
    const created = await db.get('SELECT * FROM oc_exams WHERE id = ?', examId);
    res.json({ ...created, imported_questions: i });
  } catch (e) { next(e); }
});

export default router;
