// Testa o filtro dos selects (combobox) usando o código real de public/app.js.
// Precisa de jsdom (dependência de desenvolvimento): npm install && npm run test:busca
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

/** Extrai o texto de uma função do app.js contando as chaves. */
function extrair(nome) {
  const inicio = src.indexOf(`function ${nome}(`);
  if (inicio < 0) throw new Error(`funcao ${nome} nao encontrada em public/app.js`);
  let i = src.indexOf('{', src.indexOf(')', inicio));
  let nivel = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === '{') nivel += 1;
    else if (src[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return src.slice(inicio, i + 1);
    }
  }
  throw new Error(`fim da funcao ${nome} nao encontrado`);
}

const codigo = [extrair('normalizarBusca'), extrair('filtrarSelect')].join('\n');

const dom = new JSDOM(`<!doctype html><body>
  <div class="combo">
    <input class="combo-busca" />
    <select id="s">
      <option value="">— escolha —</option>
      <option value="1">item · Id</option>
      <option value="2">item · Descricao</option>
      <option value="3">item · Descrição</option>
      <option value="4">fabricante · Id</option>
      <option value="5">fabricante · Descricao</option>
    </select>
  </div></body>`);

const { window } = dom;
const fn = new Function('window', 'document', 'Event', `${codigo}; return { normalizarBusca, filtrarSelect };`);
const { normalizarBusca, filtrarSelect } = fn(window, window.document, window.Event);

const select = window.document.getElementById('s');
let falhas = 0;
const ok = (nome, cond) => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas += 1; console.log(`  FALHOU ${nome}`); }
};
const visiveis = () => [...select.options].filter((o) => o.style.display !== 'none').map((o) => o.textContent);

ok('normaliza maiusculas', normalizarBusca('DESCRICAO') === 'descricao');
ok('remove acentos', normalizarBusca('Descrição') === 'descricao');
ok('remove acentos (maiusculo)', normalizarBusca('ÁÉÍÓÚÇ') === 'aeiouc');

filtrarSelect(select, 'descricao');
ok('busca sem acento encontra a opcao com acento', visiveis().some((t) => t.includes('Descrição')));

filtrarSelect(select, 'FABRICANTE');
ok('ignora maiusculas/minusculas', visiveis().filter((t) => t.includes('·')).every((t) => t.toLowerCase().includes('fabricante')));
ok('esconde as demais opcoes', visiveis().filter((t) => t.includes('·')).length === 2);

filtrarSelect(select, '');
ok('limpar a busca mostra tudo', visiveis().length === 6);

select.value = '2';
filtrarSelect(select, 'fabricante');
ok('mantem a opcao selecionada visivel', visiveis().some((t) => t.includes('item · Descricao')));

console.log(`\n${falhas ? `FALHAS: ${falhas}` : 'todos os testes de busca ok'}\n`);
process.exit(falhas ? 1 : 0);
