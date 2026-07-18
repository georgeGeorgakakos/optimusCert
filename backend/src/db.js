import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Data dir is mounted as a volume in docker; falls back to local ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'exam.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exams (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT DEFAULT '',
  category         TEXT DEFAULT 'General',
  vendor           TEXT DEFAULT '',
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  passing_score    INTEGER NOT NULL DEFAULT 70,
  shuffle          INTEGER NOT NULL DEFAULT 1,
  is_published     INTEGER NOT NULL DEFAULT 0,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id          TEXT PRIMARY KEY,
  exam_id     TEXT NOT NULL,
  type        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  data        TEXT NOT NULL DEFAULT '{}',
  explanation TEXT DEFAULT '',
  domain      TEXT DEFAULT '',
  points      INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attempts (
  id             TEXT PRIMARY KEY,
  exam_id        TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  mode           TEXT NOT NULL DEFAULT 'exam',
  status         TEXT NOT NULL DEFAULT 'in_progress',
  started_at     TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at   TEXT,
  duration_seconds INTEGER DEFAULT 0,
  earned_points  REAL DEFAULT 0,
  total_points   REAL DEFAULT 0,
  score_percent  REAL DEFAULT 0,
  passed         INTEGER DEFAULT 0,
  answers        TEXT DEFAULT '{}',
  detail         TEXT DEFAULT '[]',
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_questions_exam ON questions(exam_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts(exam_id);
`);

// ---- Seed a default admin + demo user + sample exam ----
function seed() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@exam.local';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const adminId = uuid();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)'
    ).run(adminId, adminEmail, bcrypt.hashSync(adminPass, 10), 'Administrator', 'admin');

    const userId = uuid();
    db.prepare(
      'INSERT INTO users (id, email, password_hash, name, role) VALUES (?,?,?,?,?)'
    ).run(userId, 'user@exam.local', bcrypt.hashSync('user123', 10), 'Demo Candidate', 'user');

    seedSampleExam(adminId);
    seedFromFile(adminId, 'ab731.json');
    console.log(`[OptimusDB] Seeded admin (${adminEmail} / ${adminPass}) and demo user (user@exam.local / user123).`);
  }
}

// Seed a full exam (meta + questions) from a JSON file in ./seeds
function seedFromFile(adminId, fileName) {
  try {
    const p = path.join(__dirname, 'seeds', fileName);
    if (!fs.existsSync(p)) return;
    const { exam, questions } = JSON.parse(fs.readFileSync(p, 'utf8'));
    const examId = uuid();
    db.prepare(`INSERT INTO exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,is_published,created_by)
                VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      examId, exam.title, exam.description || '', exam.category || 'General', exam.vendor || '',
      exam.duration_minutes || 60, exam.passing_score || 70, exam.shuffle ? 1 : 0, 1, adminId);
    const insert = db.prepare(`INSERT INTO questions (id,exam_id,type,prompt,data,explanation,domain,points,order_index)
                               VALUES (?,?,?,?,?,?,?,?,?)`);
    const tx = db.transaction(() => {
      (questions || []).forEach((q, i) =>
        insert.run(uuid(), examId, q.type, q.prompt, JSON.stringify(q.data || {}), q.explanation || '', q.domain || '', q.points || 1, i));
    });
    tx();
    console.log(`[OptimusDB] Seeded exam "${exam.title}" with ${questions.length} questions.`);
  } catch (e) {
    console.error('[OptimusDB] seedFromFile failed:', e.message);
  }
}

function seedSampleExam(adminId) {
  const examId = uuid();
  db.prepare(`INSERT INTO exams (id,title,description,category,vendor,duration_minutes,passing_score,shuffle,is_published,created_by)
              VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    examId,
    'AZ-900: Microsoft Azure Fundamentals (Demo)',
    'A short demo exam showcasing every supported question type. Replace with your own imported content.',
    'Cloud',
    'Microsoft',
    20, 70, 1, 1, adminId
  );

  const q = db.prepare(`INSERT INTO questions (id,exam_id,type,prompt,data,explanation,points,order_index)
                        VALUES (?,?,?,?,?,?,?,?)`);

  q.run(uuid(), examId, 'single',
    'Which Azure service provides a managed relational database as a service?',
    JSON.stringify({
      options: [
        { id: 'a', text: 'Azure Blob Storage' },
        { id: 'b', text: 'Azure SQL Database' },
        { id: 'c', text: 'Azure Virtual Machines' },
        { id: 'd', text: 'Azure Functions' }
      ],
      correct: ['b']
    }),
    'Azure SQL Database is a fully managed PaaS relational database engine.', 1, 0);

  q.run(uuid(), examId, 'multi',
    'Which of the following are benefits of cloud computing? (Choose two.)',
    JSON.stringify({
      options: [
        { id: 'a', text: 'High availability' },
        { id: 'b', text: 'Elastic scalability' },
        { id: 'c', text: 'Guaranteed zero cost' },
        { id: 'd', text: 'Physical ownership of hardware' }
      ],
      correct: ['a', 'b'],
      selectCount: 2
    }),
    'Cloud computing offers high availability and elastic scalability; you do not own hardware and cost is not zero.', 1, 1);

  q.run(uuid(), examId, 'dragdrop',
    'Match each Azure service to its correct category.',
    JSON.stringify({
      items: [
        { id: 'i1', text: 'Azure Kubernetes Service' },
        { id: 'i2', text: 'Azure Cosmos DB' },
        { id: 'i3', text: 'Azure Active Directory' }
      ],
      targets: [
        { id: 't1', label: 'Compute', correct: 'i1' },
        { id: 't2', label: 'Database', correct: 'i2' },
        { id: 't3', label: 'Identity', correct: 'i3' }
      ]
    }),
    'AKS = compute, Cosmos DB = database, Azure AD = identity.', 1, 2);

  q.run(uuid(), examId, 'hotspot',
    'For each of the following statements, select Yes if the statement is true. Otherwise, select No.',
    JSON.stringify({
      statements: [
        { id: 's1', text: 'Azure is a public cloud provider.', correct: 'yes' },
        { id: 's2', text: 'A resource group can contain resources from multiple regions.', correct: 'yes' },
        { id: 's3', text: 'You must pay for stopped (deallocated) virtual machines’ compute.', correct: 'no' }
      ]
    }),
    'Azure is public cloud; resource groups can span regions; deallocated VMs do not incur compute charges.', 1, 3);

  q.run(uuid(), examId, 'dropdown',
    'Complete the sentence by selecting the correct options.',
    JSON.stringify({
      segments: [
        { type: 'text', text: 'The Azure pricing model where you pay only for what you use is called ' },
        { type: 'blank', id: 'b1', options: ['consumption-based', 'reserved', 'perpetual'], correct: 'consumption-based' },
        { type: 'text', text: ', while committing for 1 or 3 years for a discount is called ' },
        { type: 'blank', id: 'b2', options: ['spot', 'reserved instances', 'free tier'], correct: 'reserved instances' },
        { type: 'text', text: '.' }
      ]
    }),
    'Pay-as-you-go = consumption-based; long-term commitment = reserved instances.', 1, 4);
}

seed();

export default db;
