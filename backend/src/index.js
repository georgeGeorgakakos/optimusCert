import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { initStore, BACKEND } from './db.js';
import authRoutes from './routes/auth.js';
import examRoutes from './routes/exams.js';
import questionRoutes from './routes/questions.js';
import attemptRoutes from './routes/attempts.js';
import importRoutes from './routes/import.js';
import analyticsRoutes from './routes/analytics.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'OptimusDB', backend: BACKEND, ts: Date.now() }));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/attempts', attemptRoutes);
app.use('/api/import', importRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const PORT = process.env.PORT || 4000;

initStore()
  .then(() => {
    app.listen(PORT, () => console.log(`[OptimusDB] OptimusCert API listening on :${PORT} (backend: ${BACKEND})`));
  })
  .catch((e) => {
    console.error('[OptimusDB] Failed to initialize data store:', e.message);
    process.exit(1);
  });
