// Rotas das conexoes de banco.
import { route, HttpError } from '../web.js';
import { all, get, run, nowIso } from '../db.js';
import { encrypt, decrypt } from '../crypto.js';
import { driver, BANCOS } from '../drivers/index.js';

function paraPublico(row) {
  if (!row) return null;
  return {
    id: row.id,
    nome: row.name,
    kind: row.kind,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    temSenha: Boolean(row.password_enc),
    options: safeJson(row.options),
    criadoEm: row.created_at,
    atualizadoEm: row.updated_at,
  };
}

function safeJson(txt) {
  try { return JSON.parse(txt || '{}'); } catch { return {}; }
}

/** Monta o cfg do driver: usa a senha enviada ou a guardada. */
function montarCfg(body, id) {
  const salvo = id ? get('SELECT * FROM connections WHERE id = ?', id) : null;
  if (id && !salvo) throw new HttpError(404, 'Conexao nao encontrada.');

  const kind = String(body.kind || salvo?.kind || '').toLowerCase();
  if (!['mysql', 'mariadb', 'postgres', 'firebird'].includes(kind)) {
    throw new HttpError(400, 'Informe um tipo de banco valido.');
  }
  const def = driver(kind);

  const senha = body.senha !== undefined && body.senha !== ''
    ? String(body.senha)
    : (salvo?.password_enc ? decrypt(salvo.password_enc) : '');

  return {
    id: id || null,
    kind,
    host: String(body.host ?? salvo?.host ?? '').trim() || 'localhost',
    port: Number(body.porta ?? body.port ?? salvo?.port ?? def.defaultPort) || def.defaultPort,
    database: String(body.base ?? body.database ?? salvo?.database ?? '').trim(),
    username: String(body.usuario ?? body.username ?? salvo?.username ?? '').trim(),
    password: senha,
    options: body.options && typeof body.options === 'object'
      ? body.options
      : safeJson(salvo?.options),
  };
}

function validar(cfg) {
  if (!cfg.database) throw new HttpError(400, cfg.kind === 'firebird'
    ? 'Informe o caminho do arquivo .fdb no servidor Firebird.'
    : 'Informe o nome da base de dados.');
  if (!cfg.username) throw new HttpError(400, 'Informe o usuario do banco.');
}

export function registrar() {
  route('GET', '/api/bancos', async () => ({ bancos: BANCOS }));

  route('GET', '/api/conexoes', async () => {
    const rows = all('SELECT * FROM connections ORDER BY name').map(paraPublico);
    return { conexoes: rows };
  });

  route('POST', '/api/conexoes', async (ctx) => {
    const cfg = montarCfg(ctx.body);
    validar(cfg);
    const agora = nowIso();
    const { lastId } = run(
      `INSERT INTO connections (name, kind, host, port, database, username, password_enc, options, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      String(ctx.body.nome || '').trim() || `${driver(cfg.kind).label} ${cfg.host}`,
      cfg.kind, cfg.host, cfg.port, cfg.database, cfg.username,
      encrypt(cfg.password), JSON.stringify(cfg.options || {}), agora,
    );
    return { ok: true, id: lastId, conexao: paraPublico(get('SELECT * FROM connections WHERE id = ?', lastId)) };
  });

  route('PUT', '/api/conexoes/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const cfg = montarCfg(ctx.body, id);
    validar(cfg);
    run(
      `UPDATE connections SET name=?, kind=?, host=?, port=?, database=?, username=?,
              password_enc=?, options=?, updated_at=? WHERE id=?`,
      String(ctx.body.nome || '').trim() || `${driver(cfg.kind).label} ${cfg.host}`,
      cfg.kind, cfg.host, cfg.port, cfg.database, cfg.username,
      encrypt(cfg.password), JSON.stringify(cfg.options || {}), nowIso(), id,
    );
    return { ok: true, conexao: paraPublico(get('SELECT * FROM connections WHERE id = ?', id)) };
  });

  route('DELETE', '/api/conexoes/:id', async (ctx) => {
    const id = Number(ctx.params.id);
    const alvo = get('SELECT * FROM connections WHERE id = ?', id);
    if (!alvo) throw new HttpError(404, 'Conexao nao encontrada.');
    run('DELETE FROM connections WHERE id = ?', id);
    return { ok: true };
  });

  route('POST', '/api/conexoes/:id/testar', async (ctx) => {
    const id = Number(ctx.params.id);
    const cfg = montarCfg(ctx.body || {}, id);
    validar(cfg);
    const inicio = Date.now();
    const info = await driver(cfg.kind).test(cfg);
    return { ok: true, ...info, ms: Date.now() - inicio };
  });

  // Testa credenciais antes de salvar
  route('POST', '/api/conexoes/testar', async (ctx) => {
    const cfg = montarCfg(ctx.body || {});
    validar(cfg);
    const inicio = Date.now();
    const info = await driver(cfg.kind).test(cfg);
    return { ok: true, ...info, ms: Date.now() - inicio };
  });

  route('GET', '/api/conexoes/:id/schemas', async (ctx) => {
    const id = Number(ctx.params.id);
    const cfg = montarCfg({}, id);
    const schemas = await driver(cfg.kind).listSchemas(cfg);
    return { schemas };
  });

  route('GET', '/api/conexoes/:id/tabelas', async (ctx) => {
    const id = Number(ctx.params.id);
    const cfg = montarCfg({}, id);
    const schema = ctx.url.searchParams.get('schema') || undefined;
    const tabelas = await driver(cfg.kind).listTables(cfg, { schema });
    return { tabelas, total: tabelas.length };
  });

  route('GET', '/api/conexoes/:id/colunas', async (ctx) => {
    const id = Number(ctx.params.id);
    const cfg = montarCfg({}, id);
    const schema = ctx.url.searchParams.get('schema') || undefined;
    const tabela = ctx.url.searchParams.get('tabela');
    if (!tabela) throw new HttpError(400, 'Informe a tabela.');
    const colunas = await driver(cfg.kind).listColumns(cfg, schema, tabela);
    return { colunas };
  });
}
