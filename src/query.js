// Montagem de SQL seguro por dialeto (identificadores citados, valores parametrizados).
//
// Suporta relacionamento (LEFT JOIN) e filtros sobre colunas da tabela relacionada.
//   spec.select  = [{ alias, column, table }]      table null/'t0' = tabela principal
//   spec.joins   = [{ alias, schema, table, left, right }]
//   spec.filters = [{ table, column, op, value, value2 }]

export const DIALECTS = {
  mysql: { quote: '`', close: '`', param: () => '?', limit: 'LIMIT', first: false },
  mariadb: { quote: '`', close: '`', param: () => '?', limit: 'LIMIT', first: false },
  postgres: { quote: '"', close: '"', param: (i) => `$${i}`, limit: 'LIMIT', first: false },
  firebird: { quote: '"', close: '"', param: () => '?', limit: null, first: true },
};

export const PRINCIPAL = 't0';

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

/** Date/timestamp no formato aceito pelos quatro bancos. */
export function normalizarValor(coluna, valor) {
  if (valor === null || valor === undefined) return valor;
  const s = String(valor).trim();
  // datetime-local do navegador: 2026-11-20T14:30
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s.replace('T', ' ') + ':00';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.replace('T', ' ');
  return s;
}

function montarFrom(kind, spec) {
  const schema = spec.schema;
  const table = spec.table;
  const from = `${quoteTable(kind, schema, table)} AS ${PRINCIPAL}`;
  const joins = (spec.joins || []).slice(0, 4);
  const partes = [from];

  joins.forEach((j, i) => {
    if (!j || !j.table || !j.left || !j.right) return;
    const alias = String(j.alias || `j${i + 1}`).replace(/[^\w]/g, '');
    const alvo = quoteTable(kind, j.schema, j.table);
    const esq = quoteIdent(kind, j.left);
    const dir = quoteIdent(kind, j.right);
    partes.push(`LEFT JOIN ${alvo} AS ${alias} ON ${alias}.${dir} = ${PRINCIPAL}.${esq}`);
  });

  return partes.join(' ');
}

/** Expressao "alias.coluna" citada corretamente. */
export function refColuna(kind, tabela, coluna) {
  const alias = !tabela || tabela === 'principal' ? PRINCIPAL : String(tabela);
  if (!/^[A-Za-z_][\w]*$/.test(alias)) throw new Error(`Alias invalido: ${alias}`);
  return `${alias}.${quoteIdent(kind, coluna)}`;
}

function condicoes(kind, spec, addParam) {
  const where = [];
  for (const f of spec.filters || []) {
    if (!f || !f.column) continue;
    const col = refColuna(kind, f.table, f.column);
    const op = String(f.op || 'eq');

    if (op === 'null') { where.push(`${col} IS NULL`); continue; }
    if (op === 'notnull') { where.push(`${col} IS NOT NULL`); continue; }

    if (op === 'in') {
      const lista = (Array.isArray(f.value) ? f.value : String(f.value ?? '').split(','))
        .map((v) => String(v).trim()).filter(Boolean);
      if (!lista.length) continue;
      where.push(`${col} IN (${lista.map((v) => addParam(v)).join(', ')})`);
      continue;
    }

    if (op === 'between') {
      const de = normalizarValor(f.column, f.value);
      const ate = normalizarValor(f.column, f.value2);
      if (de === '' || ate === '' || de === null || ate === null) continue;
      where.push(`${col} BETWEEN ${addParam(de)} AND ${addParam(ate)}`);
      continue;
    }

    if (!(op in OPERADORES)) throw new Error(`Operador invalido: ${op}`);

    let valor = normalizarValor(f.column, f.value);
    if (op === 'like' || op === 'notlike') valor = `%${valor ?? ''}%`;
    else if (op === 'starts') valor = `${valor ?? ''}%`;
    else if (op === 'ends') valor = `%${valor ?? ''}`;
    where.push(`${col} ${OPERADORES[op]} ${addParam(valor)}`);
  }
  return where;
}

function colunasSelect(kind, spec) {
  if (Array.isArray(spec.select) && spec.select.length) {
    return spec.select
      .filter((s) => s && s.column)
      .map((s) => `${refColuna(kind, s.table, s.column)} AS ${quoteIdent(kind, s.alias || s.column)}`)
      .join(', ');
  }
  if (Array.isArray(spec.columns) && spec.columns.length) {
    return spec.columns
      .map((c) => `${PRINCIPAL}.${quoteIdent(kind, c)} AS ${quoteIdent(kind, c)}`)
      .join(', ');
  }
  return `${PRINCIPAL}.*`;
}

/** Monta o SELECT respeitando joins, filtros e dialeto. */
export function buildSelect(spec) {
  const { kind } = spec;
  const d = dialect(kind);
  const params = [];
  const addParam = (value) => { params.push(value); return d.param(params.length); };

  const selectSql = colunasSelect(kind, spec);
  const where = condicoes(kind, spec, addParam);
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';

  let order = '';
  if (spec.orderBy && spec.orderBy.column) {
    const dir = String(spec.orderBy.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    order = ` ORDER BY ${refColuna(kind, spec.orderBy.table, spec.orderBy.column)} ${dir}`;
  }

  const limit = Number(spec.limit) > 0 ? Math.floor(Number(spec.limit)) : 0;
  const from = montarFrom(kind, spec);

  if (d.first) {
    const first = limit ? `FIRST ${limit} ` : '';
    return { sql: `SELECT ${first}${selectSql} FROM ${from}${whereSql}${order}`, params };
  }

  const limitSql = limit && d.limit ? ` ${d.limit} ${limit}` : '';
  return { sql: `SELECT ${selectSql} FROM ${from}${whereSql}${order}${limitSql}`, params };
}

/** SELECT COUNT(*) com os mesmos joins e filtros. */
export function buildCount(spec) {
  const { kind } = spec;
  const d = dialect(kind);
  const params = [];
  const addParam = (value) => { params.push(value); return d.param(params.length); };
  const where = condicoes(kind, spec, addParam);
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  return {
    sql: `SELECT COUNT(*) AS total FROM ${montarFrom(kind, spec)}${whereSql}`,
    params,
  };
}
