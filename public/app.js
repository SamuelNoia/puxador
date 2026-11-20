// Puxador de Dados - interface (vanilla JS, sem build).

const S = {
  bancos: [],
  formatos: [],
  conexoes: [],
  conexaoId: null,
  conexao: null,
  schema: null,
  tabela: null,
  tabelas: [],
  colunasMain: [],
  juncoes: [],          // [{ tabela, esquema, esquerda, direita, colunas:[{nome,tipo}], traz:[nomes], carregando }]
  mapa: new Map(),      // chave -> { marcada, destino, formato, decimais, rotulo, tipo, coluna, tabela }
  filtros: [],          // [{ key, op, value, value2 }]
  ordemKey: '',
  dir: 'asc',
  resultado: null,
  scroll: {},
  telaAtual: 'conexoes',
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
    throw new Error('Acesso nÃ£o autorizado.');
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
// Guarda a posicao de rolagem de cada tela e devolve ao voltar.
function irPara(tela) {
  if (S.telaAtual === tela) return;
  S.scroll[S.telaAtual] = window.scrollY;
  S.telaAtual = tela;

  $$('.tela').forEach((t) => t.classList.toggle('ativa', t.id === `tela-${tela}`));
  $$('.tab').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));

  const destino = S.scroll[tela] || 0;
  requestAnimationFrame(() => window.scrollTo({ top: destino, behavior: 'instant' in window ? 'instant' : 'auto' }));
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
      + 'NÃ£o use alias do IBExpert nem coloque o IP aqui.',
  }[kind] || '';
  $('#ajuda-base').textContent = ajuda;
  $('#label-base').textContent = kind === 'firebird'
    ? 'Caminho do banco no servidor (.fdb / .eco)'
    : 'Base de dados';
  $('#base').placeholder = kind === 'firebird' ? 'C:\\ecosis\\dados\\ECODADOS.ECO' : 'nome_da_base';
  $('#campo-schema').hidden = kind !== 'postgres';
}

/** Valida o formulÃ¡rio antes de enviar. Devolve a mensagem de erro ou null. */
function validarFormulario(corpo) {
  if (corpo.kind === 'firebird') {
    const caminho = String(corpo.base || '').trim();
    const hostNoCaminho = /^([^\\/]{2,}):[\\/]/.exec(caminho);
    if (hostNoCaminho && !/^[A-Za-z]$/.test(hostNoCaminho[1])) {
      return 'O caminho nÃ£o deve incluir o servidor. Deixe o IP sÃ³ no campo "Servidor" '
        + 'e aqui apenas o caminho do arquivo â€” ex.: C:\\ecosis\\dados\\ECODADOS.ECO';
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
  $('#titulo-form').textContent = 'Nova conexÃ£o';
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
    alvo.innerHTML = '<p class="muted vazio">Nenhuma conexÃ£o ainda. Cadastre a primeira ao lado.</p>';
    return;
  }
  alvo.innerHTML = S.conexoes.map((c) => `
    <div class="item-conexao" data-id="${c.id}">
      <span class="tag">${esc(c.kind)}</span>
      <div class="dados">
        <strong>${esc(c.nome)}</strong>
        <span>${esc(c.host)}:${c.port} Â· ${esc(c.database)} Â· ${esc(c.username)}</span>
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
  sel.innerHTML = '<option value="">â€” escolha â€”</option>' + S.conexoes
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

/* ---------------------------------------------------------------- tabelas e colunas */
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
  $('#sel-tabela').innerHTML = '<option>carregandoâ€¦</option>';
  try {
    const q = S.schema ? `?schema=${encodeURIComponent(S.schema)}` : '';
    const { tabelas } = await api(`/api/conexoes/${S.conexaoId}/tabelas${q}`);
    S.tabelas = tabelas;
    renderTabelas();
  } catch (e) {
    $('#sel-tabela').innerHTML = '';
    toast(e.message, 'erro');
  }
}

function renderTabelas() {
  const filtro = $('#filtro-tabela').value.trim().toLowerCase();
  const lista = (S.tabelas || []).filter((t) => !filtro || t.nome.toLowerCase().includes(filtro));
  $('#sel-tabela').innerHTML = lista
    .map((t) => `<option value="${esc(t.nome)}">${esc(t.nome)}${t.tipo === 'view' ? ' (view)' : ''}${t.linhas ? ` Â· ~${t.linhas}` : ''}</option>`)
    .join('');
}

async function colunasDaTabela(tabela) {
  const q = new URLSearchParams({ tabela });
  if (S.schema) q.set('schema', S.schema);
  const { colunas } = await api(`/api/conexoes/${S.conexaoId}/colunas?${q}`);
  return colunas;
}

async function carregarColunas(tabela) {
  if (!tabela) return;
  $('#card-colunas').hidden = true;
  $('#card-juncoes').hidden = true;
  $('#card-filtros').hidden = true;
  try {
    const colunas = await colunasDaTabela(tabela);
    S.tabela = tabela;
    S.colunasMain = colunas;
    S.juncoes = [];
    S.mapa.clear();
    S.filtros = [];
    reconstruirMapa();
    S.ordemKey = colunas.find((c) => c.chave === 'PRI')?.nome || colunas[0]?.nome || '';
    S.dir = 'asc';
    renderColunas();
    renderJuncoes();
    renderFiltros();
    renderOrdem();
    $('#card-colunas').hidden = false;
    $('#card-juncoes').hidden = false;
    $('#card-filtros').hidden = false;
  } catch (e) {
    toast(e.message, 'erro');
  }
}

/**
 * Recria S.mapa a partir das colunas da tabela principal + colunas trazidas pelos relacionamentos,
 * preservando o que o usuario ja configurou (chave = nome unico da coluna).
 */
function reconstruirMapa() {
  const novo = new Map();

  for (const c of S.colunasMain) {
    const antigo = S.mapa.get(c.nome);
    novo.set(c.nome, antigo || {
      marcada: true,
      destino: c.nome,
      formato: sugerir(c.tipo),
      decimais: '',
      rotulo: c.nome,
      tipo: c.tipo,
      coluna: c.nome,
      tabela: null,
      grupo: 'principal',
    });
    novo.get(c.nome).tipo = c.tipo;
  }

  S.juncoes.forEach((j, i) => {
    const alias = j.alias || `j${i + 1}`;
    for (const nome of j.traz || []) {
      const info = (j.colunas || []).find((c) => c.nome === nome) || { nome, tipo: '' };
      const chave = `${alias}.${nome}`;
      const antigo = S.mapa.get(chave);
      novo.set(chave, antigo || {
        marcada: true,
        destino: `${j.tabela}_${nome}`,
        formato: sugerir(info.tipo),
        decimais: '',
        rotulo: `${j.tabela} â†’ ${nome}`,
        tipo: info.tipo,
        coluna: nome,
        tabela: alias,
        grupo: j.tabela,
      });
      const atual = novo.get(chave);
      atual.tipo = info.tipo;
      atual.rotulo = `${j.tabela} â†’ ${nome}`;
      atual.tabela = alias;
      atual.grupo = j.tabela;
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
  corpo.innerHTML = [...S.mapa.entries()].map(([chave, m]) => {
    const opcoes = S.formatos
      .map((f) => `<option value="${f.id}" ${m.formato === f.id ? 'selected' : ''}>${esc(f.label)}</option>`)
      .join('');
    const etiqueta = m.grupo === 'principal' ? '' : ` <span class="tag tag-join">${esc(m.grupo)}</span>`;
    return `
      <tr data-chave="${esc(chave)}" class="${m.marcada ? '' : 'desmarcada'}">
        <td><input type="checkbox" data-papel="marcar" ${m.marcada ? 'checked' : ''} /></td>
        <td><strong>${esc(m.coluna)}</strong>${m.grupo === 'principal' ? '' : etiqueta}</td>
        <td class="tipo-col">${esc(m.tipo)}</td>
        <td><input type="text" data-papel="destino" value="${esc(m.destino)}" /></td>
        <td><select data-papel="formato">${opcoes}</select></td>
        <td><input type="number" data-papel="decimais" value="${esc(m.decimais)}" min="0" max="6" /></td>
      </tr>`;
  }).join('');
  atualizarResumoColunas();
}

function atualizarResumoColunas() {
  const marcadas = [...S.mapa.values()].filter((m) => m.marcada).length;
  $('#resumo-colunas').textContent = `${marcadas} de ${S.mapa.size} coluna(s)`;
}

/* ---------------------------------------------------------------- relacionamentos */
function adicionarJuncao() {
  const sugestao = (S.tabelas || []).find((t) => !S.juncoes.some((j) => j.tabela === t.nome))?.nome || '';
  S.proxJuncaoId = (S.proxJuncaoId || 0) + 1;
  S.juncoes.push({ id: S.proxJuncaoId, alias: `j${S.proxJuncaoId}`, tabela: '', esquema: S.schema, esquerda: '', direita: '', colunas: [], traz: [], carregando: false });
  renderJuncoes();
  if (sugestao) trocarTabelaJuncao(S.juncoes.length - 1, sugestao);
}

function removerJuncao(i) {
  S.juncoes.splice(i, 1);
  reconstruirMapa();
  renderJuncoes();
  renderColunas();
  renderFiltros();
  renderOrdem();
}

function palpiteColunaPrincipal(tabelaRel) {
  const alvo = String(tabelaRel).toLowerCase();
  const achou = S.colunasMain.find((c) => c.nome.toLowerCase() === `id${alvo}`)
    || S.colunasMain.find((c) => c.nome.toLowerCase() === `id_${alvo}`)
    || S.colunasMain.find((c) => c.nome.toLowerCase().endsWith(`id${alvo}`));
  if (achou) return achou.nome;
  const idLike = S.colunasMain.find((c) => /^id/i.test(c.nome) && /fabric|fornec|cliente|grupo|marca/i.test(c.nome));
  return idLike ? idLike.nome : '';
}

async function trocarTabelaJuncao(i, tabela) {
  const j = S.juncoes[i];
  if (!j) return;
  j.tabela = tabela;
  j.carregando = true;
  j.colunas = [];
  j.traz = [];
  j.direita = '';
  j.esquerda = palpiteColunaPrincipal(tabela);
  renderJuncoes();
  try {
    const colunas = await colunasDaTabela(tabela);
    j.colunas = colunas;
    const pk = colunas.find((c) => c.chave === 'PRI')?.nome
      || colunas.find((c) => c.nome.toLowerCase() === 'id')?.nome
      || colunas[0]?.nome || '';
    j.direita = pk;
    // sugere trazer a primeira coluna de texto (normalmente a descricao)
    const texto = colunas.find((c) => /char|text|varchar|string/i.test(c.tipo) && c.nome.toLowerCase() !== pk.toLowerCase());
    j.traz = texto ? [texto.nome] : [];
  } catch (e) {
    toast(e.message, 'erro');
  } finally {
    j.carregando = false;
    reconstruirMapa();
    renderJuncoes();
    renderColunas();
    renderFiltros();
    renderOrdem();
  }
}

function renderJuncoes() {
  const alvo = $('#lista-juncoes');
  if (!S.juncoes.length) {
    alvo.innerHTML = '<p class="muted vazio">Nenhum relacionamento. Use â€œ+ relacionamentoâ€ para trazer, por exemplo, o nome do fabricante no lugar do IdFabricante.</p>';
    return;
  }
  alvo.innerHTML = S.juncoes.map((j, i) => {
    const tabelas = '<option value="">â€” tabela â€”</option>' + (S.tabelas || [])
      .map((t) => `<option value="${esc(t.nome)}" ${t.nome === j.tabela ? 'selected' : ''}>${esc(t.nome)}</option>`)
      .join('');
    const colsMain = '<option value="">â€” coluna da tabela â€”</option>' + S.colunasMain
      .map((c) => `<option value="${esc(c.nome)}" ${c.nome === j.esquerda ? 'selected' : ''}>${esc(c.nome)}</option>`)
      .join('');
    const colsJoin = '<option value="">â€” coluna da outra tabela â€”</option>' + (j.colunas || [])
      .map((c) => `<option value="${esc(c.nome)}" ${c.nome === j.direita ? 'selected' : ''}>${esc(c.nome)}</option>`)
      .join('');
    const chips = (j.colunas || [])
      .filter((c) => /char|text|varchar|int|date|numeric|decimal/i.test(c.tipo))
      .map((c) => `<label class="chip"><input type="checkbox" data-papel="trazer" data-col="${esc(c.nome)}" ${j.traz.includes(c.nome) ? 'checked' : ''}/> ${esc(c.nome)}</label>`)
      .join('');

    return `
      <div class="juncao" data-i="${i}">
        <div class="juncao-linha">
          <label class="field">
            <span>Tabela relacionada</span>
            <select data-papel="tabela">${tabelas}</select>
          </label>
          <span class="juncao-eq">ligada por</span>
          <label class="field">
            <span>Coluna desta tabela</span>
            <select data-papel="esquerda">${colsMain}</select>
          </label>
          <span class="juncao-eq">=</span>
          <label class="field">
            <span>Coluna da outra tabela</span>
            <select data-papel="direita">${colsJoin}</select>
          </label>
          <button class="btn sm danger" data-papel="remover" title="remover">Ã—</button>
        </div>
        <div class="juncao-cols">
          ${j.carregando ? '<span class="muted">carregando colunasâ€¦</span>' : (chips || '<span class="muted">escolha a tabela para ver as colunas</span>')}
          <span class="muted">â† marque o que deve aparecer na planilha</span>
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
  ['eq', 'igual a'], ['ne', 'diferente de'], ['like', 'contÃ©m'], ['starts', 'comeÃ§a com'],
  ['gt', 'maior que'], ['gte', 'maior ou igual'], ['lt', 'menor que'], ['lte', 'menor ou igual'],
  ['between', 'entre (perÃ­odo)'], ['null', 'estÃ¡ vazio'], ['notnull', 'nÃ£o estÃ¡ vazio'],
];

function valorParaInput(valor, tipo) {
  const s = String(valor ?? '');
  if (ehDataHora(tipo) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.slice(0, 16).replace(' ', 'T');
  if (ehData(tipo) && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function inputValor(f, i, papel, valor, tipo) {
  const semValor = ['null', 'notnull'].includes(f.op);
  if (semValor) return '';
  const classe = papel === 'valor' ? '' : ' class="input-ate"';
  if (ehDataHora(tipo)) {
    return `<input type="datetime-local" data-i="${i}" data-papel="${papel}" value="${esc(valorParaInput(valor, tipo))}"${classe} />`;
  }
  if (ehData(tipo)) {
    return `<input type="date" data-i="${i}" data-papel="${papel}" value="${esc(valorParaInput(valor, tipo))}"${classe} />`;
  }
  return `<input type="text" data-i="${i}" data-papel="${papel}" value="${esc(valor ?? '')}" placeholder="valor"${classe} />`;
}

function renderFiltros() {
  const alvo = $('#lista-filtros');
  if (!S.filtros.length) {
    alvo.innerHTML = '<p class="muted vazio">Nenhum filtro. Todos os registros serÃ£o puxados.</p>';
    return;
  }
  alvo.innerHTML = S.filtros.map((f, i) => {
    const tipo = tipoDoKey(f.key);
    const opcoes = OPERADORES_UI
      .map(([v, l]) => `<option value="${v}" ${f.op === v ? 'selected' : ''}>${l}</option>`)
      .join('');
    const colunas = [...S.mapa.entries()]
      .map(([chave, m]) => `<option value="${esc(chave)}" ${f.key === chave ? 'selected' : ''}>${esc(m.grupo === 'principal' ? m.coluna : m.rotulo)}</option>`)
      .join('');
    const entre = f.op === 'between';
    return `
      <div class="filtro-linha ${entre ? 'com-ate' : ''}" data-i="${i}">
        <select data-papel="coluna">${colunas}</select>
        <select data-papel="op">${opcoes}</select>
        <div class="filtro-valores">
          ${inputValor(f, i, 'valor', f.value, tipo)}
          ${entre ? inputValor(f, i, 'valor2', f.value2, tipo) : ''}
        </div>
        <button class="btn sm danger" data-papel="remover" title="remover">Ã—</button>
      </div>`;
  }).join('');
}

function renderOrdem() {
  $('#sel-ordem').innerHTML = '<option value="">â€” sem ordenaÃ§Ã£o â€”</option>' + [...S.mapa.entries()]
    .map(([chave, m]) => `<option value="${esc(chave)}" ${S.ordemKey === chave ? 'selected' : ''}>${esc(m.grupo === 'principal' ? m.coluna : m.rotulo)}</option>`)
    .join('');
  $('#sel-dir').value = S.dir;
}

/* ---------------------------------------------------------------- puxar */
function corpoPuxar(extra = {}) {
  const selecao = [];
  const mapeamento = [];

  for (const [chave, m] of S.mapa) {
    if (!m.marcada) continue;                 // colunas desmarcadas nao vao no SELECT
    const alias = chave.replace(/[^\w]/g, '_');
    selecao.push({ alias, column: m.coluna, table: m.tabela });
    mapeamento.push({
      origem: alias,
      destino: (m.destino || m.coluna).trim(),
      formato: m.formato || 'original',
      decimais: m.decimais === '' ? undefined : Number(m.decimais),
    });
  }

  const filtros = S.filtros
    .filter((f) => f.key && !['null', 'notnull'].includes(f.op))
    .map((f) => {
      const m = S.mapa.get(f.key) || {};
      let value = f.value;
      let value2 = f.value2;
      // "entre" com data e coluna de data/hora: inclui o dia final inteiro
      if (f.op === 'between' && ehDataHora(m.tipo) && /^\d{4}-\d{2}-\d{2}$/.test(String(value2 || ''))) {
        value2 = `${value2} 23:59:59`;
      }
      return { table: m.tabela || null, column: m.coluna, op: f.op, value, value2 };
    })
    .concat(S.filtros
      .filter((f) => f.key && ['null', 'notnull'].includes(f.op))
      .map((f) => {
        const m = S.mapa.get(f.key) || {};
        return { table: m.tabela || null, column: m.coluna, op: f.op };
      }));

  const ordemBase = S.ordemKey ? S.mapa.get(S.ordemKey) : null;

  return {
    conexaoId: S.conexaoId,
    schema: S.schema || undefined,
    tabela: S.tabela,
    selecao,
    juncoes: S.juncoes
      .filter((j) => j.tabela && j.esquerda && j.direita)
      .map((j) => ({ alias: j.alias, tabela: j.tabela, esquema: j.esquema, esquerda: j.esquerda, direita: j.direita })),
    filtros,
    ordem: ordemBase ? { table: ordemBase.tabela, column: ordemBase.coluna, dir: S.dir } : null,
    limite: Number($('#limite').value) || 0,
    mapeamento,
    tipos: [...S.mapa.entries()].map(([chave, m]) => ({ nome: chave.replace(/[^\w]/g, '_'), tipo: m.tipo })),
    ...extra,
  };
}

async function puxarDados() {
  const btn = $('#btn-previa');
  btn.disabled = true;
  btn.textContent = 'Puxandoâ€¦';
  try {
    const dados = await api('/api/puxar', { method: 'POST', body: corpoPuxar() });
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
  btn.textContent = 'Contandoâ€¦';
  try {
    const { total } = await api('/api/puxar/contar', { method: 'POST', body: corpoPuxar() });
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
  if (dados.truncado) info.push(`<span class="tag">prÃ©via limitada a ${dados.limite}</span>`);
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
  try {
    const resp = await fetch('/api/exportar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpoPuxar({ formato, arquivo: S.tabela, titulo: S.tabela })),
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
  const nome = prompt('Nome do mapeamento (ex.: Produtos ERP):', `${S.tabela}`);
  if (!nome) return;
  try {
    await api('/api/mapeamentos', {
      method: 'POST',
      body: {
        conexaoId: S.conexaoId,
        nome,
        schema: S.schema,
        tabela: S.tabela,
        config: {
          colunas: corpoPuxar().mapeamento,
          filtros: S.filtros,
          juncoes: corpoPuxar().juncoes,
          limite: Number($('#limite').value) || 0,
        },
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
      toast(id ? 'ConexÃ£o atualizada.' : 'ConexÃ£o salva.');
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
    alvo.textContent = 'Testandoâ€¦';
    try {
      const id = $('#conexao-id').value;
      const r = id && !corpo.senha
        ? await api(`/api/conexoes/${id}/testar`, { method: 'POST', body: corpo })
        : await api('/api/conexoes/testar', { method: 'POST', body: corpo });
      alvo.className = 'aviso ok';
      alvo.textContent = `Conectado em ${r.ms} ms Â· versÃ£o ${r.versao || 'â€”'}`;
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
      irPara('puxar');
      await carregarSchemas();
      await carregarTabelas();
      return;
    }
    if (acao === 'testar') {
      try {
        const r = await api(`/api/conexoes/${id}/testar`, { method: 'POST', body: {} });
        toast(`OK Â· ${r.versao || 'conectado'} (${r.ms} ms)`);
      } catch (e) {
        toast(e.message, 'erro');
      }
      return;
    }
    if (acao === 'excluir') {
      if (!confirm('Excluir esta conexÃ£o?')) return;
      try {
        await api(`/api/conexoes/${id}`, { method: 'DELETE' });
        toast('ConexÃ£o excluÃ­da.');
        await carregarConexoes();
      } catch (e) {
        toast(e.message, 'erro');
      }
    }
  });

  $('#sel-conexao').addEventListener('change', async () => {
    S.conexaoId = Number($('#sel-conexao').value) || null;
    S.conexao = S.conexoes.find((c) => c.id === S.conexaoId) || null;
    S.tabela = null;
    S.colunasMain = [];
    S.juncoes = [];
    S.mapa.clear();
    $('#card-colunas').hidden = true;
    $('#card-juncoes').hidden = true;
    $('#card-filtros').hidden = true;
    if (!S.conexaoId) return;
    await carregarSchemas();
    await carregarTabelas();
  });

  $('#sel-schema').addEventListener('change', async () => {
    S.schema = $('#sel-schema').value;
    await carregarTabelas();
  });

  $('#filtro-tabela').addEventListener('input', renderTabelas);
  $('#sel-tabela').addEventListener('change', () => carregarColunas($('#sel-tabela').value));

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
    }
  });

  $('#btn-todas').addEventListener('click', () => {
    for (const m of S.mapa.values()) m.marcada = true;
    renderColunas();
  });
  $('#btn-nenhuma').addEventListener('click', () => {
    for (const m of S.mapa.values()) m.marcada = false;
    renderColunas();
  });

  $('#btn-add-juncao').addEventListener('click', adicionarJuncao);

  $('#lista-juncoes').addEventListener('change', (ev) => {
    const bloco = ev.target.closest('.juncao');
    if (!bloco) return;
    const i = Number(bloco.dataset.i);
    const j = S.juncoes[i];
    if (!j) return;
    const papel = ev.target.dataset.papel;

    if (papel === 'tabela') {
      trocarTabelaJuncao(i, ev.target.value);
      return;
    }
    if (papel === 'esquerda') { j.esquerda = ev.target.value; return; }
    if (papel === 'direita') { j.direita = ev.target.value; return; }
    if (papel === 'trazer') {
      const col = ev.target.dataset.col;
      j.traz = ev.target.checked
        ? [...new Set([...j.traz, col])]
        : j.traz.filter((c) => c !== col);
      reconstruirMapa();
      renderColunas();
      renderFiltros();
      renderOrdem();
    }
  });

  $('#lista-juncoes').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="remover"]');
    if (!btn) return;
    removerJuncao(Number(btn.closest('.juncao').dataset.i));
  });

  $('#btn-add-filtro').addEventListener('click', () => {
    if (!S.mapa.size) return toast('Escolha uma tabela primeiro.', 'erro');
    const primeiro = [...S.mapa.keys()][0];
    S.filtros.push({ key: primeiro, op: 'eq', value: '', value2: '' });
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
      // se trocar para uma coluna de data, limpa o valor antigo
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
    if (!f) return;
    f[papel] = ev.target.value;
  });

  $('#lista-filtros').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="remover"]');
    if (!btn) return;
    const linha = btn.closest('.filtro-linha');
    S.filtros.splice(Number(linha.dataset.i), 1);
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
}

/* ---------------------------------------------------------------- boot */
async function iniciar() {
  ligarEventos();
  try {
    const saude = await api('/api/health');
    $('#versao').textContent = `v${saude.versao}`;
    $('#status-servidor').textContent = 'servidor ok';
    $('#status-servidor').classList.add('ok');

    const cat = await api('/api/catalogo');
    S.formatos = cat.formatos;
    const { bancos } = await api('/api/bancos');
    S.bancos = bancos;
    preencherBancos();
    limparFormulario();
    await carregarConexoes();
  } catch (e) {
    $('#status-servidor').textContent = 'offline';
    $('#status-servidor').classList.add('erro');
    toast(e.message, 'erro');
  }
}

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

iniciar();

