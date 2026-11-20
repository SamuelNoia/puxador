import fs from 'node:fs';

const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/app.css', 'utf8');

// IDs usados pelo JS
const ids = [...js.matchAll(/\$\('#([\w-]+)'\)/g)].map((m) => m[1]);
const unicos = [...new Set(ids)];
const faltando = unicos.filter((id) => !new RegExp(`id="${id}"`).test(html));
console.log(`IDs referenciados no JS: ${unicos.length} | ausentes no HTML: ${faltando.length}`);
if (faltando.length) console.log('  FALTANDO:', faltando.join(', '));

// classes usadas no HTML que deveriam existir no CSS (ignora utilitarias)
const classes = [...new Set([...html.matchAll(/class="([^"]+)"/g)]
  .flatMap((m) => m[1].split(/\s+/))
  .filter((c) => c && !['tela', 'ativa'].includes(c)))];
const semCss = classes.filter((c) => !css.includes(`.${c}`));
console.log(`Classes no HTML: ${classes.length} | sem regra no CSS: ${semCss.length}`);
if (semCss.length) console.log('  sem CSS:', semCss.join(', '));

// elementos que o JS cria e o CSS precisa estilizar
for (const c of ['juncao', 'chip', 'tag-join', 'filtro-valores', 'input-ate']) {
  console.log(`  .${c} no CSS: ${css.includes(`.${c}`)}`);
}
