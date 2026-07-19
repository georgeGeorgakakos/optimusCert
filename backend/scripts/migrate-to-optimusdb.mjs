// Extract everything from the local OptimusCert SQLite database and load it into
// OptimusDB's SQLite via its SQL-over-HTTP interface.
//
//   node scripts/migrate-to-optimusdb.mjs
//
// Env:
//   DATA_DIR        directory of the source exam.db (default ../data)
//   OPTIMUSDB_URL   base URL of OptimusDB (default http://localhost:8089)
//   OPTIMUSDB_CONTEXT  path prefix (default swarmkb)
//   MIGRATE_WIPE=1  DELETE existing rows in OptimusDB tables before loading
//
// This is idempotent for the schema (CREATE TABLE IF NOT EXISTS). Rows are
// inserted as-is; pass MIGRATE_WIPE=1 to avoid duplicates on a re-run.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSql, ping, endpoint } from '../src/store/optimusClient.js';
import { TABLES } from '../src/store/schema.js';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'exam.db');
// OptimusCert tables are namespaced with oc_ in OptimusDB to avoid colliding
// with OptimusDB's own catalog tables (e.g. its internal `users`).
const LOGICAL = ['users', 'exams', 'questions', 'attempts'];
const dest = (l) => `oc_${l}`;

function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (Buffer.isBuffer(v)) return "'" + v.toString('utf8').replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Source SQLite not found at ${DB_PATH}. Run the app once on the sqlite backend first.`);
    process.exit(1);
  }
  console.log(`[migrate] source : ${DB_PATH}`);
  console.log(`[migrate] target : ${endpoint()}`);

  console.log('[migrate] waiting for OptimusDB…');
  let up = false;
  for (let i = 0; i < 30 && !up; i++) { up = await ping(); if (!up) await new Promise((r) => setTimeout(r, 2000)); }
  if (!up) { console.error('[migrate] OptimusDB not reachable — is it running and OPTIMUSDB_URL correct?'); process.exit(1); }

  // 1) schema
  console.log('[migrate] ensuring schema on OptimusDB…');
  for (const stmt of TABLES) await execSql(stmt);

  const db = new Database(DB_PATH, { readonly: true });
  const tableExists = (name) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  let totalRows = 0;
  for (const logical of LOGICAL) {
    const src = tableExists(dest(logical)) ? dest(logical) : logical; // handle new (oc_) or legacy source
    if (!tableExists(src)) { console.log(`[migrate] ${logical}: source table not found, skipping`); continue; }
    const rows = db.prepare(`SELECT * FROM ${src}`).all();
    if (process.env.MIGRATE_WIPE === '1') {
      await execSql(`DELETE FROM ${dest(logical)}`);
      console.log(`[migrate] wiped ${dest(logical)} on target`);
    }
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => lit(row[c])).join(', ');
      await execSql(`INSERT INTO ${dest(logical)} (${cols.join(', ')}) VALUES (${vals})`);
    }
    console.log(`[migrate] ${src} -> ${dest(logical)}: ${rows.length} rows`);
    totalRows += rows.length;
  }
  db.close();

  // 2) verify
  console.log('[migrate] verifying counts on OptimusDB…');
  for (const logical of LOGICAL) {
    const r = await execSql(`SELECT COUNT(*) AS n FROM ${dest(logical)}`);
    const n = Array.isArray(r) && r[0] ? r[0].n : '?';
    console.log(`[migrate]   ${dest(logical)}: ${n} rows in OptimusDB`);
  }
  console.log(`[migrate] done — ${totalRows} rows migrated to OptimusDB's SQLite.`);
}

main().catch((e) => { console.error('[migrate] failed:', e.message); process.exit(1); });
