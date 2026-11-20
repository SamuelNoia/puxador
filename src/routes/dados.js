// Rotas de extracao: previa, contagem, exportacao e mapeamentos salvos.
import path from 'node:path';
import { route, HttpError, sendDownload } from '../web.js';
import { all, get, run, nowIso } from '../db.js';
import { decrypt } from '../crypto.js';
import { driver } from '../drivers/index.js';
import { aplicarFormato, sugerirFormato } from '../format.js';
import { gerarXlsx, gerarCsv } from '../export.js';
import { PREVIEW_LIMIT, MAX_ROWS } from '../config.js';
import { mensagemAmigavel } from '../errors.js';

function cfgDaConexao(id) {
  const row = get('SELECT * FROM connections WHERE id = ?', Number(id));
  if (!row) throw new HttpError(404, 'Conexao nao encontrada.');
  let options = {};
  try { options = JSON.parse(row.options || '{}'); } catch { /* ignore */ }
  return {
    id: row.id,
    kind: row.kind,
    host: row.host,
    port: row.port,
    database: row.database,
    username: row.username,
    password: decrypt(row.password_enc),
    options,
  };
}

function validarPull(body) {
  if (!body.conexaoId) throw new HttpError(400, 'Escolha uma conexao.');
  if (!body.tabela) throw new HttpError(400, 'Escolha uma tabela.');
}

/**
 * Monta o spec do driver.
 * juncoes: [{ tabela, esquema, esquerda, direita }]  (LEFT JOIN na tabela principal)
 * selecao: [{ alias, column, table }]                (table = null | 'j1' | 'j2')
 */
function montarSpec(cfg, body, limite) {
  const juncoes = (Array.isArray(body.juncoes) ? body.juncoes : [])
    .filter((j) => j && j.tabela && j.esquerda && j.direita)
    .slice(0, 6)
    .map((j, i) => ({
      // o front manda o alias (t1, t2...) e a origem (de) para permitir encadear tabelas
      alias: /^[A-Za-z_]\w*$/.test(String(j.alias || '')) ? String(j.alias) : `t${i + 1}`,
      de: /^[A-Za-z_]\w*$/.test(String(j.de || '')) ? String(j.de) : 't0',
      schema: j.esquema || undefined,
      table: j.tabela,
      left: j.esquerda,
      right: j.direita,
    }));

  const selecao = (Array.isArray(body.selecao) ? body.selecao : [])
    .filter((s) => s && s.column)
    .map((s) => ({
      alias: String(s.alias || s.column).replace(/[^\w]/g, '_'),
      column: s.column,
      table: s.table && s.table !== 'principal' ? s.table : null,
    }));

  const filtros = (Array.isArray(body.filtros) ? body.filtros : [])
    .filter((f) => f && f.column)
    .map((f) => ({
      table: f.table && f.table !== 'principal' ? f.table : null,
      column: f.column,
      op: f.op || 'eq',
      value: f.value,
      value2: f.value2,
    }));

  return {
    kind: cfg.kind,
    schema: body.schema || undefined,
    table: body.tabela,
    joins: juncoes,
    select: selecao,
    columns: (Array.isArray(body.colunas) ? body.colunas : []).filter(Boolean),
    filters: filtros,
    orderBy: body.ordem && body.ordem.column ? body.ordem : null,
    limit: limite,
  };
}

/** Nomes que virao nas linhas (alias do SELECT). */
function colunasResultado(spec, res) {
  if (spec.select.length) return spec.select.map((s) => s.alias);
  if (spec.columns.length) return spec.columns;
  return res.colunas;
}

function montarMapeamento(body, colunasBanco, tipos) {
  const enviado = Array.isArray(body.mapeamento) ? body.mapeamento.filter((m) => m && m.origem) : [];
  if (enviado.length) {
    return enviado.map((m) => ({
      origem: m.origem,
      destino: String(m.destino || m.origem),
      formato: m.formato || 'original',
      decimais: m.decimais === undefined || m.decimais === null || m.decimais === '' ? undefined : Number(m.decimais),
    }));
  }
  return colunasBanco.map((c) => ({
    origem: c,
    destino: c,
    formato: sugerirFormato(tipos?.[c] || ''),
  }));
}

function aplicarMapeamento(mapeamento, linhas) {
  return linhas.map((linha) => {
    const out = {};
    for (const m of mapeamento) {
      const bruto = Object.prototype.hasOwnProperty.call(linha, m.origem) ? linha[m.origem] : null;
      out[m.destino] = aplicarFormato(bruto, m.formato, m.decimais);
    }
    return out;
  });
}

export function registrar() {
  // Previa na tela de resultado
  route('POST', '/api/puxar', async (ctx) => {
    const body = ctx.body || {};
    validarPull(body);
    const cfg = cfgDaConexao(body.conexaoId);
    const drv = driver(cfg.kind);

    const pedido = Number(body.limite) > 0 ? Number(body.limite) : PREVIEW_LIMIT;
    const limite = Math.min(pedido, PREVIEW_LIMIT);
    const spec = montarSpec(cfg, body, limite);

    const tipos = {};
    for (const c of Array.isArray(body.tipos) ? body.tipos : []) {
      if (c && c.nome) tipos[c.nome] = c.tipo || '';
    }

    const res = await drv.query(cfg, spec).catch((e) => {
      throw new HttpError(400, mensagemAmigavel(cfg.kind, e));
    });
    const colunasBanco = colunasResultado(spec, res);
    const mapeamento = montarMapeamento(body, colunasBanco, tipos);
    const linhas = aplicarMapeamento(mapeamento, res.linhas);

    let total = null;
    try {
      total = await drv.count(cfg, spec);
    } catch { /* contagem e opcional */ }

    const truncado = total !== null && res.linhas.length < total;

    run(
      'INSERT INTO runs (connection_id, table_name, rows, duration_ms, status, message, created_at) VALUES (?,?,?,?,?,?,?)',
      cfg.id, spec.table, linhas.length, res.ms, 'ok', null, nowIso(),
    );

    return {
      ok: true,
      colunas: mapeamento.map((m) => ({ destino: m.destino, origem: m.origem, formato: m.formato })),
      linhas,
      quantidade: linhas.length,
      total,
      truncado,
      limite,
      ms: res.ms,
      sql: res.sql,
    };
  });

  // Contagem exata
  route('POST', '/api/puxar/contar', async (ctx) => {
    const body = ctx.body || {};
    validarPull(body);
    const cfg = cfgDaConexao(body.conexaoId);
    const spec = montarSpec(cfg, body, 0);
    const total = await driver(cfg.kind).count(cfg, spec).catch((e) => {
      throw new HttpError(400, mensagemAmigavel(cfg.kind, e));
    });
    return { ok: true, total };
  });

  // Exportacao (xlsx | csv)
  route('POST', '/api/exportar', async (ctx) => {
    const body = ctx.body || {};
    validarPull(body);
    if (!Array.isArray(body.mapeamento) || !body.mapeamento.length) {
      throw new HttpError(400, 'Mapeie ao menos uma coluna antes de exportar.');
    }
    const cfg = cfgDaConexao(body.conexaoId);
    const drv = driver(cfg.kind);
    const formato = body.formato === 'csv' ? 'csv' : 'xlsx';

    const pedido = Number(body.limite) > 0 ? Number(body.limite) : MAX_ROWS;
    const spec = montarSpec(cfg, body, Math.min(pedido, MAX_ROWS));

    const res = await drv.query(cfg, spec).catch((e) => {
      throw new HttpError(400, mensagemAmigavel(cfg.kind, e));
    });

    const mapeamento = body.mapeamento
      .filter((m) => m && m.origem)
      .map((m) => ({
        origem: m.origem,
        destino: String(m.destino || m.origem),
        formato: m.formato || 'original',
        decimais: m.decimais === undefined || m.decimais === null || m.decimais === '' ? undefined : Number(m.decimais),
      }));

    const linhas = aplicarMapeamento(mapeamento, res.linhas);
    const carimbo = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const base = path.basename(String(body.arquivo || body.tabela || 'dados')).replace(/[^\w.-]+/g, '_');

    if (formato === 'csv') {
      sendDownload(ctx.res, gerarCsv({ mapeamento, linhas }), `${base}_${carimbo}.csv`, 'text/csv; charset=utf-8');
    } else {
      sendDownload(
        ctx.res,
        gerarXlsx({ titulo: String(body.titulo || body.tabela || 'Dados'), mapeamento, linhas }),
        `${base}_${carimbo}.xlsx`,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    }

    run(
      'INSERT INTO runs (connection_id, table_name, rows, duration_ms, status, message, created_at) VALUES (?,?,?,?,?,?,?)',
      cfg.id, spec.table, linhas.length, res.ms, 'ok', `export ${formato}`, nowIso(),
    );
    return { handled: true };
  });

  // Mapeamentos salvos
  route('GET', '/api/mapeamentos', async (ctx) => {
    const conexaoId = Number(ctx.url.searchParams.get('conexao') || 0);
    const rows = conexaoId
      ? all('SELECT * FROM mappings WHERE connection_id = ? ORDER BY name', conexaoId)
      : all('SELECT * FROM mappings ORDER BY name');
    return {
      mapeamentos: rows.map((r) => ({
        id: r.id,
        conexaoId: r.connection_id,
        nome: r.name,
        schema: r.schema_name,
        tabela: r.table_name,
        config: (() => { try { return JSON.parse(r.config); } catch { return {}; } })(),
        atualizadoEm: r.updated_at,
      })),
    };
  });

  route('POST', '/api/mapeamentos', async (ctx) => {
    const body = ctx.body || {};
    if (!body.conexaoId || !body.tabela || !body.nome) {
      throw new HttpError(400, 'Informe nome, conexao e tabela do mapeamento.');
    }
    if (!get('SELECT id FROM connections WHERE id = ?', Number(body.conexaoId))) {
      throw new HttpError(404, 'Conexao nao encontrada.');
    }
    const { lastId } = run(
      `INSERT INTO mappings (connection_id, name, schema_name, table_name, config, created_at)
       VALUES (?,?,?,?,?,?)`,
      Number(body.conexaoId), String(body.nome), body.schema || null, String(body.tabela),
      JSON.stringify(body.config || {}), nowIso(),
    );
    return { ok: true, id: lastId };
  });

  route('DELETE', '/api/mapeamentos/:id', async (ctx) => {
    run('DELETE FROM mappings WHERE id = ?', Number(ctx.params.id));
    return { ok: true };
  });

  route('GET', '/api/historico', async () => {
    const rows = all(`SELECT r.*, c.name AS conexao FROM runs r
                        LEFT JOIN connections c ON c.id = r.connection_id
                       ORDER BY r.id DESC LIMIT 40`);
    return {
      historico: rows.map((r) => ({
        id: r.id,
        conexao: r.conexao || '-',
        tabela: r.table_name,
        linhas: r.rows,
        ms: r.duration_ms,
        status: r.status,
        mensagem: r.message,
        quando: r.created_at,
      })),
    };
  });

  route('POST', '/api/formatos/amostra', async (ctx) => {
    const body = ctx.body || {};
    const valor = body.valor ?? '';
    return { resultado: aplicarFormato(valor, body.formato || 'original', body.decimais) };
  });
}
