// Low-level client for OptimusDB's SQL-over-HTTP interface.
//
// OptimusDB exposes a single command endpoint that runs one SQL statement at a
// time against its internal SQLite engine:
//
//   POST {base}/{context}/command
//   { "method": { "cmd": "sqldml", "argcnt": 1 }, "sqldml": "<SQL>" }
//
//   -> { "status": 200, "data": <rows[] for SELECT | status string for writes> }
//
// SELECT returns an array of row objects ({column: value, ...}); a NULL/empty
// result set may come back as null. Errors are returned as a `data` string that
// begins with "ERROR!". There is no parameter binding, so callers must inline
// escaped literals (see ../store/index.js).

const BASE = (process.env.OPTIMUSDB_URL || 'http://optimusdb:8089').replace(/\/+$/, '');
const CONTEXT = process.env.OPTIMUSDB_CONTEXT || 'swarmkb';
const ENDPOINT = `${BASE}/${CONTEXT}/command`;
const TIMEOUT_MS = parseInt(process.env.OPTIMUSDB_TIMEOUT_MS || '15000', 10);

export function endpoint() {
  return ENDPOINT;
}

// Execute a single SQL statement. Returns `data` (array for SELECT, else status).
export async function execSql(statement) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: { cmd: 'sqldml', argcnt: 1 }, sqldml: statement }),
      signal: controller.signal
    });
  } catch (e) {
    throw new Error(`OptimusDB unreachable at ${ENDPOINT}: ${e.message}`);
  } finally {
    clearTimeout(t);
  }

  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`OptimusDB returned non-JSON (${res.status}): ${text.slice(0, 200)}`); }

  if (!res.ok) throw new Error(`OptimusDB HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);

  // Envelope: { status: 200, data: <payload> }
  const payload = body.data !== undefined ? body.data : body;

  // OptimusDB reports SQL errors as a plain string beginning with "ERROR!"
  if (typeof payload === 'string' && /^ERROR!/i.test(payload.trim())) {
    throw new Error(`OptimusDB SQL error: ${payload} | stmt: ${statement.slice(0, 160)}`);
  }

  // SELECT rows may arrive as data.records (real OptimusDB), or as a bare array.
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (Array.isArray(payload.records)) return payload.records;
    if (Array.isArray(payload.rows)) return payload.rows;
    if (Array.isArray(payload.results)) return payload.results;
  }
  return payload; // bare array (SELECT) or status string (write)
}

// Health probe used during startup so we can wait for the DB to be ready.
export async function ping() {
  try {
    const data = await execSql('SELECT 1 AS ok');
    return Array.isArray(data) || data != null;
  } catch {
    return false;
  }
}
