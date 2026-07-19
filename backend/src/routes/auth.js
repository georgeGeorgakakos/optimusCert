import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import db from '../db.js';
import { sign, requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password and name are required' });
    const exists = await db.get('SELECT id FROM oc_users WHERE email = ?', email.toLowerCase());
    if (exists) return res.status(409).json({ error: 'An account with this email already exists' });

    const id = uuid();
    await db.run('INSERT INTO oc_users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)',
      id, email.toLowerCase(), bcrypt.hashSync(password, 10), name, 'user');
    const user = { id, email: email.toLowerCase(), name, role: 'user' };
    res.json({ token: sign(user), user });
  } catch (e) { next(e); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const row = await db.get('SELECT * FROM oc_users WHERE email = ?', email.toLowerCase());
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = { id: row.id, email: row.email, name: row.name, role: row.role };
    res.json({ token: sign(user), user });
  } catch (e) { next(e); }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
