import { Router } from 'express';
import db from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.put('/:qid', requireAuth, requireAdmin, (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.qid);
  if (!q) return res.status(404).json({ error: 'Question not found' });
  const f = req.body || {};
  db.prepare('UPDATE questions SET type=?,prompt=?,data=?,explanation=?,domain=?,points=? WHERE id=?')
    .run(
      f.type ?? q.type,
      f.prompt ?? q.prompt,
      JSON.stringify(f.data ?? JSON.parse(q.data)),
      f.explanation ?? q.explanation,
      f.domain ?? q.domain,
      f.points ?? q.points,
      q.id
    );
  db.prepare("UPDATE exams SET updated_at = datetime('now') WHERE id = ?").run(q.exam_id);
  const updated = db.prepare('SELECT * FROM questions WHERE id = ?').get(q.id);
  res.json({ ...updated, data: JSON.parse(updated.data) });
});

router.delete('/:qid', requireAuth, requireAdmin, (req, res) => {
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.qid);
  if (q) db.prepare("UPDATE exams SET updated_at = datetime('now') WHERE id = ?").run(q.exam_id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.qid);
  res.json({ ok: true });
});

export default router;
