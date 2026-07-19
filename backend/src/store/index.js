// Pluggable async data store for OptimusCert.
//
// Two interchangeable drivers behind one small async API (get/all/run/exec):
//   - 'sqlite'    : embedded better-sqlite3 file (default; fully local)
//   - 'optimusdb' : OptimusDB's SQLite via its SQL-over-HTTP interface
//
// Select the driver with DB_BACKEND=optimusdb|sqlite. All SQL is written with
// positional `?` placeholders; the sqlite driver binds them natively, while the
// optimusdb driver inlines safely-escaped literals (OptimusDB has no bind API).

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSql, ping, endpoint } from './optimusClient.js';
import { ensureSchema, seedIfEmpty } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKEND = (process.env.DB_BACKEND || 'sqlite').toLowerCase();

// ---------- shared literal escaping (for the optimusdb driver) ----------
function lit(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function inline(sql, params) {
  let i = 0;
  return sql.replace(/\?/g, () => lit(params[i++]));
}
function splitStatements(sqlText) {
  // DDL only — our schema contains no ';' inside string literals.
  return sqlText.split(';').map((s) => s.trim()).filter((s) => s && !/^--/.test(s));
}

// ---------- sqlite driver ----------
function makeSqliteStore() {
  const Database = require('better-sqlite3');
  const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, 'exam.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    backend: 'sqlite',
    async get(sql, ...p) { return db.prepare(sql).get(...p); },
    async all(sql, ...p) { return db.prepare(sql).all(...p); },
    async run(sql, ...p) { db.prepare(sql).run(...p); },
    async exec(sqlText) { db.exec(sqlText); },
    async waitReady() { return true; }
  };
}

// ---------- optimusdb driver ----------
function makeOptimusStore() {
  return {
    backend: 'optimusdb',
    async get(sql, ...p) { const rows = await this.all(sql, ...p); return rows[0]; },
    async all(sql, ...p) {
      const data = await execSql(inline(sql, p)); // client already unwraps data.records
      return Array.isArray(data) ? data : []; // status string / null => no rows
    },
    async run(sql, ...p) { await execSql(inline(sql, p)); },
    async exec(sqlText) { for (const st of splitStatements(sqlText)) await execSql(st); },
    async waitReady() {
      const retries = parseInt(process.env.OPTIMUSDB_STARTUP_RETRIES || '30', 10);
      for (let i = 0; i < retries; i++) {
        if (await ping()) return true;
        console.log(`[store] waiting for OptimusDB at ${endpoint()} … (${i + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`OptimusDB not reachable at ${endpoint()} after ${retries} attempts`);
    }
  };
}

// `require` shim for the native module inside ESM
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

export const store = BACKEND === 'optimusdb' ? makeOptimusStore() : makeSqliteStore();

let initialized = false;
export async function initStore() {
  if (initialized) return store;
  console.log(`[store] backend = ${store.backend}`);
  await store.waitReady();
  await ensureSchema(store);
  await seedIfEmpty(store);
  initialized = true;
  return store;
}

export default store;
