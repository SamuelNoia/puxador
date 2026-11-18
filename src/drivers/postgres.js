// Driver PostgreSQL (pacote pg).
import pg from 'pg';
import { buildSelect, buildCount } from '../query.js';
import { QUERY_TIMEOUT_MS } from '../config.js';

const { Client } = pg;

function opcoes(cfg) {
  const options = cfg.options || {};
  return {
    host: cfg.host,
    port: Number(cfg.port) || 5432,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database || undefined,
    connectionTimeoutMillis: 15000,
    statement_timeout: QUERY_TIMEOUT_MS,
    ssl: options.ssl ? { rejectUnauthorized: false } : undefined,
    application_name: 'Puxador de Dados',
  };
}

async function conectar(cfg) {
  const client = new Client(opcoes(cfg));
  await client.connect();
  return client;
}

export async function test(cfg) {
  const client = await conectar(cfg);
  try {
    const r = await client.query('SELECT version() AS versao, current_database() AS base');
    return { versao: r.rows[0]?.versao || '', base: r.rows[0]?.base || '', kind: cfg.kind };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function listSchemas(cfg) {
  const client = await conectar(cfg);
  try {
    const r = await client.query(
      `SELECT schema_name FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
        ORDER BY schema_name`,
    );
    return r.rows.map((x) => ({ nome: x.schema_name }));
  } finally {
    await client.end().catch(() => {});
  }
}

export async function listTables(cfg, { schema } = {}) {
  const esquema = schema || (cfg.options && cfg.options.schema) || 'public';
  const client = await conectar(cfg);
  try {
    const r = await client.query(
      `SELECT t.table_schema AS schema_nome,
              t.table_name   AS tabela,
              t.table_type   AS tipo,
              c.reltuples::bigint AS linhas
         FROM information_schema.tables t
         LEFT JOIN pg_class c ON c.relname = t.table_name
         LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
        WHERE t.table_schema = $1
          AND t.table_type IN ('BASE TABLE','VIEW')
        ORDER BY t.table_name`,
      [esquema],
    );
    return r.rows.map((x) => ({
      schema: x.schema_nome,
      nome: x.tabela,
      tipo: x.tipo === 'VIEW' ? 'view' : 'table',
      linhas: x.linhas === null ? null : Number(x.linhas),
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

export async function listColumns(cfg, schema, tabela) {
  const esquema = schema || (cfg.options && cfg.options.schema) || 'public';
  const client = await conectar(cfg);
  try {
    const r = await client.query(
      `SELECT c.column_name AS nome, c.data_type AS tipo, c.is_nullable AS nulo,
              COALESCE((
                SELECT 'PRI' FROM information_schema.table_constraints tc
                  JOIN information_schema.key_column_usage k
                    ON k.constraint_name = tc.constraint_name
                   AND k.table_schema = tc.table_schema
                   AND k.table_name = tc.table_name
                 WHERE tc.constraint_type = 'PRIMARY KEY'
                   AND tc.table_schema = c.table_schema
                   AND tc.table_name = c.table_name
                   AND k.column_name = c.column_name
                 LIMIT 1), '') AS chave
         FROM information_schema.columns c
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position`,
      [esquema, tabela],
    );
    return r.rows.map((x) => ({
      nome: x.nome,
      tipo: x.tipo,
      nulo: x.nulo === 'YES',
      chave: x.chave || '',
      comentario: '',
    }));
  } finally {
    await client.end().catch(() => {});
  }
}

export async function query(cfg, spec) {
  const { sql, params } = buildSelect({ ...spec, kind: 'postgres' });
  const client = await conectar(cfg);
  const inicio = Date.now();
  try {
    const r = await client.query(sql, params);
    return { sql, colunas: r.fields.map((f) => f.name), linhas: r.rows, ms: Date.now() - inicio };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function count(cfg, spec) {
  const { sql, params } = buildCount({ ...spec, kind: 'postgres' });
  const client = await conectar(cfg);
  try {
    const r = await client.query(sql, params);
    return Number(r.rows[0]?.total ?? 0);
  } finally {
    await client.end().catch(() => {});
  }
}
