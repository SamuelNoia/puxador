// Driver Firebird (pacote node-firebird). Suporta 2.5, 3.0 e 4.0.
// Atencao: no Firebird o campo "database" e o caminho do arquivo .fdb no servidor.
import Firebird from 'node-firebird';
import { buildSelect, buildCount } from '../query.js';
import { QUERY_TIMEOUT_MS } from '../config.js';

function opcoes(cfg) {
  const options = cfg.options || {};
  return {
    host: cfg.host,
    port: Number(cfg.port) || 3050,
    database: cfg.database,
    user: cfg.username,
    password: cfg.password,
    role: options.role || null,
    pageSize: Number(options.pageSize) || 4096,
    lowercase_keys: false,
    retryConnectionOnFail: false,
    blobAsText: true,
    charset: options.charset || 'UTF8',
    wireCrypt: true,
  };
}

function attach(cfg) {
  return new Promise((resolve, reject) => {
    Firebird.attach(opcoes(cfg), (err, db) => (err ? reject(err) : resolve(db)));
  });
}

function detach(db) {
  return new Promise((resolve) => {
    try { db.detach(() => resolve()); } catch { resolve(); }
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Consulta excedeu o tempo limite.')), QUERY_TIMEOUT_MS);
    db.query(sql, params, (err, result) => {
      clearTimeout(timer);
      if (err) reject(err); else resolve(result || []);
    });
  });
}

export async function test(cfg) {
  const db = await attach(cfg);
  try {
    const rows = await run(db, 'SELECT rdb$get_context(\'SYSTEM\', \'ENGINE_VERSION\') AS versao FROM rdb$database');
    return { versao: String(rows[0]?.VERSAO || rows[0]?.versao || ''), base: cfg.database, kind: cfg.kind };
  } finally {
    await detach(db);
  }
}

export async function listSchemas() {
  // Firebird nao tem schemas de usuario; devolve vazio (a UI esconde o campo).
  return [];
}

export async function listTables(cfg) {
  const db = await attach(cfg);
  try {
    const rows = await run(db, `SELECT TRIM(r.RDB$RELATION_NAME) AS NOME,
                                       r.RDB$VIEW_BLR AS VIEW_BLR
                                  FROM RDB$RELATIONS r
                                 WHERE COALESCE(r.RDB$SYSTEM_FLAG, 0) = 0
                                 ORDER BY 1`);
    return rows.map((x) => ({
      schema: null,
      nome: String(x.NOME || x.nome || '').trim(),
      tipo: (x.VIEW_BLR ?? x.view_blr) === null ? 'table' : 'view',
      linhas: null,
    }));
  } finally {
    await detach(db);
  }
}

const TIPOS_FB = {
  7: 'SMALLINT', 8: 'INTEGER', 9: 'QUAD', 10: 'FLOAT', 11: 'D_FLOAT', 12: 'DATE',
  13: 'TIME', 14: 'CHAR', 16: 'BIGINT', 27: 'DOUBLE', 35: 'TIMESTAMP', 37: 'VARCHAR',
  40: 'CSTRING', 45: 'BLOB_ID', 261: 'BLOB',
};

export async function listColumns(cfg, schema, tabela) {
  const db = await attach(cfg);
  try {
    const rows = await run(
      db,
      `SELECT TRIM(rf.RDB$FIELD_NAME) AS NOME,
              f.RDB$FIELD_TYPE AS TIPO_NUM,
              f.RDB$FIELD_SUB_TYPE AS SUBTIPO,
              f.RDB$FIELD_LENGTH AS TAMANHO,
              f.RDB$FIELD_PRECISION AS PRECISAO,
              f.RDB$FIELD_SCALE AS ESCALA,
              rf.RDB$NULL_FLAG AS OBRIGATORIO,
              rf.RDB$FIELD_POSITION AS POSICAO
         FROM RDB$RELATION_FIELDS rf
         JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
        WHERE rf.RDB$RELATION_NAME = ?
        ORDER BY rf.RDB$FIELD_POSITION`,
      [String(tabela).toUpperCase()],
    );
    return rows.map((x) => {
      const tipoNum = Number(x.TIPO_NUM ?? x.tipo_num);
      let tipo = TIPOS_FB[tipoNum] || 'TEXT';
      const escala = Number(x.ESCALA ?? x.escala ?? 0);
      if ((tipoNum === 7 || tipoNum === 8 || tipoNum === 16) && escala < 0) {
        tipo = `NUMERIC(${Math.abs(escala)})`;
      }
      return {
        nome: String(x.NOME || x.nome || '').trim(),
        tipo,
        nulo: Number(x.OBRIGATORIO ?? x.obrigatorio ?? 0) !== 1,
        chave: '',
        comentario: '',
      };
    });
  } finally {
    await detach(db);
  }
}

export async function query(cfg, spec) {
  const { sql, params } = buildSelect({ ...spec, kind: 'firebird' });
  const db = await attach(cfg);
  const inicio = Date.now();
  try {
    const rows = await run(db, sql, params);
    const colunas = rows.length ? Object.keys(rows[0]).map((k) => k.toUpperCase()) : [];
    const normalizadas = rows.map((r) => {
      const out = {};
      for (const [k, v] of Object.entries(r)) out[k.toUpperCase()] = v;
      return out;
    });
    return { sql, colunas, linhas: normalizadas, ms: Date.now() - inicio };
  } finally {
    await detach(db);
  }
}

export async function count(cfg, spec) {
  const { sql, params } = buildCount({ ...spec, kind: 'firebird' });
  const db = await attach(cfg);
  try {
    const rows = await run(db, sql, params);
    const linha = rows[0] || {};
    return Number(linha.TOTAL ?? linha.total ?? 0);
  } finally {
    await detach(db);
  }
}
