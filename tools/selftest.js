// Autoteste ponta a ponta. Requer o servidor rodando.
//
//   node tools/selftest.js
//
// Para testar contra um banco real, informe as variaveis:
//   TEST_KIND=mysql TEST_HOST=10.0.1.67 TEST_PORT=3307 TEST_DB=z_prod \
//   TEST_USER=z_mat TEST_PASS=z2025 TEST_TABLE=item node tools/selftest.js
import zlib from 'node:zlib';

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

async function api(caminho, opcoes = {}) {
  const resp = await fetch(BASE + caminho, {
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
