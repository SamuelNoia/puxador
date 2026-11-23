// Verifica se todos os IDs usados pelo app.js existem no index.html
// e se as classes geradas pelo JS têm regra no CSS. Roda sem navegador.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/app.css'), 'utf8');

let problemas = 0;

const ids = [...new Set([...js.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]))];
const semHtml = ids.filter((id) => !new RegExp(`id="${id}"`).test(html));
console.log(`IDs usados no JS: ${ids.length} | ausentes no HTML: ${semHtml.length}`);
if (semHtml.length) {
  problemas += semHtml.length;
  console.log('  FALTANDO:', semHtml.join(', '));
}

const classesHtml = [...new Set([...html.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .filter(Boolean))];
const classesJs = [...new Set([...js.matchAll(/class="([^"$]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .filter((c) => c && !c.includes('${')))];
const classes = [...new Set([...classesHtml, ...classesJs])];
const semCss = classes.filter((c) => !['tela', 'ativa'].includes(c) && !css.includes(`.${c}`));
console.log(`Classes: ${classes.length} | sem regra no CSS: ${semCss.length}`);
if (semCss.length) {
  problemas += semCss.length;
  console.log('  sem CSS:', semCss.join(', '));
}

// caracteres tipicos de arquivo salvo em ANSI por engano
const mojibake = ['\u00c3', '\u00e2\u20ac', '\u00c2\u00b7'].filter((s) => js.includes(s) || html.includes(s));
console.log(`Textos corrompidos (mojibake): ${mojibake.length}`);
if (mojibake.length) problemas += 1;

// selects longos precisam estar dentro do combo com busca
const selectsComBusca = ['t1', 'c1', 't2', 'c2', 'coluna'];
const semBusca = selectsComBusca.filter((p) => !js.includes(`comBusca(\`<select data-papel="${p}">`));
console.log(`Selects com campo de busca: ${selectsComBusca.length - semBusca.length}/${selectsComBusca.length}`);
if (semBusca.length) {
  problemas += semBusca.length;
  console.log('  sem busca:', semBusca.join(', '));
}
if (!js.includes("classList.contains('combo-busca')")) {
  problemas += 1;
  console.log('  FALTANDO: o filtro global do .combo-busca');
}

console.log(problemas ? `\n${problemas} problema(s) de interface.\n` : '\nInterface consistente.\n');
process.exit(problemas ? 1 : 0);
