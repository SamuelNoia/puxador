// Puxador de Dados - interface (vanilla JS, sem build).
//
// Fluxo da tela 2: 1) adicionar tabelas e escolher colunas  2) formatar  3) relacionar  4) filtrar.

const S = {
  bancos: [],
  formatos: [],
  conexoes: [],
  conexaoId: null,
  conexao: null,
  schema: null,
  tabelas: [],
  fontes: [],        // [{ alias, tabela, colunas: [], busca, carregando }]
  juncoes: [],       // [{ de, para, esquerda, direita }]
  mapa: new Map(),   // 't0.Id' -> { marcada, destino, formato, decimais, tipo, coluna, alias, grupo }
  filtros: [],       // [{ key, op, value, value2 }]
  buscaColunas: '',
  buscaFiltro: '',
  recolhidos: new Set(),   // fontes minimizadas na grade de colunas
  ordemKey: '',
  dir: 'asc',
  resultado: null,
  scroll: {},
  telaAtual: 'conexoes',
  prevLimit: 500,
  proxAlias: 1,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, tipo = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (tipo ? ` ${tipo}` : '');
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 3800);
}

let pedindoLogin = false;

async function api(caminho, opcoes = {}) {
  const resp = await fetch(caminho, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  });

  if (resp.status === 401 && !caminho.startsWith('/api/login')) {
    if (!pedindoLogin && (await exigirLogin())) return api(caminho, opcoes);
    throw new Error('Acesso não autorizado.');
  }

  const tipo = resp.headers.get('content-type') || '';
  if (!tipo.includes('application/json')) {
    const texto = await resp.text();
    throw new Error(texto || `Erro ${resp.status}`);
  }
  const dados = await resp.json();
  if (!resp.ok || dados.ok === false) throw new Error(dados.erro || `Erro ${resp.status}`);
  return dados;
}

function exigirLogin() {
  return new Promise((resolve) => {
    pedindoLogin = true;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;background:rgba(15,25,40,.55);display:grid;place-items:center;z-index:99';
    box.innerHTML = `
      <form style="background:#fff;padding:22px;border-radius:12px;width:320px;box-shadow:0 20px 50px rgba(0,0,0,.3)">
        <h2 style="margin-bottom:6px">Acesso restrito</h2>
        <p class="muted" style="margin:0 0 14px;font-size:13px">Informe a senha do portal.</p>
        <input type="password" id="senha-login" placeholder="senha" style="margin-bottom:12px" autofocus />
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="submit" class="btn primary">Entrar</button>
        </div>
      </form>`;
    document.body.append(box);
    box.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        await api('/api/login', { method: 'POST', body: { senha: box.querySelector('#senha-login').value } });
        box.remove();
        pedindoLogin = false;
        resolve(true);
      } catch (e) {
        toast(e.message, 'erro');
      }
    });
  });
}

/* ---------------------------------------------------------------- navegacao */
function irPara(tela) {
  if (S.telaAtual === tela) return;
  S.scroll[S.telaAtual] = window.scrollY;
  S.telaAtual = tela;

  $$('.tela').forEach((t) => t.classList.toggle('ativa', t.id === `tela-${tela}`));
  $$('.tab').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));

  const destino = S.scroll[tela] || 0;
  requestAnimationFrame(() => window.scrollTo(0, destino));
}

function bloquearResultado(bloquear) {
  $('.tab[data-tela="resultado"]').disabled = bloquear;
}

/* ---------------------------------------------------------------- conexoes */
function preencherBancos() {
  $('#kind').innerHTML = S.bancos
    .map((b) => `<option value="${esc(b.kind)}">${esc(b.label)} (porta ${b.defaultPort})</option>`)
    .join('');
}

function portaPadrao() {
  const b = S.bancos.find((x) => x.kind === $('#kind').value);
  return b ? b.defaultPort : 3306;
}

function ajustarCamposPorBanco() {
  const kind = $('#kind').value;
  if (!$('#porta').value || $('#porta').dataset.auto !== '0') {
    $('#porta').value = portaPadrao();
  }
  const ajuda = {
    mysql: 'Nome da base (database) no servidor MySQL.',
    mariadb: 'Nome da base (database) no servidor MariaDB.',
    postgres: 'Nome da base (database) no PostgreSQL.',
    firebird: 'Caminho completo do arquivo NO SERVIDOR (ex.: C:\\ecosis\\dados\\ECODADOS.ECO). '
      + 'Não use alias do IBExpert nem coloque o IP aqui.',
  }[kind] || '';
  $('#ajuda-base').textContent = ajuda;
  $('#label-base').textContent = kind === 'firebird'
    ? 'Caminho do banco no servidor (.fdb / .eco)'
    : 'Base de dados';
  $('#base').placeholder = kind === 'firebird' ? 'C:\\ecosis\\dados\\ECODADOS.ECO' : 'nome_da_base';
  $('#campo-schema').hidden = kind !== 'postgres';
}

function validarFormulario(corpo) {
  if (corpo.kind === 'firebird') {
    const caminho = String(corpo.base || '').trim();
    const hostNoCaminho = /^([^\\/]{2,}):[\\/]/.exec(caminho);
    if (hostNoCaminho && !/^[A-Za-z]$/.test(hostNoCaminho[1])) {
      return 'O caminho não deve incluir o servidor. Deixe o IP só no campo "Servidor" '
        + 'e aqui apenas o caminho do arquivo — ex.: C:\\ecosis\\dados\\ECODADOS.ECO';
    }
    if (caminho && !/[\\/]/.test(caminho) && !/\.[A-Za-z0-9]{2,5}$/.test(caminho)) {
      return 'Isso parece um alias do IBExpert. Informe o caminho completo do arquivo no servidor '
        + '(ex.: C:\\ecosis\\dados\\ECODADOS.ECO).';
    }
  }
  return null;
}

function limparFormulario() {
  $('#conexao-id').value = '';
  $('#nome').value = '';
  $('#host').value = '';
  $('#porta').value = '';
  $('#porta').dataset.auto = '1';
  $('#base').value = '';
  $('#usuario').value = '';
  $('#senha').value = '';
  $('#schema').value = '';
  $('#ssl').checked = false;
  $('#titulo-form').textContent = 'Nova conexão';
  $('#ajuda-senha').textContent = '';
  $('#resultado-teste').hidden = true;
  $('#kind').value = 'mysql';
  ajustarCamposPorBanco();
}

function corpoFormulario() {
  const options = {};
  if ($('#kind').value === 'postgres' && $('#schema').value.trim()) options.schema = $('#schema').value.trim();
  if ($('#ssl').checked) options.ssl = true;
  return {
    nome: $('#nome').value.trim(),
    kind: $('#kind').value,
    host: $('#host').value.trim(),
    porta: Number($('#porta').value) || portaPadrao(),
    base: $('#base').value.trim(),
    usuario: $('#usuario').value.trim(),
    senha: $('#senha').value,
    options,
  };
}

async function carregarConexoes() {
  const { conexoes } = await api('/api/conexoes');
  S.conexoes = conexoes;
  renderConexoes();
  preencherSelectConexoes();
}

function renderConexoes() {
  const alvo = $('#lista-conexoes');
  $('#contador-conexoes').textContent = S.conexoes.length ? `${S.conexoes.length} cadastrada(s)` : '';
  if (!S.conexoes.length) {
    alvo.innerHTML = '<p class="muted vazio">Nenhuma conexão ainda. Cadastre a primeira ao lado.</p>';
    return;
  }
  alvo.innerHTML = S.conexoes.map((c) => `
    <div class="item-conexao" data-id="${c.id}">
      <span class="tag">${esc(c.kind)}</span>
      <div class="dados">
        <strong>${esc(c.nome)}</strong>
        <span>${esc(c.host)}:${c.port} · ${esc(c.database)} · ${esc(c.username)}</span>
      </div>
      <button class="btn sm" data-acao="testar">testar</button>
      <button class="btn sm" data-acao="usar">usar</button>
      <button class="btn sm" data-acao="editar">editar</button>
      <button class="btn sm danger" data-acao="excluir">excluir</button>
    </div>`).join('');
}

function preencherSelectConexoes() {
  const sel = $('#sel-conexao');
  const atual = S.conexaoId;
  sel.innerHTML = '<option value="">— escolha —</option>' + S.conexoes
    .map((c) => `<option value="${c.id}" ${c.id === atual ? 'selected' : ''}>${esc(c.nome)} (${esc(c.kind)})</option>`)
    .join('');
}

async function editarConexao(id) {
  const c = S.conexoes.find((x) => x.id === id);
  if (!c) return;
  $('#conexao-id').value = c.id;
  $('#nome').value = c.nome;
  $('#kind').value = c.kind;
  ajustarCamposPorBanco();
  $('#porta').value = c.port;
  $('#porta').dataset.auto = '0';
  $('#host').value = c.host;
  $('#base').value = c.database;
  $('#usuario').value = c.username;
  $('#senha').value = '';
  $('#schema').value = (c.options && c.options.schema) || '';
  $('#ssl').checked = Boolean(c.options && c.options.ssl);
  $('#titulo-form').textContent = `Editando: ${c.nome}`;
  $('#ajuda-senha').textContent = c.temSenha ? 'Deixe em branco para manter a senha atual.' : '';
  $('#resultado-teste').hidden = true;
  irPara('conexoes');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------------- fontes / tabelas */
async function carregarSchemas() {
  if (!S.conexao || S.conexao.kind !== 'postgres') {
    $('#campo-schema').hidden = true;
    return;
  }
  $('#campo-schema').hidden = false;
  try {
    const { schemas } = await api(`/api/conexoes/${S.conexaoId}/schemas`);
    $('#sel-schema').innerHTML = schemas.map((s) => `<option value="${esc(s.nome)}">${esc(s.nome)}</option>`).join('');
    S.schema = schemas[0]?.nome || 'public';
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function carregarTabelas() {
  if (!S.conexaoId) return;
  try {
    const q = S.schema ? `?schema=${encodeURIComponent(S.schema)}` : '';
    const { tabelas } = await api(`/api/conexoes/${S.conexaoId}/tabelas${q}`);
    S.tabelas = tabelas;
  } catch (e) {
    S.tabelas = [];
    toast(e.message, 'erro');
  }
  $('#btn-add-fonte').disabled = !S.tabelas.length;
  renderFontes();
}

async function colunasDaTabela(tabela) {
  const q = new URLSearchParams({ tabela });
  if (S.schema) q.set('schema', S.schema);
  const { colunas } = await api(`/api/conexoes/${S.conexaoId}/colunas?${q}`);
  return colunas;
}

function fontePorAlias(alias) {
  return S.fontes.find((f) => f.alias === alias);
}

function adicionarFonte(tabela = '') {
  // t0 é sempre a principal; as demais recebem um alias novo (nunca reaproveitado)
  const alias = S.fontes.length === 0 ? 't0' : `t${S.proxAlias++}`;
  S.fontes.push({ alias, tabela: '', colunas: [], busca: '', carregando: false });
  renderFontes();
  if (tabela) trocarTabelaFonte(S.fontes.length - 1, tabela);
}

/** Refiltra só a lista de tabelas de uma fonte, sem recriar o bloco (mantém o foco no campo). */
function atualizarOpcoesFonte(i) {
  const f = S.fontes[i];
  const bloco = document.querySelector(`.fonte[data-i="${i}"]`);
  const select = bloco?.querySelector('select[data-papel="tabela"]');
  if (!f || !select) return;
  const busca = (f.busca || '').toLowerCase();
  const lista = (S.tabelas || [])
    .filter((t) => !busca || t.nome.toLowerCase().includes(busca))
    .slice(0, 400);
  select.innerHTML = '<option value="">— escolha —</option>' + lista
    .map((t) => `<option value="${esc(t.nome)}" ${t.nome === f.tabela ? 'selected' : ''}>${esc(t.nome)}${t.linhas ? ` · ~${t.linhas}` : ''}</option>`)
    .join('');
}

async function trocarTabelaFonte(i, tabela) {
  const f = S.fontes[i];
  if (!f || !tabela) return;
  f.tabela = tabela;
  f.carregando = true;

  if (i > 0) {
    const juncao = S.juncoes.find((j) => j.para === f.alias);
    if (!juncao) S.juncoes.push({ de: palpiteFontePai(tabela), para: f.alias, esquerda: '', direita: '' });
  }
  renderFontes();

  try {
    f.colunas = await colunasDaTabela(tabela);
    if (i > 0) {
      const j = S.juncoes.find((x) => x.para === f.alias);
      const pai = fontePorAlias(j.de);
      j.direita = f.colunas.find((c) => c.chave === 'PRI')?.nome
        || f.colunas.find((c) => c.nome.toLowerCase() === 'id')?.nome
        || f.colunas[0]?.nome || '';
      j.esquerda = adivinharChaveEstrangeira(pai, tabela) || pai?.colunas[0]?.nome || '';
    }
  } catch (e) {
    toast(e.message, 'erro');
    f.colunas = [];
  } finally {
    f.carregando = false;
    reconstruirMapa();
    renderFontes();
    renderColunas();
    renderJuncoes();
    renderFiltros();
    renderOrdem();
    atualizarCartoes();
  }
}

/** Procura na fonte "pai" a coluna que aponta para a tabela nova (IdFabricante, CodGrupo...). */
function adivinharChaveEstrangeira(pai, tabelaNova) {
  if (!pai) return '';
  const alvo = String(tabelaNova).toLowerCase();
  const c = pai.colunas.find((x) => x.nome.toLowerCase() === `id${alvo}`)
    || pai.colunas.find((x) => x.nome.toLowerCase().endsWith(`id${alvo}`))
    || pai.colunas.find((x) => x.nome.toLowerCase() === `cod${alvo}`);
  return c ? c.nome : '';
}

/** Em qual fonte já adicionada está a chave que liga a tabela nova? */
function palpiteFontePai(tabelaNova) {
  for (const f of S.fontes) {
    const achou = f.colunas.some((c) => c.nome.toLowerCase() === `id${String(tabelaNova).toLowerCase()}`);
    if (achou) return f.alias;
  }
  return S.fontes[0]?.alias || 't0';
}

function removerFonte(i) {
  const f = S.fontes[i];
  if (!f || i === 0) return;
  S.fontes.splice(i, 1);
  S.juncoes = S.juncoes
    .filter((j) => j.para !== f.alias)
    .map((j) => (j.de === f.alias ? { ...j, de: S.fontes[0].alias, esquerda: '' } : j));
  reconstruirMapa();
  renderFontes();
  renderColunas();
  renderJuncoes();
  renderFiltros();
  renderOrdem();
  atualizarCartoes();
}

function renderFontes() {
  const alvo = $('#lista-fontes');
  if (!S.fontes.length) {
    alvo.innerHTML = '<p class="muted vazio">Escolha a conexão e clique em “+ adicionar tabela”.</p>';
    return;
  }

  alvo.innerHTML = S.fontes.map((f, i) => {
    const busca = (f.busca || '').toLowerCase();
    const lista = (S.tabelas || []).filter((t) => !busca || t.nome.toLowerCase().includes(busca)).slice(0, 400);
    const opcoes = '<option value="">— escolha —</option>' + lista
      .map((t) => `<option value="${esc(t.nome)}" ${t.nome === f.tabela ? 'selected' : ''}>${esc(t.nome)}${t.linhas ? ` · ~${t.linhas}` : ''}</option>`)
      .join('');
    const marcadas = [...S.mapa.entries()].filter(([k, m]) => k.startsWith(`${f.alias}.`) && m.marcada).length;

    return `
      <div class="fonte" data-i="${i}">
        <div class="fonte-head">
          <span class="fonte-titulo">Fonte ${i + 1}${i === 0 ? ' <span class="tag">principal</span>' : ''}</span>
          <span class="muted">${f.tabela ? `${f.colunas.length} colunas · ${marcadas} marcada(s)` : 'nenhuma tabela escolhida'}</span>
          ${i > 0 ? '<button class="btn sm danger" data-papel="remover-fonte" title="remover tabela">remover</button>' : ''}
        </div>
        <div class="row">
          <label class="field" style="max-width:260px">
            <span>Pesquisar tabela</span>
            <input type="search" data-papel="busca-tabela" value="${esc(f.busca)}" placeholder="digite parte do nome…" />
          </label>
          <label class="field grow">
            <span>Tabela (${(S.tabelas || []).length} disponíveis)</span>
            <select data-papel="tabela" ${f.carregando ? 'disabled' : ''}>${opcoes}</select>
          </label>
        </div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------------- mapa de colunas */
function reconstruirMapa() {
  const novo = new Map();
  S.fontes.forEach((f, idx) => {
    for (const c of f.colunas) {
      const chave = `${f.alias}.${c.nome}`;
      const antigo = S.mapa.get(chave);
      const padrao = idx === 0;
      // nao-principal ganha prefixo para nao colidir com o mesmo nome da tabela principal
      // (ex.: item.Id x fabricante.Id -> "fabricante_Id")
      const destinoPadrao = idx === 0 ? c.nome : `${f.tabela}_${c.nome}`;
      novo.set(chave, antigo || {
        marcada: padrao,
        destino: destinoPadrao,
        formato: sugerir(c.tipo),
        decimais: '',
        tipo: c.tipo,
        coluna: c.nome,
        alias: f.alias,
        grupo: f.tabela || `Fonte ${idx + 1}`,
      });
      const item = novo.get(chave);
      item.tipo = c.tipo;
      item.alias = f.alias;
      item.coluna = c.nome;
      item.grupo = f.tabela || `Fonte ${idx + 1}`;
    }
  });
  S.mapa = novo;
}

function renderColunas() {
  const corpo = $('#corpo-colunas');
  if (!S.mapa.size) {
    corpo.innerHTML = '<tr><td colspan="6" class="muted vazio">Sem colunas.</td></tr>';
    return;
  }

  const busca = S.buscaColunas.trim().toLowerCase();
  const dups = destinosDuplicados();
  const linhas = [];

  S.fontes.forEach((f, idx) => {
    if (!f.colunas.length) return;
    const visiveis = f.colunas.filter((c) => !busca
      || c.nome.toLowerCase().includes(busca)
      || String(f.tabela || '').toLowerCase().includes(busca));
    if (!visiveis.length) return;

    // toda fonte tem cabeçalho clicável (minimiza/expande), mesmo quando há só uma
    const recolhida = S.recolhidos.has(f.alias);
    const marcadasFonte = visiveis.filter((c) => S.mapa.get(`${f.alias}.${c.nome}`)?.marcada).length;
    linhas.push(`
      <tr class="grupo" data-grupo="${esc(f.alias)}">
        <td colspan="6">
          <button class="btn-mini" data-papel="toggle-grupo" title="${recolhida ? 'expandir' : 'minimizar'}">${recolhida ? '▸' : '▾'}</button>
          <strong>Fonte ${idx + 1} · ${esc(f.tabela || 'sem tabela')}</strong>
          <span class="muted">(${visiveis.length} coluna(s) · ${marcadasFonte} marcada(s))</span>
          ${recolhida ? '<span class="muted">— minimizada, clique para abrir</span>' : ''}
        </td>
      </tr>`);

    if (recolhida) return;

    for (const c of visiveis) {
      const chave = `${f.alias}.${c.nome}`;
      const m = S.mapa.get(chave);
      if (!m) continue;
      const opcoes = S.formatos
        .map((x) => `<option value="${x.id}" ${m.formato === x.id ? 'selected' : ''}>${esc(x.label)}</option>`)
        .join('');
      const repetido = m.marcada && dups.has(String(m.destino || '').trim().toLowerCase());
      linhas.push(`
        <tr data-chave="${esc(chave)}" class="${m.marcada ? '' : 'desmarcada'}">
          <td><input type="checkbox" data-papel="marcar" ${m.marcada ? 'checked' : ''} /></td>
          <td><strong>${esc(c.nome)}</strong>${c.chave ? ' <span class="tag">PK</span>' : ''}</td>
          <td class="tipo-col">${esc(c.tipo)}</td>
          <td><input type="text" data-papel="destino" class="${repetido ? 'dup' : ''}" value="${esc(m.destino)}"
                     title="${repetido ? 'Este nome já está sendo usado por outra coluna' : ''}" /></td>
          <td><select data-papel="formato">${opcoes}</select></td>
          <td><input type="number" data-papel="decimais" value="${esc(m.decimais)}" min="0" max="6" /></td>
        </tr>`);
    }
  });

  corpo.innerHTML = linhas.length
    ? linhas.join('')
    : '<tr><td colspan="6" class="muted vazio">Nenhuma coluna encontrada para a pesquisa.</td></tr>';
  atualizarResumoColunas();
}

function atualizarResumoColunas() {
  const marcadas = [...S.mapa.values()].filter((m) => m.marcada).length;
  $('#resumo-colunas').textContent = `${marcadas} de ${S.mapa.size} coluna(s)`;
}

/** Nomes de planilha repetidos entre colunas marcadas (o Excel/CSV sobrescreveria um pelo outro). */
function destinosDuplicados() {
  const contagem = new Map();
  for (const m of S.mapa.values()) {
    if (!m.marcada) continue;
    const nome = String(m.destino || '').trim().toLowerCase();
    if (!nome) continue;
    contagem.set(nome, (contagem.get(nome) || 0) + 1);
  }
  return new Set([...contagem.entries()].filter(([, n]) => n > 1).map(([nome]) => nome));
}

function avisarDuplicados() {
  const dups = destinosDuplicados();
  if (!dups.size) return false;
  const lista = [...dups].map((d) => `“${d}”`).join(', ');
  toast(`Nome repetido na planilha: ${lista}. Ajuste o campo “Nome na planilha”.`, 'erro');
  return true;
}

/* ---------------------------------------------------------------- relacionamentos */
// Cada bloco: Tabela 1 (coluna) = Tabela 2 (coluna)  +  saída (nome na planilha e formatação)
function renderJuncoes() {
  const alvo = $('#lista-juncoes');

  if (S.fontes.length < 2) {
    alvo.innerHTML = '<p class="muted vazio">Com uma única tabela não é preciso relacionamento.</p>';
    return;
  }

  const juncoes = S.juncoes.filter((j) => fontePorAlias(j.para) && fontePorAlias(j.de));
  if (!juncoes.length) {
    alvo.innerHTML = '<p class="muted vazio">Adicione outra tabela para criar um relacionamento.</p>';
    return;
  }

  alvo.innerHTML = juncoes.map((j) => {
    const f2 = fontePorAlias(j.para);
    const f1 = fontePorAlias(j.de);
    if (!f2 || !f1) return '';

    const tabela1 = (S.fontes || [])
      .filter((f) => f.alias !== j.para && f.colunas.length)
      .map((f) => `<option value="${esc(f.alias)}" ${f.alias === j.de ? 'selected' : ''}>${esc(f.tabela)}</option>`)
      .join('');

    const todasTabelas = (S.tabelas || [])
      .map((t) => `<option value="${esc(t.nome)}" ${t.nome === f2.tabela ? 'selected' : ''}>${esc(t.nome)}</option>`)
      .join('');

    const colunas1 = f1.colunas
      .map((c) => `<option value="${esc(c.nome)}" ${c.nome === j.esquerda ? 'selected' : ''}>${esc(c.nome)}</option>`)
      .join('');
    const colunas2 = f2.colunas
      .map((c) => `<option value="${esc(c.nome)}" ${c.nome === j.direita ? 'selected' : ''}>${esc(c.nome)}</option>`)
      .join('');

    // colunas desta tabela que vão sair na planilha
    const marcadas = f2.colunas.filter((c) => S.mapa.get(`${f2.alias}.${c.nome}`)?.marcada);
    const disponiveis = f2.colunas.filter((c) => !S.mapa.get(`${f2.alias}.${c.nome}`)?.marcada);

    const saida = marcadas.map((c) => {
      const chave = `${f2.alias}.${c.nome}`;
      const m = S.mapa.get(chave);
      const opcoesFormato = S.formatos
        .map((x) => `<option value="${x.id}" ${m.formato === x.id ? 'selected' : ''}>${esc(x.label)}</option>`)
        .join('');
      return `
        <div class="saida-linha" data-chave="${esc(chave)}">
          <input type="checkbox" data-papel="saida-marcar" checked title="incluir na planilha" />
          <span class="coluna-nome">${esc(c.nome)}</span>
          <input type="text" data-papel="saida-destino" value="${esc(m.destino)}" placeholder="nome na planilha" />
          <select data-papel="saida-formato">${opcoesFormato}</select>
          <input type="number" data-papel="saida-decimais" value="${esc(m.decimais)}" min="0" max="6" title="decimais" />
        </div>`;
    }).join('');

    const addColuna = disponiveis.length
      ? `<div class="rel-add">
           <select data-papel="add-coluna">
             <option value="">+ adicionar coluna de ${esc(f2.tabela)}…</option>
             ${disponiveis.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)} · ${esc(c.tipo)}</option>`).join('')}
           </select>
         </div>`
      : '';

    const falta = !j.esquerda || !j.direita
      ? '<div class="rel-erro">Escolha a coluna das duas tabelas para a ligação.</div>'
      : '';

    return `
      <div class="rel" data-para="${esc(j.para)}">
        <div class="rel-linha">
          <label class="field">
            <span>Tabela 1</span>
            <select data-papel="t1">${tabela1}</select>
          </label>
          <label class="field">
            <span>Coluna</span>
            <select data-papel="c1">${colunas1}</select>
          </label>
          <span class="rel-igual">=</span>
          <label class="field">
            <span>Tabela 2</span>
            <select data-papel="t2">${todasTabelas}</select>
          </label>
          <label class="field">
            <span>Coluna</span>
            <select data-papel="c2">${colunas2}</select>
          </label>
        </div>
        ${falta}
        <div class="rel-saida">
          <span class="rel-saida-titulo">O que sai de ${esc(f2.tabela)} (nome na planilha e formatação)</span>
          ${saida || '<p class="muted" style="margin:0 0 6px;font-size:12px">Nenhuma coluna desta tabela marcada ainda.</p>'}
          ${addColuna}
        </div>
      </div>`;
  }).join('');
}

/* ---------------------------------------------------------------- filtros */
function tipoDoKey(key) {
  return (S.mapa.get(key) || {}).tipo || '';
}

function ehData(tipo) {
  return /date|timestamp|datetime/i.test(tipo || '');
}

function ehDataHora(tipo) {
  return /timestamp|datetime/i.test(tipo || '');
}

const OPERADORES_UI = [
  ['eq', 'igual a'], ['ne', 'diferente de'], ['like', 'contém'], ['starts', 'começa com'],
  ['gt', 'maior que'], ['gte', 'maior ou igual'], ['lt', 'menor que'], ['lte', 'menor ou igual'],
  ['between', 'entre (período)'], ['null', 'está vazio'], ['notnull', 'não está vazio'],
];

function valorParaInput(valor, tipo) {
  const s = String(valor ?? '');
  if (ehDataHora(tipo) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.slice(0, 16).replace(' ', 'T');
  if (ehData(tipo) && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function inputValor(f, i, papel, valor, tipo) {
  if (['null', 'notnull'].includes(f.op)) return '';
  if (ehDataHora(tipo)) {
    return `<input type="datetime-local" data-i="${i}" data-papel="${papel}" value="${esc(valorParaInput(valor, tipo))}" />`;
  }
  if (ehData(tipo)) {
    return `<input type="date" data-i="${i}" data-papel="${papel}" value="${esc(valorParaInput(valor, tipo))}" />`;
  }
  return `<input type="text" data-i="${i}" data-papel="${papel}" value="${esc(valor ?? '')}" placeholder="valor" />`;
}

function opcoesColunasFiltro(selecionado) {
  const busca = S.buscaFiltro.trim().toLowerCase();
  const itens = [...S.mapa.entries()]
    .filter(([chave, m]) => chave === selecionado
      || !busca
      || m.coluna.toLowerCase().includes(busca)
      || String(m.grupo).toLowerCase().includes(busca));
  return itens
    .map(([chave, m]) => `<option value="${esc(chave)}" ${selecionado === chave ? 'selected' : ''}>${esc(S.fontes.length > 1 ? `${m.grupo} · ${m.coluna}` : m.coluna)}</option>`)
    .join('');
}

function renderFiltros() {
  const alvo = $('#lista-filtros');
  if (!S.filtros.length) {
    alvo.innerHTML = '<p class="muted vazio">Nenhum filtro. Todos os registros serão puxados.</p>';
    return;
  }
  alvo.innerHTML = S.filtros.map((f, i) => {
    const tipo = tipoDoKey(f.key);
    const opcoes = OPERADORES_UI
      .map(([v, l]) => `<option value="${v}" ${f.op === v ? 'selected' : ''}>${l}</option>`)
      .join('');
    const entre = f.op === 'between';
    return `
      <div class="filtro-linha ${entre ? 'com-ate' : ''}" data-i="${i}">
        <select data-papel="coluna">${opcoesColunasFiltro(f.key)}</select>
        <select data-papel="op">${opcoes}</select>
        <div class="filtro-valores">
          ${inputValor(f, i, 'valor', f.value, tipo)}
          ${entre ? inputValor(f, i, 'valor2', f.value2, tipo) : ''}
        </div>
        <button class="btn sm danger" data-papel="remover" title="remover">×</button>
      </div>`;
  }).join('');
}

function renderOrdem() {
  const busca = S.buscaFiltro.trim().toLowerCase();
  const itens = [...S.mapa.entries()].filter(([chave, m]) => chave === S.ordemKey
    || !busca
    || m.coluna.toLowerCase().includes(busca)
    || String(m.grupo).toLowerCase().includes(busca));
  $('#sel-ordem').innerHTML = '<option value="">— sem ordenação —</option>' + itens
    .map(([chave, m]) => `<option value="${esc(chave)}" ${S.ordemKey === chave ? 'selected' : ''}>${esc(S.fontes.length > 1 ? `${m.grupo} · ${m.coluna}` : m.coluna)}</option>`)
    .join('');
  $('#sel-dir').value = S.dir;
}

/* ---------------------------------------------------------------- montar consulta */
function montarCorpo(extra = {}) {
  const principal = S.fontes[0];
  const juncoes = S.juncoes
    .filter((j) => j.para && j.de && j.esquerda && j.direita && fontePorAlias(j.para)?.tabela)
    .map((j) => ({
      alias: j.para,
      de: j.de,
      tabela: fontePorAlias(j.para).tabela,
      esquema: S.schema,
      esquerda: j.esquerda,
      direita: j.direita,
    }));

  const validos = new Set([principal?.alias || 't0', ...juncoes.map((j) => j.alias)]);

  const selecao = [];
  const mapeamento = [];
  for (const [chave, m] of S.mapa) {
    if (!m.marcada || !validos.has(m.alias)) continue;
    const alias = chave.replace(/[^\w]/g, '_');
    selecao.push({ alias, column: m.coluna, table: m.alias });
    mapeamento.push({
      origem: alias,
      destino: (m.destino || m.coluna).trim(),
      formato: m.formato || 'original',
      decimais: m.decimais === '' ? undefined : Number(m.decimais),
    });
  }

  const filtros = [];
  for (const f of S.filtros) {
    const m = S.mapa.get(f.key);
    if (!m || !validos.has(m.alias)) continue;
    if (['null', 'notnull'].includes(f.op)) {
      filtros.push({ table: m.alias, column: m.coluna, op: f.op });
      continue;
    }
    let value = f.value;
    let value2 = f.value2;
    if (f.op === 'between' && ehDataHora(m.tipo) && /^\d{4}-\d{2}-\d{2}$/.test(String(value2 || ''))) {
      value2 = `${value2} 23:59:59`;
    }
    filtros.push({ table: m.alias, column: m.coluna, op: f.op, value, value2 });
  }

  const ordem = S.ordemKey && S.mapa.get(S.ordemKey) && validos.has(S.mapa.get(S.ordemKey).alias)
    ? { table: S.mapa.get(S.ordemKey).alias, column: S.mapa.get(S.ordemKey).coluna, dir: S.dir }
    : null;

  return {
    conexaoId: S.conexaoId,
    schema: S.schema || undefined,
    tabela: principal?.tabela || '',
    selecao,
    juncoes,
    filtros,
    ordem,
    limite: Number($('#limite')?.value) || 0,
    mapeamento,
    tipos: [...S.mapa.entries()].map(([chave, m]) => ({ nome: chave.replace(/[^\w]/g, '_'), tipo: m.tipo })),
    ...extra,
  };
}

function atualizarCartoes() {
  const temTabela = S.fontes.some((f) => f.tabela && f.colunas.length);
  $('#card-colunas').hidden = !temTabela;
  $('#card-juncoes').hidden = !temTabela || S.fontes.length < 2;
  $('#card-filtros').hidden = !temTabela;
}

async function puxarDados() {
  if (avisarDuplicados()) return;
  const btn = $('#btn-previa');
  btn.disabled = true;
  btn.textContent = 'Puxando…';
  try {
    const dados = await api('/api/puxar', { method: 'POST', body: montarCorpo() });
    S.resultado = dados;
    renderResultado(dados);
    bloquearResultado(false);
    S.scroll.resultado = 0;
    irPara('resultado');
    toast(`${dados.quantidade} linha(s) puxadas em ${dados.ms} ms`);
  } catch (e) {
    const aviso = $('#aviso-puxar');
    aviso.hidden = false;
    aviso.className = 'aviso erro';
    aviso.textContent = e.message;
    toast(e.message, 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Puxar dados';
  }
}

async function contarRegistros() {
  const btn = $('#btn-contar');
  btn.disabled = true;
  btn.textContent = 'Contando…';
  try {
    const { total } = await api('/api/puxar/contar', { method: 'POST', body: montarCorpo() });
    const aviso = $('#aviso-puxar');
    aviso.hidden = false;
    aviso.className = 'aviso info';
    aviso.textContent = `${Number(total).toLocaleString('pt-BR')} registro(s) atendem aos filtros.`;
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Contar registros';
  }
}

function valorCelula(item) {
  if (!item) return '';
  if (item.type === 'n') {
    const n = Number(item.value);
    return Number.isFinite(n)
      ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : String(item.value);
  }
  return String(item.value ?? '');
}

function renderResultado(dados) {
  const info = [];
  info.push(`<span>Linhas: <b>${dados.quantidade}</b></span>`);
  if (dados.total !== null && dados.total !== undefined) info.push(`<span>Total no banco: <b>${Number(dados.total).toLocaleString('pt-BR')}</b></span>`);
  info.push(`<span>Tempo: <b>${dados.ms} ms</b></span>`);
  if (dados.truncado) info.push(`<span class="tag">prévia limitada a ${dados.limite}</span>`);
  info.push(`<span class="muted">${esc(dados.sql || '')}</span>`);
  $('#info-resultado').innerHTML = info.join('');

  $('#head-resultado').innerHTML = `<tr>${dados.colunas.map((c) => `<th>${esc(c.destino)}</th>`).join('')}</tr>`;
  $('#body-resultado').innerHTML = dados.linhas.map((linha) => `<tr>${dados.colunas
    .map((c) => {
      const item = linha[c.destino];
      const classe = item && item.type === 'n' ? ' class="num"' : '';
      return `<td${classe}>${esc(valorCelula(item))}</td>`;
    }).join('')}</tr>`).join('');
}

async function exportar(formato) {
  if (!S.resultado) return toast('Puxe os dados antes de exportar.', 'erro');
  if (avisarDuplicados()) return;
  try {
    const corpo = montarCorpo({ formato, arquivo: S.fontes[0]?.tabela, titulo: S.fontes[0]?.tabela });
    const resp = await fetch('/api/exportar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!resp.ok) {
      const erro = await resp.json().catch(() => ({ erro: `Erro ${resp.status}` }));
      throw new Error(erro.erro || 'Falha ao exportar.');
    }
    const blob = await resp.blob();
    const disp = resp.headers.get('content-disposition') || '';
    const nome = /filename="([^"]+)"/.exec(disp)?.[1] || `dados.${formato}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Arquivo ${nome} gerado.`);
  } catch (e) {
    toast(e.message, 'erro');
  }
}

async function salvarMapeamento() {
  if (!S.resultado) return toast('Puxe os dados antes de salvar.', 'erro');
  const nome = prompt('Nome do mapeamento (ex.: Produtos ERP):', `${S.fontes[0]?.tabela || ''}`);
  if (!nome) return;
  const corpo = montarCorpo();
  try {
    await api('/api/mapeamentos', {
      method: 'POST',
      body: {
        conexaoId: S.conexaoId,
        nome,
        schema: S.schema,
        tabela: corpo.tabela,
        config: { colunas: corpo.mapeamento, filtros: corpo.filtros, juncoes: corpo.juncoes, limite: corpo.limite },
      },
    });
    toast('Mapeamento salvo.');
  } catch (e) {
    toast(e.message, 'erro');
  }
}

/* ---------------------------------------------------------------- eventos */
function ligarEventos() {
  $$('.tab').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) irPara(b.dataset.tela); }));

  $('#kind').addEventListener('change', () => {
    $('#porta').dataset.auto = '1';
    ajustarCamposPorBanco();
  });
  $('#btn-limpar-form').addEventListener('click', limparFormulario);

  $('#form-conexao').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const id = $('#conexao-id').value;
    const corpo = corpoFormulario();
    const problema = validarFormulario(corpo);
    if (problema) {
      const aviso = $('#resultado-teste');
      aviso.hidden = false;
      aviso.className = 'aviso erro';
      aviso.textContent = problema;
      return;
    }
    try {
      if (id) await api(`/api/conexoes/${id}`, { method: 'PUT', body: corpo });
      else await api('/api/conexoes', { method: 'POST', body: corpo });
      toast(id ? 'Conexão atualizada.' : 'Conexão salva.');
      limparFormulario();
      await carregarConexoes();
    } catch (e) {
      toast(e.message, 'erro');
    }
  });

  $('#btn-testar').addEventListener('click', async () => {
    const alvo = $('#resultado-teste');
    alvo.hidden = false;
    alvo.className = 'aviso info';
    const corpo = corpoFormulario();
    const problema = validarFormulario(corpo);
    if (problema) {
      alvo.className = 'aviso erro';
      alvo.textContent = problema;
      return;
    }
    alvo.textContent = 'Testando…';
    try {
      const id = $('#conexao-id').value;
      const r = id && !corpo.senha
        ? await api(`/api/conexoes/${id}/testar`, { method: 'POST', body: corpo })
        : await api('/api/conexoes/testar', { method: 'POST', body: corpo });
      alvo.className = 'aviso ok';
      alvo.textContent = `Conectado em ${r.ms} ms · versão ${r.versao || '—'}`;
    } catch (e) {
      alvo.className = 'aviso erro';
      alvo.textContent = e.message;
    }
  });

  $('#lista-conexoes').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-acao]');
    if (!btn) return;
    const id = Number(btn.closest('.item-conexao').dataset.id);
    const acao = btn.dataset.acao;
    if (acao === 'editar') return editarConexao(id);
    if (acao === 'usar') {
      S.conexaoId = id;
      S.conexao = S.conexoes.find((c) => c.id === id);
      preencherSelectConexoes();
      S.fontes = [];
      S.juncoes = [];
      S.mapa.clear();
      S.filtros = [];
      S.proxAlias = 1;
      atualizarCartoes();
      irPara('puxar');
      await carregarSchemas();
      await carregarTabelas();
      return;
    }
    if (acao === 'testar') {
      try {
        const r = await api(`/api/conexoes/${id}/testar`, { method: 'POST', body: {} });
        toast(`OK · ${r.versao || 'conectado'} (${r.ms} ms)`);
      } catch (e) {
        toast(e.message, 'erro');
      }
      return;
    }
    if (acao === 'excluir') {
      if (!confirm('Excluir esta conexão?')) return;
      try {
        await api(`/api/conexoes/${id}`, { method: 'DELETE' });
        toast('Conexão excluída.');
        await carregarConexoes();
      } catch (e) {
        toast(e.message, 'erro');
      }
    }
  });

  $('#sel-conexao').addEventListener('change', async () => {
    S.conexaoId = Number($('#sel-conexao').value) || null;
    S.conexao = S.conexoes.find((c) => c.id === S.conexaoId) || null;
    S.fontes = [];
    S.juncoes = [];
    S.mapa.clear();
    S.filtros = [];
    S.ordemKey = '';
    S.proxAlias = 1;
    atualizarCartoes();
    $('#btn-add-fonte').disabled = true;
    if (!S.conexaoId) { renderFontes(); return; }
    await carregarSchemas();
    await carregarTabelas();
  });

  $('#sel-schema').addEventListener('change', async () => {
    S.schema = $('#sel-schema').value;
    S.fontes = [];
    S.juncoes = [];
    S.mapa.clear();
    atualizarCartoes();
    await carregarTabelas();
  });

  $('#btn-add-fonte').addEventListener('click', () => { adicionarFonte(); });

  $('#lista-fontes').addEventListener('input', (ev) => {
    if (ev.target.dataset.papel !== 'busca-tabela') return;
    const bloco = ev.target.closest('.fonte');
    const i = Number(bloco.dataset.i);
    const f = S.fontes[i];
    if (!f) return;
    f.busca = ev.target.value;
    atualizarOpcoesFonte(i);
  });

  $('#lista-fontes').addEventListener('change', (ev) => {
    const bloco = ev.target.closest('.fonte');
    if (!bloco) return;
    if (ev.target.dataset.papel !== 'tabela') return;
    trocarTabelaFonte(Number(bloco.dataset.i), ev.target.value);
  });

  $('#lista-fontes').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="remover-fonte"]');
    if (!btn) return;
    removerFonte(Number(btn.closest('.fonte').dataset.i));
  });

  $('#busca-colunas').addEventListener('input', (ev) => {
    S.buscaColunas = ev.target.value;
    renderColunas();
  });

  $('#corpo-colunas').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="toggle-grupo"]');
    if (!btn) return;
    const alvo = btn.closest('tr[data-grupo]');
    const alias = alvo?.dataset.grupo;
    if (!alias) return;
    if (S.recolhidos.has(alias)) S.recolhidos.delete(alias);
    else S.recolhidos.add(alias);
    renderColunas();
  });

  $('#corpo-colunas').addEventListener('change', (ev) => {
    const linha = ev.target.closest('tr[data-chave]');
    if (!linha) return;
    const m = S.mapa.get(linha.dataset.chave);
    const papel = ev.target.dataset.papel;
    if (!m || !papel) return;
    if (papel === 'marcar') m.marcada = ev.target.checked;
    if (papel === 'destino') m.destino = ev.target.value;
    if (papel === 'formato') m.formato = ev.target.value;
    if (papel === 'decimais') m.decimais = ev.target.value;
    if (papel === 'marcar') {
      linha.classList.toggle('desmarcada', !m.marcada);
      atualizarResumoColunas();
      renderFontes();
    }
    // ao sair do campo, re-renderiza para atualizar o destaque de nomes repetidos
    if (papel === 'destino') renderColunas();
  });

  $('#btn-todas').addEventListener('click', () => {
    for (const [chave, m] of S.mapa) {
      const f = fontePorAlias(m.alias);
      const busca = S.buscaColunas.trim().toLowerCase();
      if (!busca || m.coluna.toLowerCase().includes(busca) || String(f?.tabela).toLowerCase().includes(busca)) {
        m.marcada = true;
      }
    }
    renderColunas();
    renderFontes();
  });

  $('#btn-nenhuma').addEventListener('click', () => {
    for (const [chave, m] of S.mapa) {
      const f = fontePorAlias(m.alias);
      const busca = S.buscaColunas.trim().toLowerCase();
      if (!busca || m.coluna.toLowerCase().includes(busca) || String(f?.tabela).toLowerCase().includes(busca)) {
        m.marcada = false;
      }
    }
    renderColunas();
    renderFontes();
  });

  $('#lista-juncoes').addEventListener('change', (ev) => {
    const bloco = ev.target.closest('.rel');
    if (!bloco) return;
    const j = S.juncoes.find((x) => x.para === bloco.dataset.para);
    if (!j) return;
    const papel = ev.target.dataset.papel;

    if (papel === 't1') {
      j.de = ev.target.value;
      const pai = fontePorAlias(j.de);
      j.esquerda = adivinharChaveEstrangeira(pai, fontePorAlias(j.para)?.tabela) || pai?.colunas[0]?.nome || '';
      renderJuncoes();
      return;
    }
    if (papel === 'c1') { j.esquerda = ev.target.value; renderJuncoes(); return; }
    if (papel === 'c2') { j.direita = ev.target.value; renderJuncoes(); return; }

    if (papel === 't2') {
      const alvo = fontePorAlias(j.para);
      const idx = S.fontes.indexOf(alvo);
      if (idx >= 0) trocarTabelaFonte(idx, ev.target.value);
      return;
    }

    if (papel === 'add-coluna') {
      if (!ev.target.value) return;
      const chave = `${bloco.dataset.para}.${ev.target.value}`;
      const m = S.mapa.get(chave);
      if (m) {
        m.marcada = true;
        if (!m.destino || m.destino === m.coluna) m.destino = `${fontePorAlias(j.para).tabela}_${m.coluna}`;
      }
      renderColunas();
      renderFontes();
      renderJuncoes();
      return;
    }

    if (papel === 'saida-marcar') {
      const m = S.mapa.get(ev.target.closest('.saida-linha').dataset.chave);
      if (m) m.marcada = ev.target.checked;
      renderColunas();
      renderFontes();
      renderJuncoes();
      return;
    }

    if (papel === 'saida-formato' || papel === 'saida-decimais' || papel === 'saida-destino') {
      const m = S.mapa.get(ev.target.closest('.saida-linha').dataset.chave);
      if (!m) return;
      if (papel === 'saida-formato') m.formato = ev.target.value;
      if (papel === 'saida-decimais') m.decimais = ev.target.value;
      if (papel === 'saida-destino') m.destino = ev.target.value;
      renderColunas();
      return;
    }
  });

  // digitação no "nome na planilha" dentro do relacionamento (sem re-renderizar para não perder o foco)
  $('#lista-juncoes').addEventListener('input', (ev) => {
    if (ev.target.dataset.papel !== 'saida-destino') return;
    const m = S.mapa.get(ev.target.closest('.saida-linha').dataset.chave);
    if (m) m.destino = ev.target.value;
  });

  $('#btn-add-filtro').addEventListener('click', () => {
    if (!S.mapa.size) return toast('Escolha uma tabela primeiro.', 'erro');
    S.filtros.push({ key: [...S.mapa.keys()][0], op: 'eq', value: '', value2: '' });
    renderFiltros();
  });

  $('#lista-filtros').addEventListener('change', (ev) => {
    const linha = ev.target.closest('.filtro-linha');
    if (!linha) return;
    const f = S.filtros[Number(linha.dataset.i)];
    const papel = ev.target.dataset.papel;
    if (!f || !papel) return;
    if (papel === 'coluna') {
      f.key = ev.target.value;
      if (ehData(tipoDoKey(f.key))) f.value = '';
      renderFiltros();
    }
    if (papel === 'op') { f.op = ev.target.value; renderFiltros(); }
    if (papel === 'valor') f.value = ev.target.value;
    if (papel === 'valor2') f.value2 = ev.target.value;
  });

  $('#lista-filtros').addEventListener('input', (ev) => {
    const papel = ev.target.dataset.papel;
    if (papel !== 'valor' && papel !== 'valor2') return;
    const f = S.filtros[Number(ev.target.dataset.i)];
    if (f) f[papel] = ev.target.value;
  });

  $('#lista-filtros').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="remover"]');
    if (!btn) return;
    S.filtros.splice(Number(btn.closest('.filtro-linha').dataset.i), 1);
    renderFiltros();
  });

  $('#sel-ordem').addEventListener('change', () => { S.ordemKey = $('#sel-ordem').value; });
  $('#sel-dir').addEventListener('change', () => { S.dir = $('#sel-dir').value; });

  $('#btn-previa').addEventListener('click', puxarDados);
  $('#btn-contar').addEventListener('click', contarRegistros);
  $('#btn-export-xlsx').addEventListener('click', () => exportar('xlsx'));
  $('#btn-export-csv').addEventListener('click', () => exportar('csv'));
  $('#btn-salvar-mapa').addEventListener('click', salvarMapeamento);
  $('#btn-voltar').addEventListener('click', () => irPara('puxar'));

  // minimizar / expandir a grade de colunas
  $('#btn-min-colunas').addEventListener('click', () => {
    const card = $('#card-colunas');
    const recolhido = card.classList.toggle('recolhido');
    $('#btn-min-colunas').textContent = recolhido ? 'expandir' : 'minimizar';
  });
}

/* ---------------------------------------------------------------- boot */
function sugerir(tipo = '') {
  const t = String(tipo).toLowerCase();
  if (/bool/.test(t)) return 'sim_nao';
  if (/timestamp|datetime/.test(t)) return 'datahora';
  if (/date/.test(t)) return 'data';
  if (/^time|hora/.test(t)) return 'hora';
  if (/int|serial|long|short/.test(t)) return 'codigo';
  if (/decimal|numeric|money|double|float|real|number/.test(t)) return 'moeda';
  return 'texto';
}

async function iniciar() {
  ligarEventos();
  try {
    const saude = await api('/api/health');
    $('#versao').textContent = `v${saude.versao}`;
    $('#status-servidor').textContent = 'servidor ok';
    $('#status-servidor').classList.add('ok');
    S.prevLimit = saude.prevLimit || 500;
    $('#prev-limit').textContent = S.prevLimit;

    const cat = await api('/api/catalogo');
    S.formatos = cat.formatos;
    const { bancos } = await api('/api/bancos');
    S.bancos = bancos;
    preencherBancos();
    limparFormulario();
    await carregarConexoes();
    renderFontes();
  } catch (e) {
    $('#status-servidor').textContent = 'offline';
    $('#status-servidor').classList.add('erro');
    toast(e.message, 'erro');
  }
}

iniciar();
