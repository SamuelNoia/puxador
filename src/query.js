// Montagem de SQL seguro por dialeto (identificadores citados, valores parametrizados).

export const DIALECTS = {
  mysql: { quote: '`', close: '`', param: () => '?', limit: 'LIMIT', first: false },
  mariadb: { quote: '`', close: '`', param: () => '?', limit: 'LIMIT', first: false },
  postgres: { quote: '"', close: '"', param: (i) => `$${i}`, limit: 'LIMIT', first: false },
  firebird: { quote: '"', close: '"', param: () => '?', limit: null, first: true },
};

export function dialect(kind) {
  const d = DIALECTS[kind];
  if (!d) throw new Error(`Banco nao suportado: ${kind}`);
  return d;
}

/** Cita um identificador. Recusa nomes com caracteres de controle. */
export function quoteIdent(kind, name) {
  const raw = String(name ?? '');
  if (!raw || /[\u0000-\u001f]/.test(raw)) throw new Error(`Identificador invalido: ${raw}`);
  const d = dialect(kind);
  const esc = raw.split(d.close).join(d.close + d.close);
  return `${d.quote}${esc}${d.close}`;
}

/** Sequencia schema.tabela respeitando o dialeto. */
export function quoteTable(kind, schema, table) {
  const t = quoteIdent(kind, table);
  if (!schema) return t;
  return `${quoteIdent(kind, schema)}.${t}`;
}

export const OPERADORES = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  notlike: 'NOT LIKE',
  starts: 'LIKE',
  ends: 'LIKE',
  null: 'IS NULL',
  notnull: 'IS NOT NULL',
  in: 'IN',
};

/**
 * Monta o SELECT.
 * spec: { kind, schema, table, columns:[nomes], filters:[{column, op, value}],
 *         orderBy:{column, dir}, limit }
 */
export function buildSelect(spec) {
  const { kind, schema, table } = spec;
  const d = dialect(kind);
  const cols = Array.isArray(spec.columns) && spec.columns.length
    ? spec.columns.map((c) => quoteIdent(kind, c)).join(', ')
    : '*';

  const params = [];
  const addParam = (value) => {
    params.push(value);
    return d.param(params.length);
  };

  const where = [];
  for (const f of spec.filters || []) {
    if (!f || !f.column) continue;
    const col = quoteIdent(kind, f.column);
    const op = String(f.op || 'eq');
    if (op === 'null') { where.push(`${col} IS NULL`); continue; }
    if (op === 'notnull') { where.push(`${col} IS NOT NULL`); continue; }
    if (!(op in OPERADORES)) throw new Error(`Operador invalido: ${op}`);

    if (op === 'in') {
      const lista = (Array.isArray(f.value) ? f.value : String(f.value ?? '').split(','))
        .map((v) => String(v).trim()).filter(Boolean);
      if (!lista.length) continue;
      where.push(`${col} IN (${lista.map((v) => addParam(v)).join(', ')})`);
      continue;
    }
    let valor = f.value;
    if (op === 'like' || op === 'notlike') valor = `%${valor ?? ''}%`;
    else if (op === 'starts') valor = `${valor ?? ''}%`;
    else if (op === 'ends') valor = `%${valor ?? ''}`;
    where.push(`${col} ${OPERADORES[op]} ${addParam(valor)}`);
  }

  let order = '';
  if (spec.orderBy && spec.orderBy.column) {
    const dir = String(spec.orderBy.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    order = ` ORDER BY ${quoteIdent(kind, spec.orderBy.column)} ${dir}`;
  }

  const limit = Number(spec.limit) > 0 ? Math.floor(Number(spec.limit)) : 0;
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  if (d.first) {
    // Firebird: SELECT FIRST n ... (compativel com 2.5 e 3+)
    const first = limit ? `FIRST ${limit} ` : '';
    return { sql: `SELECT ${first}${cols} FROM ${quoteTable(kind, schema, table)}${whereSql}${order}`, params };
  }

  const limitSql = limit && d.limit ? ` ${d.limit} ${limit}` : '';
  return { sql: `SELECT ${cols} FROM ${quoteTable(kind, schema, table)}${whereSql}${order}${limitSql}`, params };
}

/** SELECT COUNT(*) com os mesmos filtros. */
export function buildCount(spec) {
  const d = dialect(spec.kind);
  const params = [];
  const addParam = (value) => {
    params.push(value);
    return d.param(params.length);
  };
  const where = [];
  for (const f of spec.filters || []) {
    if (!f || !f.column) continue;
    const col = quoteIdent(spec.kind, f.column);
    const op = String(f.op || 'eq');
    if (op === 'null') { where.push(`${col} IS NULL`); continue; }
    if (op === 'notnull') { where.push(`${col} IS NOT NULL`); continue; }
    if (!(op in OPERADORES)) throw new Error(`Operador invalido: ${op}`);
    if (op === 'in') {
      const lista = (Array.isArray(f.value) ? f.value : String(f.value ?? '').split(','))
        .map((v) => String(v).trim()).filter(Boolean);
      if (!lista.length) continue;
      where.push(`${col} IN (${lista.map((v) => addParam(v)).join(', ')})`);
      continue;
    }
    let valor = f.value;
    if (op === 'like' || op === 'notlike') valor = `%${valor ?? ''}%`;
    else if (op === 'starts') valor = `${valor ?? ''}%`;
    else if (op === 'ends') valor = `%${valor ?? ''}`;
    where.push(`${col} ${OPERADORES[op]} ${addParam(valor)}`);
  }
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  return { sql: `SELECT COUNT(*) AS total FROM ${quoteTable(spec.kind, spec.schema, spec.table)}${whereSql}`, params };
}
