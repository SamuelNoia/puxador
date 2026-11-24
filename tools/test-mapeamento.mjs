// Testa o ciclo salvar -> reabrir de um mapeamento usando o app.js real num DOM (jsdom).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');

const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
const { window } = dom;

global.window = window;
global.document = window.document;
global.Event = window.Event;
global.HTMLElement = window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
window.scrollTo = () => {};
global.prompt = () => 'Mapa de teste';
global.confirm = () => true;

const conexao = { id: 1, nome: 'ERP', kind: 'mysql', host: 'h', port: 3306, database: 'db', username: 'u', temSenha: true, options: {} };
const mapeamento = {
  id: 7,
  conexaoId: 1,
  nome: 'Mapa salvo',
  tabela: 'item',
  schema: null,
  atualizadoEm: '2026-11-24T10:00:00.000Z',
  config: {
    fontes: [{ alias: 't0', tabela: 'item' }],
    colunas: [
      { alias: 't0', column: 'Id', origem: 't0_Id', destino: 'cod produto', formato: 'codigo', seq: 1 },
      { alias: 't0', column: 'Descricao', origem: 't0_Descricao', destino: 'descricao do item', formato: 'maiusculo', seq: 2 },
    ],
    filtros: [],
    juncoes: [],
    ordem: null,
    limite: 0,
    visual: { quebrarLinha: true, fonteTam: 9, orientacao: 'retrato' },
  },
};

const colunas = [
  { nome: 'Id', tipo: 'int', chave: 'PRI' },
  { nome: 'Descricao', tipo: 'varchar(255)', chave: '' },
  { nome: 'NumFabricante', tipo: 'varchar(255)', chave: '' },
];

let corpoSalvo = null;

global.fetch = async (url, opcoes = {}) => {
  const caminho = String(url);
  const responder = (dados) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => dados });

  if (caminho.includes('/api/health')) return responder({ ok: true, versao: '9.9.9', prevLimit: 500 });
  if (caminho.includes('/api/catalogo')) return responder({ formatos: [{ id: 'texto', label: 'Texto' }, { id: 'codigo', label: 'Codigo' }, { id: 'maiusculo', label: 'MAIUSCULO' }] });
  if (caminho.includes('/api/bancos')) return responder({ bancos: [{ kind: 'mysql', label: 'MySQL', defaultPort: 3306 }] });
  if (caminho.includes('/api/conexoes/1/tabelas')) return responder({ tabelas: [{ nome: 'item', tipo: 'table', linhas: 10 }] });
  if (caminho.includes('/api/conexoes/1/colunas')) return responder({ colunas });
  if (caminho.includes('/api/conexoes/1/schemas')) return responder({ schemas: [] });
  if (caminho.includes('/api/conexoes')) return responder({ conexoes: [conexao] });
  if (caminho.includes('/api/puxar')) return responder({
    ok: true,
    colunas: [{ destino: 'cod produto', origem: 't0_Id', formato: 'codigo' }],
    linhas: [{ 'cod produto': { value: '1', type: 's' } }],
    quantidade: 1,
    total: 1,
    ms: 1,
    sql: 'SELECT 1',
  });
  if (caminho.includes('/api/mapeamentos') && opcoes.method === 'POST') {
    corpoSalvo = JSON.parse(opcoes.body);
    return responder({ ok: true, id: 7, atualizado: true });
  }
  if (caminho.includes('/api/mapeamentos')) return responder({ mapeamentos: [mapeamento] });
  return responder({ ok: true });
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ate = async (cond, ms = 3000) => {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cond()) return true;
    await esperar(25);
  }
  return false;
};

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas += 1; console.log(`  FALHOU ${nome}${extra ? ` — ${extra}` : ''}`); }
};

await import(pathToFileURL(path.join(ROOT, 'public/app.js')).href);
await ate(() => document.querySelectorAll('[data-acao="usar-mapa"]').length > 0);
ok('lista de mapeamentos renderizada', document.querySelectorAll('[data-acao="usar-mapa"]').length === 1);

// abre o mapeamento salvo
document.querySelector('[data-acao="usar-mapa"]').click();
await ate(() => {
  const linhas = [...document.querySelectorAll('#corpo-colunas tr[data-chave]')];
  return linhas.length > 0 && !document.querySelector('#card-colunas').hidden;
});

const destinos = [...document.querySelectorAll('#corpo-colunas tr[data-chave]')]
  .filter((tr) => tr.querySelector('input[data-papel="marcar"]').checked)
  .map((tr) => tr.querySelector('input[data-papel="destino"]').value);

ok('reabre o nome na planilha salvo', destinos.includes('cod produto') && destinos.includes('descricao do item'), JSON.stringify(destinos));
ok('aplica a ordem (seq)', [...document.querySelectorAll('#corpo-colunas input[data-papel="seq"]')]
  .filter((i) => !i.disabled).map((i) => Number(i.value)).join(',') === '1,2');
ok('aplica as opções visuais (retrato, fonte 9)', document.querySelector('#vis-orientacao').value === 'retrato' && document.querySelector('#vis-fonte').value === '9');

// puxa os dados (stub) para liberar o botão de salvar, depois salva e confere o corpo enviado
document.querySelector('#btn-previa').click();
await ate(() => !document.querySelector('#btn-previa').disabled && document.querySelector('#tela-resultado').classList.contains('ativa'));
document.querySelector('#btn-salvar-mapa').click();
await esperar(200);

ok('salvar envia os nomes personalizados', Boolean(corpoSalvo)
  && corpoSalvo.config.colunas.some((c) => c.destino === 'cod produto')
  && corpoSalvo.config.colunas.some((c) => c.destino === 'descricao do item'),
  corpoSalvo ? JSON.stringify(corpoSalvo.config.colunas.map((c) => c.destino)) : 'nada enviado');

console.log(`\n${falhas ? `FALHAS: ${falhas}` : 'ciclo de mapeamento ok'}\n`);
process.exit(falhas ? 1 : 0);
