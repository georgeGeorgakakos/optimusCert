import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Remove correct-answer info before sending a question to a candidate.
function sanitizeQuestion(q) {
  const data = JSON.parse(q.data);
  const clean = { ...data };
  delete clean.correct;
  if (Array.isArray(clean.targets)) clean.targets = clean.targets.map(({ correct, ...t }) => t);
  if (Array.isArray(clean.statements)) clean.statements = clean.statements.map(({ correct, ...s }) => s);
  if (Array.isArray(clean.segments)) clean.segments = clean.segments.map(({ correct, ...s }) => s);
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    points: q.points,
    domain: q.domain,
    order_index: q.order_index,
    data: clean
  };
}

function fullQuestion(q) {
  return { ...q, data: JSON.parse(q.data) };
}

// ---------- Exams ----------
router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const rows = isAdmin
    ? db.prepare('SELECT * FROM exams ORDER BY updated_at DESC').all()
    : db.prepare('SELECT * FROM exams WHERE is_published = 1 ORDER BY updated_at DESC').all();
  const withCount = rows.map((e) => {
    const c = db.prepare('SELECT COUNT(*) n FROM questions WHERE exam_id = ?').get(e.id).n;
    return { ...e, question_count: c };
  });
  res.json(withCount);
});

router.get('/:id', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const isAdmin = req.user.role === 'admin';
  if (!exam.is_published && !isAdmin) return res.status(403).json({ error: 'Exam not available' });

  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index').all(exam.id);
  const withMode = req.query.mode === 'edit' && isAdmin;
  res.json({
    ...exam,
    question_count: questions.length,
    questions: questions.map((q) => (withMode ? fullQuestion(q) : sanitizeQuestion(q)))
  });
});

router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { title, description = '', category = 'General', vendor = '', duration_minutes = 60, passing_score = 70, shuffle = 1 } = req.body || {};
  if (!title) return res.status(400).json({ error: 'title is required' });
  const id = uuid();
  db.prepare(`INSERT INTO exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,created_by)
              VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, title, description, category, vendor, duration_minutes, passing_score, shuffle ? 1 : 0, req.user.id);
  res.json(db.prepare('SELECT * FROM exams WHERE id = ?').get(id));
});

router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const f = req.body || {};
  db.prepare(`UPDATE exams SET title=?,description=?,category=?,vendor=?,duration_minutes=?,passing_score=?,shuffle=?,is_published=?,updated_at=datetime('now') WHERE id=?`)
    .run(
      f.title ?? exam.title,
      f.description ?? exam.description,
      f.category ?? exam.category,
      f.vendor ?? exam.vendor,
      f.duration_minutes ?? exam.duration_minutes,
      f.passing_score ?? exam.passing_score,
      (f.shuffle ?? exam.shuffle) ? 1 : 0,
      (f.is_published ?? exam.is_published) ? 1 : 0,
      exam.id
    );
  res.json(db.prepare('SELECT * FROM exams WHERE id = ?').get(exam.id));
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM exams WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Questions ----------
router.get('/:id/questions', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index').all(req.params.id);
  res.json(rows.map(fullQuestion));
});

router.post('/:id/questions', requireAuth, requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const { type, prompt, data = {}, explanation = '', domain = '', points = 1 } = req.body || {};
  if (!type || !prompt) return res.status(400).json({ error: 'type and prompt are required' });
  const max = db.prepare('SELECT COALESCE(MAX(order_index),-1) m FROM questions WHERE exam_id = ?').get(req.params.id).m;
  const id = uuid();
  db.prepare('INSERT INTO questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, req.params.id, type, prompt, JSON.stringify(data), explanation, domain, points, max + 1);
  touchExam(req.params.id);
  res.json(fullQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id)));
});

// Bulk insert (used by AI import)
router.post('/:id/questions/bulk', requireAuth, requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT id FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const items = Array.isArray(req.body?.questions) ? req.body.questions : [];
  let order = db.prepare('SELECT COALESCE(MAX(order_index),-1) m FROM questions WHERE exam_id = ?').get(req.params.id).m;
  const insert = db.prepare('INSERT INTO questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)');
  const tx = db.transaction((list) => {
    for (const it of list) {
      order += 1;
      insert.run(uuid(), req.params.id, it.type, it.prompt, JSON.stringify(it.data || {}), it.explanation || '', it.domain || '', it.points || 1, order);
    }
  });
  tx(items);
  touchExam(req.params.id);
  res.json({ inserted: items.length });
});

router.put('/:id/questions/reorder', requireAuth, requireAdmin, (req, res) => {
  const order = req.body?.order || [];
  const upd = db.prepare('UPDATE questions SET order_index = ? WHERE id = ? AND exam_id = ?');
  const tx = db.transaction((ids) => ids.forEach((qid, i) => upd.run(i, qid, req.params.id)));
  tx(order);
  touchExam(req.params.id);
  res.json({ ok: true });
});

function touchExam(id) {
  db.prepare("UPDATE exams SET updated_at = datetime('now') WHERE id = ?").run(id);
}

// ---------- Portable .cfexam file format ----------
const CFEXAM_FORMAT = 'optimuscert-exam';
const CFEXAM_VERSION = 1;
const ACCEPTED_FORMATS = ['optimuscert-exam', 'certforge-exam']; // back-compat

// Export an entire exam (settings + all questions incl. answers) as one object.
router.get('/:id/export', requireAuth, requireAdmin, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index').all(exam.id);
  res.json({
    format: CFEXAM_FORMAT,
    version: CFEXAM_VERSION,
    exportedAt: new Date().toISOString(),
    exam: {
      title: exam.title, description: exam.description, category: exam.category, vendor: exam.vendor,
      duration_minutes: exam.duration_minutes, passing_score: exam.passing_score, shuffle: exam.shuffle
    },
    questions: questions.map((q) => ({
      type: q.type, prompt: q.prompt, data: JSON.parse(q.data), explanation: q.explanation, domain: q.domain, points: q.points
    }))
  });
});

// Import a .cfexam file -> create a brand-new exam with all its questions.
router.post('/import-file', requireAuth, requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!ACCEPTED_FORMATS.includes(body.format)) {
    return res.status(400).json({ error: 'Not a valid .cfexam file (unexpected format).' });
  }
  const e = body.exam || {};
  if (!e.title) return res.status(400).json({ error: 'The exam file is missing a title.' });
  const questions = Array.isArray(body.questions) ? body.questions : [];

  const examId = uuid();
  const insertExam = db.prepare(`INSERT INTO exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,is_published,created_by)
                                 VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const insertQ = db.prepare('INSERT INTO questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index) VALUES (?,?,?,?,?,?,?,?,?)');
  const tx = db.transaction(() => {
    insertExam.run(examId, e.title, e.description || '', e.category || 'General', e.vendor || '',
      e.duration_minutes || 60, e.passing_score || 70, e.shuffle ? 1 : 0, 0, req.user.id);
    questions.forEach((q, i) => {
      if (!q.type || !q.prompt) return;
      insertQ.run(uuid(), examId, q.type, q.prompt, JSON.stringify(q.data || {}), q.explanation || '', q.domain || '', q.points || 1, i);
    });
  });
  tx();
  const created = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  res.json({ ...created, imported_questions: questions.length });
});

export default router;
