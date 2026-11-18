// Registro de drivers. Cada driver implementa a mesma interface:
//   test(cfg)                      -> { versao }
//   listSchemas(cfg)               -> [{ nome }]
//   listTables(cfg, {schema})      -> [{ schema, nome, tipo, linhas }]
//   listColumns(cfg, schema, nome) -> [{ nome, tipo, nulo, chave }]
//   query(cfg, spec)               -> { colunas, linhas, ms }
//   count(cfg, spec)               -> numero
import * as mysql from './mysql.js';
import * as postgres from './postgres.js';
import * as firebird from './firebird.js';

const DRIVERS = new Map([
  ['mysql', { ...mysql, kind: 'mysql', label: 'MySQL', defaultPort: 3306 }],
  ['mariadb', { ...mysql, kind: 'mariadb', label: 'MariaDB', defaultPort: 3306 }],
  ['postgres', { ...postgres, kind: 'postgres', label: 'PostgreSQL', defaultPort: 5432 }],
  ['firebird', { ...firebird, kind: 'firebird', label: 'Firebird', defaultPort: 3050 }],
]);

export const BANCOS = [...DRIVERS.values()].map((d) => ({
  kind: d.kind,
  label: d.label,
  defaultPort: d.defaultPort,
}));

export function driver(kind) {
  const d = DRIVERS.get(String(kind || '').toLowerCase());
  if (!d) throw new Error(`Banco nao suportado: ${kind}`);
  return d;
}

/** Normaliza uma linha para JSON (BigInt, Buffer, Date). */
export function limparValor(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return v;
}

export function limparLinha(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) out[k] = limparValor(v);
  return out;
}
