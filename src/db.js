// Armazenamento local (SQLite nativo do Node 22.5+). Sem dependencias externas.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS connections (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,              -- mysql | mariadb | postgres | firebird
  host         TEXT NOT NULL DEFAULT '',
  port         INTEGER NOT NULL DEFAULT 0,
  database     TEXT NOT NULL DEFAULT '',   -- firebird: caminho do .fdb
  username     TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  options      TEXT NOT NULL DEFAULT '{}', -- {"ssl":false,"charset":"utf8mb4","schema":"public"}
  created_at   TEXT NOT NULL,
  updated_at   TEXT
);

CREATE TABLE IF NOT EXISTS mappings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  schema_name   TEXT,
  table_name    TEXT NOT NULL,
  config        TEXT NOT NULL,             -- json: colunas, filtros, ordem, limite
  created_at    TEXT NOT NULL,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_mappings_conn ON mappings(connection_id);

CREATE TABLE IF NOT EXISTS runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER,
  table_name    TEXT,
  rows          INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ok', -- ok | erro
  message       TEXT,
  created_at    TEXT NOT NULL
);
`;

let _db = null;
let _file = null;

export function openDb(file) {
  _file = path.resolve(file);
  fs.mkdirSync(path.dirname(_file), { recursive: true });
  const database = new DatabaseSync(_file);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA busy_timeout = 5000;');
  database.exec(SCHEMA);
  _db = database;
  return database;
}

export function db() {
  if (!_db) throw new Error('Banco nao inicializado.');
  return _db;
}

export function dbFile() {
  return _file;
}

export function closeDb() {
  if (_db) { try { _db.close(); } catch { /* ignore */ } }
  _db = null;
}

function norm(params) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    if (typeof p === 'bigint') return Number(p);
    return p;
  });
}

export function all(sql, ...params) {
  return db().prepare(sql).all(...norm(params));
}

export function get(sql, ...params) {
  return db().prepare(sql).get(...norm(params)) ?? null;
}

export function run(sql, ...params) {
  const r = db().prepare(sql).run(...norm(params));
  return { changes: Number(r.changes ?? 0), lastId: Number(r.lastInsertRowid ?? 0) };
}

export function exec(sql) {
  db().exec(sql);
}

let _depth = 0;
export function tx(fn) {
  const d = db();
  const sp = `sp_${_depth}`;
  if (_depth === 0) d.exec('BEGIN IMMEDIATE');
  else d.exec(`SAVEPOINT ${sp}`);
  _depth += 1;
  try {
    const out = fn();
    _depth -= 1;
    if (_depth === 0) d.exec('COMMIT');
    else d.exec(`RELEASE ${sp}`);
    return out;
  } catch (err) {
    _depth -= 1;
    try {
      if (_depth === 0) d.exec('ROLLBACK');
      else d.exec(`ROLLBACK TO ${sp}`);
    } catch { /* ignore */ }
    throw err;
  }
}

export function setting(key, fallback = '') {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value ?? ''),
  );
}

export function nowIso() {
  return new Date().toISOString();
}
