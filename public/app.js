// Puxador de Dados - interface (vanilla JS, sem build).

const S = {
  bancos: [],
  formatos: [],
  conexoes: [],
  conexaoId: null,
  conexao: null,
  schema: null,
  tabela: null,
  colunas: [],
  mapa: new Map(),      // nome -> { marcada, destino, formato, decimais }
  filtros: [],
  ordem: '',
  dir: 'asc',
  limite: 0,
  resultado: null,
  prevLimit: 500,
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
  $$('.tela').forEach((t) => t.classList.toggle('ativa', t.id === `tela-${tela}`));
  $$('.tab').forEach((b) => b.classList.toggle('ativo', b.dataset.tela === tela));
}

function bloquearResultado(bloquear) {
  const tab = $('.tab[data-tela="resultado"]');
  tab.disabled = bloquear;
}

/* ---------------------------------------------------------------- conexoes */
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

/** Valida o formulário antes de enviar. Devolve a mensagem de erro ou null. */
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
  ajustarCamposPorBanco();
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------------------------------------------------------------- puxar */
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
  $('#sel-tabela').innerHTML = '<option>carregando…</option>';
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
    .map((t) => `<option value="${esc(t.nome)}">${esc(t.nome)}${t.tipo === 'view' ? ' (view)' : ''}${t.linhas ? ` · ~${t.linhas}` : ''}</option>`)
    .join('');
}

async function carregarColunas(tabela) {
  if (!tabela) return;
  $('#card-colunas').hidden = true;
  $('#card-filtros').hidden = true;
  const q = new URLSearchParams({ tabela });
  if (S.schema) q.set('schema', S.schema);
  try {
    const { colunas } = await api(`/api/conexoes/${S.conexaoId}/colunas?${q}`);
    S.tabela = tabela;
    S.colunas = colunas;
    S.mapa.clear();
    for (const c of colunas) {
      S.mapa.set(c.nome, {
        marcada: true,
        destino: c.nome,
        formato: sugerir(c.tipo),
        decimais: '',
      });
    }
    S.filtros = [];
    S.ordem = colunas.find((c) => c.chave === 'PRI')?.nome || colunas[0]?.nome || '';
    S.dir = 'asc';
    renderColunas();
    renderFiltros();
    renderOrdem();
    $('#card-colunas').hidden = false;
    $('#card-filtros').hidden = false;
  } catch (e) {
    toast(e.message, 'erro');
  }
}

function renderColunas() {
  const corpo = $('#corpo-colunas');
  if (!S.colunas.length) {
    corpo.innerHTML = '<tr><td colspan="6" class="muted vazio">Sem colunas.</td></tr>';
    return;
  }
  corpo.innerHTML = S.colunas.map((c) => {
    const m = S.mapa.get(c.nome);
    const opcoes = S.formatos
      .map((f) => `<option value="${f.id}" ${m.formato === f.id ? 'selected' : ''}>${esc(f.label)}</option>`)
      .join('');
    return `
      <tr data-col="${esc(c.nome)}" class="${m.marcada ? '' : 'desmarcada'}">
        <td><input type="checkbox" data-papel="marcar" ${m.marcada ? 'checked' : ''} /></td>
        <td><strong>${esc(c.nome)}</strong>${c.chave ? ' <span class="tag">PK</span>' : ''}</td>
        <td class="tipo-col">${esc(c.tipo)}</td>
        <td><input type="text" data-papel="destino" value="${esc(m.destino)}" /></td>
        <td><select data-papel="formato">${opcoes}</select></td>
        <td><input type="number" data-papel="decimais" value="${esc(m.decimais)}" min="0" max="6" /></td>
      </tr>`;
  }).join('');
  atualizarResumoColunas();
}

function atualizarResumoColunas() {
  const marcadas = [...S.mapa.values()].filter((m) => m.marcada).length;
  $('#resumo-colunas').textContent = `${marcadas} de ${S.colunas.length} coluna(s)`;
}

function renderFiltros() {
  const alvo = $('#lista-filtros');
  if (!S.filtros.length) {
    alvo.innerHTML = '<p class="muted vazio">Nenhum filtro. Todos os registros serão puxados.</p>';
    return;
  }
  const ops = [
    ['eq', 'igual a'], ['ne', 'diferente de'], ['like', 'contém'], ['starts', 'começa com'],
    ['gt', 'maior que'], ['gte', 'maior ou igual'], ['lt', 'menor que'], ['lte', 'menor ou igual'],
    ['null', 'está vazio'], ['notnull', 'não está vazio'],
  ];
  alvo.innerHTML = S.filtros.map((f, i) => `
    <div class="filtro-linha" data-i="${i}">
      <select data-papel="coluna">
        ${S.colunas.map((c) => `<option value="${esc(c.nome)}" ${f.column === c.nome ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
      </select>
      <select data-papel="op">
        ${ops.map(([v, l]) => `<option value="${v}" ${f.op === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <input data-papel="valor" value="${esc(f.value ?? '')}" placeholder="valor" ${['null', 'notnull'].includes(f.op) ? 'disabled' : ''} />
      <button class="btn sm danger" data-papel="remover" title="remover">×</button>
    </div>`).join('');
}

function renderOrdem() {
  $('#sel-ordem').innerHTML = '<option value="">— sem ordenação —</option>' + S.colunas
    .map((c) => `<option value="${esc(c.nome)}" ${S.ordem === c.nome ? 'selected' : ''}>${esc(c.nome)}</option>`)
    .join('');
  $('#sel-dir').value = S.dir;
}

function mapeamentoAtual() {
  const lista = [];
  for (const [origem, m] of S.mapa) {
    if (!m.marcada) continue;
    lista.push({
      origem,
      destino: (m.destino || origem).trim(),
      formato: m.formato || 'original',
      decimais: m.decimais === '' ? undefined : Number(m.decimais),
    });
  }
  return lista;
}

function corpoPuxar(extra = {}) {
  return {
    conexaoId: S.conexaoId,
    schema: S.schema || undefined,
    tabela: S.tabela,
    colunas: [...S.mapa.entries()].filter(([, m]) => m.marcada).map(([n]) => n),
    filtros: S.filtros.filter((f) => f.column),
    ordem: S.ordem ? { column: S.ordem, dir: S.dir } : null,
    limite: Number($('#limite').value) || 0,
    mapeamento: mapeamentoAtual(),
    tipos: S.colunas.map((c) => ({ nome: c.nome, tipo: c.tipo })),
    ...extra,
  };
}

async function puxarDados() {
  const btn = $('#btn-previa');
  btn.disabled = true;
  btn.textContent = 'Puxando…';
  try {
    const dados = await api('/api/puxar', { method: 'POST', body: corpoPuxar() });
    S.resultado = dados;
    renderResultado(dados);
    bloquearResultado(false);
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
          colunas: mapeamentoAtual(),
          filtros: S.filtros,
          ordem: S.ordem ? { column: S.ordem, dir: S.dir } : null,
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
    S.tabela = null;
    S.colunas = [];
    S.mapa.clear();
    $('#card-colunas').hidden = true;
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
    const linha = ev.target.closest('tr[data-col]');
    if (!linha) return;
    const nome = linha.dataset.col;
    const m = S.mapa.get(nome);
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

  $('#btn-add-filtro').addEventListener('click', () => {
    if (!S.colunas.length) return toast('Escolha uma tabela primeiro.', 'erro');
    S.filtros.push({ column: S.colunas[0].nome, op: 'eq', value: '' });
    renderFiltros();
  });

  $('#lista-filtros').addEventListener('change', (ev) => {
    const linha = ev.target.closest('.filtro-linha');
    if (!linha) return;
    const f = S.filtros[Number(linha.dataset.i)];
    const papel = ev.target.dataset.papel;
    if (!f || !papel) return;
    if (papel === 'coluna') f.column = ev.target.value;
    if (papel === 'op') { f.op = ev.target.value; renderFiltros(); }
    if (papel === 'valor') f.value = ev.target.value;
  });
  $('#lista-filtros').addEventListener('input', (ev) => {
    const linha = ev.target.closest('.filtro-linha');
    if (!linha || ev.target.dataset.papel !== 'valor') return;
    const f = S.filtros[Number(linha.dataset.i)];
    if (f) f.value = ev.target.value;
  });
  $('#lista-filtros').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-papel="remover"]');
    if (!btn) return;
    const linha = btn.closest('.filtro-linha');
    S.filtros.splice(Number(linha.dataset.i), 1);
    renderFiltros();
  });

  $('#sel-ordem').addEventListener('change', () => { S.ordem = $('#sel-ordem').value; });
  $('#sel-dir').addEventListener('change', () => { S.dir = $('#sel-dir').value; });

  $('#btn-previa').addEventListener('click', puxarDados);
  $('#btn-contar').addEventListener('click', contarRegistros);
  $('#btn-export-xlsx').addEventListener('click', () => exportar('xlsx'));
  $('#btn-export-csv').addEventListener('click', () => exportar('csv'));
  $('#btn-salvar-mapa').addEventListener('click', salvarMapeamento);
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

iniciar();
