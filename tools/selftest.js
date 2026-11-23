// Autoteste ponta a ponta. Requer o servidor rodando.
//
//   node tools/selftest.js
//
// Para testar contra um banco real, informe as variaveis:
//   TEST_KIND=mysql TEST_HOST=10.0.1.67 TEST_PORT=3307 TEST_DB=z_prod \
//   TEST_USER=z_mat TEST_PASS=z2025 TEST_TABLE=item node tools/selftest.js
import zlib from 'node:zlib';
import { buildSelect, buildCount } from '../src/query.js';

const BASE = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 8790}`;

const cfg = {
  kind: process.env.TEST_KIND || '',
  host: process.env.TEST_HOST || '',
  porta: Number(process.env.TEST_PORT || 0) || undefined,
  base: process.env.TEST_DB || '',
  usuario: process.env.TEST_USER || '',
  senha: process.env.TEST_PASS || '',
  tabela: process.env.TEST_TABLE || '',
};

let falhas = 0;
let testes = 0;

function ok(nome, condicao, detalhe = '') {
  testes += 1;
  if (condicao) {
    console.log(`  ok   ${nome}`);
  } else {
    falhas += 1;
    console.log(`  FALHOU ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** Testes do gerador de SQL (sem banco): join entre tabelas, encadeamento e filtros de data. */
function testarSql() {
  const spec = {
    kind: 'mysql',
    table: 'item',
    select: [
      { alias: 't0_Id', column: 'Id', table: 't0' },
      { alias: 't1_Descricao', column: 'Descricao', table: 't1' },
    ],
    joins: [{ alias: 't1', de: 't0', table: 'fabricante', left: 'IdFabricante', right: 'Id' }],
    filters: [
      { table: 't1', column: 'Descricao', op: 'eq', value: 'FERTAK' },
      { table: 't0', column: 'DtMovto', op: 'between', value: '2024-09-01', value2: '2024-12-31' },
    ],
    orderBy: { table: 't0', column: 'Id', dir: 'desc' },
    limit: 10,
  };

  const my = buildSelect(spec);
  ok('sql mysql: LEFT JOIN', my.sql.includes('LEFT JOIN `fabricante` AS t1 ON t1.`Id` = t0.`IdFabricante`'), my.sql);
  ok('sql mysql: filtro na tabela relacionada', my.sql.includes('t1.`Descricao` = ?'));
  ok('sql mysql: filtro entre datas', my.sql.includes('BETWEEN ? AND ?'));
  ok('sql mysql: ordenacao e limite', /ORDER BY t0\.`Id` DESC LIMIT 10$/.test(my.sql), my.sql);
  ok('sql mysql: 3 parametros', my.params.length === 3, String(my.params.length));

  const pg = buildSelect({ ...spec, kind: 'postgres' });
  ok('sql postgres: placeholders $1/$2/$3', pg.sql.includes('$1') && pg.sql.includes('$3') && !pg.sql.includes('?'));

  const fb = buildSelect({ ...spec, kind: 'firebird' });
  ok('sql firebird: FIRST 10', fb.sql.startsWith('SELECT FIRST 10 '), fb.sql.slice(0, 40));
  ok('sql firebird: aspas duplas', fb.sql.includes('"fabricante"'));

  const count = buildCount(spec);
  ok('sql count com join', count.sql.startsWith('SELECT COUNT(*)') && count.sql.includes('LEFT JOIN'));

  const semJoin = buildSelect({ kind: 'mysql', table: 'x', columns: ['a', 'b'], filters: [], limit: 0 });
  ok('sql sem join (compativel)', semJoin.sql === 'SELECT t0.`a` AS `a`, t0.`b` AS `b` FROM `x` AS t0', semJoin.sql);

  // tres tabelas: item -> fabricante -> pais
  const cadeia = buildSelect({
    kind: 'mysql',
    table: 'item',
    select: [
      { alias: 'a', column: 'Id', table: 't0' },
      { alias: 'b', column: 'Descricao', table: 't1' },
      { alias: 'c', column: 'Nome', table: 't2' },
    ],
    joins: [
      { alias: 't1', de: 't0', table: 'fabricante', left: 'IdFabricante', right: 'Id' },
      { alias: 't2', de: 't1', table: 'pais', left: 'IdPais', right: 'Id' },
    ],
  });
  ok('sql encadeado t0 -> t1 -> t2',
    cadeia.sql.includes('LEFT JOIN `pais` AS t2 ON t2.`Id` = t1.`IdPais`'), cadeia.sql);

  let erroClaro = false;
  try {
    buildSelect({ kind: 'mysql', table: 'item', select: [{ alias: 'x', column: 'Id', table: 't9' }], joins: [{ alias: 't9', de: 'inexistente', table: 'x', left: 'a', right: 'b' }] });
  } catch (e) {
    erroClaro = /ainda nao foi adicionada/i.test(e.message);
  }
  ok('sql join invalido gera erro claro', erroClaro);
}

async function api(caminho, opcoes = {}) {  const resp = await fetch(BASE + caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });
  const tipo = resp.headers.get('content-type') || '';
  if (tipo.includes('application/json')) {
    const dados = await resp.json();
    if (!resp.ok) throw new Error(dados.erro || `HTTP ${resp.status}`);
    return dados;
  }
  return { buffer: Buffer.from(await resp.arrayBuffer()), status: resp.status };
}

async function main() {
  console.log(`\nPuxador de Dados — autoteste (${BASE})\n`);

  testarSql();

  const saude = await api('/api/health');
  ok('servidor responde /api/health', saude.ok === true);

  const catalogo = await api('/api/catalogo');
  ok('catalogo de formatos', Array.isArray(catalogo.formatos) && catalogo.formatos.length >= 10);

  const { bancos } = await api('/api/bancos');
  const kinds = bancos.map((b) => b.kind);
  ok('quatro bancos suportados', ['mysql', 'mariadb', 'postgres', 'firebird'].every((k) => kinds.includes(k)), kinds.join(','));

  const html = await api('/');
  ok('index.html servido', html.buffer.includes('Puxador de Dados'));

  // CRUD de conexao sempre roda (com dados ficticios se nao houver banco real)
  const exemplo = {
    nome: 'Autoteste',
    kind: cfg.kind || 'mysql',
    host: cfg.host || '127.0.0.1',
    porta: cfg.porta || 3306,
    base: cfg.base || 'teste',
    usuario: cfg.usuario || 'usuario',
    senha: cfg.senha || 'senha',
  };

  const criada = await api('/api/conexoes', { method: 'POST', body: exemplo });
  ok('cria conexao', criada.ok && criada.id > 0);

  const lista = await api('/api/conexoes');
  const salva = lista.conexoes.find((c) => c.id === criada.id);
  ok('lista conexao sem expor senha', Boolean(salva) && salva.temSenha === true && !JSON.stringify(salva).includes('"senha"'));

  const editada = await api(`/api/conexoes/${criada.id}`, { method: 'PUT', body: { ...exemplo, nome: 'Autoteste 2' } });
  ok('edita conexao', editada.conexao.nome === 'Autoteste 2');

  // Fluxo real de dados
  if (cfg.host && cfg.base && cfg.tabela) {
    console.log('\n  -- teste real de dados --');
    const teste = await api(`/api/conexoes/${criada.id}/testar`, { method: 'POST', body: {} });
    ok('conecta no banco', Boolean(teste.versao), JSON.stringify(teste));

    const tabelas = await api(`/api/conexoes/${criada.id}/tabelas`);
    ok('lista tabelas', tabelas.tabelas.some((t) => t.nome === cfg.tabela), `${tabelas.tabelas.length} tabelas`);

    const cols = await api(`/api/conexoes/${criada.id}/colunas?tabela=${encodeURIComponent(cfg.tabela)}`);
    ok('lista colunas', cols.colunas.length > 0, `${cols.colunas.length} colunas`);

    const primeiras = cols.colunas.slice(0, 3).map((c, i) => ({
      origem: c.nome,
      destino: ['cod produto', 'descricao', 'valor'][i] || c.nome,
      formato: i === 2 ? 'moeda' : 'texto',
    }));

    const puxado = await api('/api/puxar', {
      method: 'POST',
      body: {
        conexaoId: criada.id,
        tabela: cfg.tabela,
        colunas: primeiras.map((p) => p.origem),
        mapeamento: primeiras,
        limite: 10,
      },
    });
    ok('puxa dados', puxado.linhas.length > 0, `${puxado.linhas.length} linhas`);
    ok('aplica nome de destino', puxado.colunas[0].destino === 'cod produto');
    ok('consulta gerada', typeof puxado.sql === 'string' && puxado.sql.startsWith('SELECT'));

    const contagem = await api('/api/puxar/contar', {
      method: 'POST',
      body: { conexaoId: criada.id, tabela: cfg.tabela, colunas: primeiras.map((p) => p.origem) },
    });
    ok('conta registros', contagem.total >= puxado.linhas.length, `total=${contagem.total}`);

    const xlsx = await api('/api/exportar', {
      method: 'POST',
      body: {
        conexaoId: criada.id,
        tabela: cfg.tabela,
        colunas: primeiras.map((p) => p.origem),
        mapeamento: primeiras,
        limite: 10,
        formato: 'xlsx',
      },
    });
    ok('exporta xlsx (assinatura PK)', xlsx.buffer[0] === 0x50 && xlsx.buffer[1] === 0x4b, `${xlsx.buffer.length} bytes`);

    const csv = await api('/api/exportar', {
      method: 'POST',
      body: {
        conexaoId: criada.id,
        tabela: cfg.tabela,
        colunas: primeiras.map((p) => p.origem),
        mapeamento: primeiras,
        limite: 10,
        formato: 'csv',
      },
    });
    ok('exporta csv com cabecalho', csv.buffer.toString('utf8').includes('cod produto'));

    const pdf = await api('/api/exportar', {
      method: 'POST',
      body: {
        conexaoId: criada.id,
        tabela: cfg.tabela,
        colunas: primeiras.map((p) => p.origem),
        mapeamento: primeiras,
        limite: 10,
        formato: 'pdf',
      },
    });
    const pdfTexto = pdf.buffer.toString('latin1');
    ok('exporta pdf (assinatura %PDF)', pdfTexto.startsWith('%PDF-1.4'), `${pdf.buffer.length} bytes`);
    ok('pdf tem paginas e fim', /\/Type \/Page/.test(pdfTexto) && pdfTexto.trimEnd().endsWith('%%EOF'));
  } else {
    console.log('\n  (teste de dados reais ignorado: defina TEST_HOST/TEST_DB/TEST_TABLE)');
  }

  const removida = await api(`/api/conexoes/${criada.id}`, { method: 'DELETE' });
  ok('exclui conexao', removida.ok === true);

  console.log(`\n${testes - falhas}/${testes} testes ok${falhas ? ' — ATENCAO: houve falhas' : ''}\n`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error('\nErro no autoteste:', err.message);
  process.exit(1);
});
