// Driver MySQL / MariaDB (pacote mysql2).
import mysql2 from 'mysql2/promise';
import { buildSelect, buildCount } from '../query.js';
import { QUERY_TIMEOUT_MS } from '../config.js';

function opcoes(cfg) {
  const options = cfg.options || {};
  return {
    host: cfg.host,
    port: Number(cfg.port) || 3306,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database || undefined,
    connectTimeout: 15000,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    charset: options.charset || 'utf8mb4',
    multipleStatements: false,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
  };
}

async function conectar(cfg) {
  return mysql2.createConnection(opcoes(cfg));
}

export async function test(cfg) {
  const conn = await conectar(cfg);
  try {
    const [rows] = await conn.query('SELECT VERSION() AS versao, DATABASE() AS base');
    return { versao: rows[0]?.versao || '', base: rows[0]?.base || '', kind: cfg.kind };
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function listSchemas(cfg) {
  const conn = await conectar(cfg);
  try {
    const [rows] = await conn.query('SHOW DATABASES');
    const nomeCampo = Object.keys(rows[0] || { Database: 1 })[0];
    return rows
      .map((r) => r[nomeCampo])
      .filter((n) => !['information_schema', 'performance_schema', 'mysql', 'sys'].includes(n))
      .map((nome) => ({ nome }));
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function listTables(cfg, { schema } = {}) {
  const base = schema || cfg.database;
  const conn = await conectar(cfg);
  try {
    const [rows] = await conn.query(
      `SELECT TABLE_SCHEMA AS schema_nome, TABLE_NAME AS tabela, TABLE_TYPE AS tipo, TABLE_ROWS AS linhas
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
        ORDER BY TABLE_NAME`,
      [base],
    );
    return rows.map((r) => ({
      schema: r.schema_nome,
      nome: r.tabela,
      tipo: String(r.tipo || '').includes('VIEW') ? 'view' : 'table',
      linhas: r.linhas === null ? null : Number(r.linhas),
    }));
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function listColumns(cfg, schema, tabela) {
  const base = schema || cfg.database;
  const conn = await conectar(cfg);
  try {
    const [rows] = await conn.query(
      `SELECT COLUMN_NAME AS nome, COLUMN_TYPE AS tipo, IS_NULLABLE AS nulo, COLUMN_KEY AS chave,
              COLUMN_COMMENT AS comentario
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION`,
      [base, tabela],
    );
    return rows.map((r) => ({
      nome: r.nome,
      tipo: r.tipo,
      nulo: r.nulo === 'YES',
      chave: r.chave || '',
      comentario: r.comentario || '',
    }));
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function query(cfg, spec) {
  const { sql, params } = buildSelect({ ...spec, kind: 'mysql' });
  const conn = await conectar(cfg);
  const inicio = Date.now();
  try {
    const [rows, fields] = await Promise.race([
      conn.query({ sql, values: params, timeout: QUERY_TIMEOUT_MS }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Consulta excedeu o tempo limite.')), QUERY_TIMEOUT_MS + 5000)),
    ]);
    const colunas = (fields || []).map((f) => f.name);
    return { sql, colunas, linhas: rows, ms: Date.now() - inicio };
  } finally {
    await conn.end().catch(() => {});
  }
}

export async function count(cfg, spec) {
  const { sql, params } = buildCount({ ...spec, kind: 'mysql' });
  const conn = await conectar(cfg);
  try {
    const [rows] = await conn.query(sql, params);
    return Number(rows[0]?.total ?? rows[0]?.TOTAL ?? 0);
  } finally {
    await conn.end().catch(() => {});
  }
}
