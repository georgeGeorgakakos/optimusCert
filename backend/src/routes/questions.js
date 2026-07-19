import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

function parseData(raw) { return typeof raw === 'string' ? JSON.parse(raw) : (raw || {}); }

router.put('/:qid', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const q = await db.get('SELECT * FROM oc_questions WHERE id = ?', req.params.qid);
    if (!q) return res.status(404).json({ error: 'Question not found' });
    const f = req.body || {};
    await db.run('UPDATE oc_questions SET type=?,prompt=?,data=?,explanation=?,domain=?,points=? WHERE id=?',
      f.type ?? q.type, f.prompt ?? q.prompt, JSON.stringify(f.data ?? parseData(q.data)),
      f.explanation ?? q.explanation, f.domain ?? q.domain, f.points ?? q.points, q.id);
    await db.run("UPDATE oc_exams SET updated_at = datetime('now') WHERE id = ?", q.exam_id);
    const updated = await db.get('SELECT * FROM oc_questions WHERE id = ?', q.id);
    res.json({ ...updated, data: parseData(updated.data) });
  } catch (e) { next(e); }
});

router.delete('/:qid', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const q = await db.get('SELECT * FROM oc_questions WHERE id = ?', req.params.qid);
    if (q) await db.run("UPDATE oc_exams SET updated_at = datetime('now') WHERE id = ?", q.exam_id);
    await db.run('DELETE FROM oc_questions WHERE id = ?', req.params.qid);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
