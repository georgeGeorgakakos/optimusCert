// Schema + first-run seed, written against the async store so it works
// identically on the sqlite and optimusdb backends.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TABLES = [
  `CREATE TABLE IF NOT EXISTS oc_users (
    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')) )`,
  `CREATE TABLE IF NOT EXISTS oc_exams (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
    category TEXT DEFAULT 'General', vendor TEXT DEFAULT '',
    duration_minutes INTEGER NOT NULL DEFAULT 60, passing_score INTEGER NOT NULL DEFAULT 70,
    shuffle INTEGER NOT NULL DEFAULT 1, is_published INTEGER NOT NULL DEFAULT 0,
    created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')) )`,
  `CREATE TABLE IF NOT EXISTS oc_questions (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, type TEXT NOT NULL, prompt TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}', explanation TEXT DEFAULT '', domain TEXT DEFAULT '',
    points INTEGER NOT NULL DEFAULT 1, order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')) )`,
  `CREATE TABLE IF NOT EXISTS oc_attempts (
    id TEXT PRIMARY KEY, exam_id TEXT NOT NULL, user_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'exam', status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT NOT NULL DEFAULT (datetime('now')), submitted_at TEXT,
    duration_seconds INTEGER DEFAULT 0, earned_points REAL DEFAULT 0, total_points REAL DEFAULT 0,
    score_percent REAL DEFAULT 0, passed INTEGER DEFAULT 0,
    answers TEXT DEFAULT '{}', detail TEXT DEFAULT '[]' )`,
  `CREATE INDEX IF NOT EXISTS idx_questions_exam ON oc_questions(exam_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_user ON oc_attempts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_exam ON oc_attempts(exam_id)`
];

export async function ensureSchema(store) {
  for (const stmt of TABLES) await store.run(stmt);
}

export async function seedIfEmpty(store) {
  const existing = await store.get('SELECT COUNT(*) AS n FROM oc_users');
  if (existing && Number(existing.n) > 0) return;

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@exam.local').toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminId = uuid();
  await store.run('INSERT INTO oc_users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)',
    adminId, adminEmail, bcrypt.hashSync(adminPass, 10), 'Administrator', 'admin');
  await store.run('INSERT INTO oc_users (id,email,password_hash,name,role) VALUES (?,?,?,?,?)',
    uuid(), 'user@exam.local', bcrypt.hashSync('user123', 10), 'Demo Candidate', 'user');

  await seedSample(store, adminId);
  await seedFromFile(store, adminId, 'ab731.json');
  console.log(`[store] Seeded admin (${adminEmail} / ${adminPass}) and demo user (user@exam.local / user123).`);
}

async function insertExam(store, e, createdBy, published) {
  const id = uuid();
  await store.run(
    `INSERT INTO oc_exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,is_published,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, e.title, e.description || '', e.category || 'General', e.vendor || '',
    e.duration_minutes || 60, e.passing_score || 70, e.shuffle ? 1 : 0, published ? 1 : 0, createdBy);
  return id;
}

async function insertQuestions(store, examId, questions) {
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    await store.run(
      `INSERT INTO oc_questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uuid(), examId, q.type, q.prompt, JSON.stringify(q.data || {}), q.explanation || '', q.domain || '', q.points || 1, i);
  }
}

async function seedFromFile(store, adminId, fileName) {
  try {
    const p = path.join(__dirname, '..', 'seeds', fileName);
    if (!fs.existsSync(p)) return;
    const { exam, questions } = JSON.parse(fs.readFileSync(p, 'utf8'));
    const examId = await insertExam(store, exam, adminId, true);
    await insertQuestions(store, examId, questions || []);
    console.log(`[store] Seeded exam "${exam.title}" with ${(questions || []).length} questions.`);
  } catch (e) {
    console.error('[store] seedFromFile failed:', e.message);
  }
}

async function seedSample(store, adminId) {
  const examId = await insertExam(store, {
    title: 'AZ-900: Microsoft Azure Fundamentals (Demo)',
    description: 'A short demo exam showcasing every supported question type. Replace with your own imported content.',
    category: 'Cloud', vendor: 'Microsoft', duration_minutes: 20, passing_score: 70, shuffle: 1
  }, adminId, true);

  const qs = [
    { type: 'single', prompt: 'Which Azure service provides a managed relational database as a service?',
      data: { options: [{ id: 'a', text: 'Azure Blob Storage' }, { id: 'b', text: 'Azure SQL Database' }, { id: 'c', text: 'Azure Virtual Machines' }, { id: 'd', text: 'Azure Functions' }], correct: ['b'] },
      explanation: 'Azure SQL Database is a fully managed PaaS relational database engine.', domain: 'Core services' },
    { type: 'multi', prompt: 'Which of the following are benefits of cloud computing? (Choose two.)',
      data: { options: [{ id: 'a', text: 'High availability' }, { id: 'b', text: 'Elastic scalability' }, { id: 'c', text: 'Guaranteed zero cost' }, { id: 'd', text: 'Physical ownership of hardware' }], correct: ['a', 'b'], selectCount: 2 },
      explanation: 'Cloud computing offers high availability and elastic scalability.', domain: 'Cloud concepts' },
    { type: 'dragdrop', prompt: 'Match each Azure service to its correct category.',
      data: { items: [{ id: 'i1', text: 'Azure Kubernetes Service' }, { id: 'i2', text: 'Azure Cosmos DB' }, { id: 'i3', text: 'Azure Active Directory' }], targets: [{ id: 't1', label: 'Compute', correct: 'i1' }, { id: 't2', label: 'Database', correct: 'i2' }, { id: 't3', label: 'Identity', correct: 'i3' }] },
      explanation: 'AKS = compute, Cosmos DB = database, Azure AD = identity.', domain: 'Core services' },
    { type: 'hotspot', prompt: 'For each of the following statements, select Yes if the statement is true. Otherwise, select No.',
      data: { statements: [{ id: 's1', text: 'Azure is a public cloud provider.', correct: 'yes' }, { id: 's2', text: 'A resource group can contain resources from multiple regions.', correct: 'yes' }, { id: 's3', text: 'You must pay for stopped (deallocated) virtual machines’ compute.', correct: 'no' }] },
      explanation: 'Azure is public cloud; resource groups span regions; deallocated VMs incur no compute charge.', domain: 'Core concepts' },
    { type: 'dropdown', prompt: 'Complete the sentence by selecting the correct options.',
      data: { segments: [{ type: 'text', text: 'The Azure pricing model where you pay only for what you use is called ' }, { type: 'blank', id: 'b1', options: ['consumption-based', 'reserved', 'perpetual'], correct: 'consumption-based' }, { type: 'text', text: ', while committing for 1 or 3 years for a discount is called ' }, { type: 'blank', id: 'b2', options: ['spot', 'reserved instances', 'free tier'], correct: 'reserved instances' }, { type: 'text', text: '.' }] },
      explanation: 'Pay-as-you-go = consumption-based; long-term commitment = reserved instances.', domain: 'Pricing' }
  ];
  await insertQuestions(store, examId, qs);
}
