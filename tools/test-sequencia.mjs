// Testa a ordenação por sequência extraindo a função real de public/app.js.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');

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

const fn = new Function(`${extrair('ordenarPorSequencia')}; return ordenarPorSequencia;`)();

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas += 1; console.log(`  FALHOU ${nome}${extra ? ` — ${extra}` : ''}`); }
};
const seqs = (lista) => lista.map((m) => m.seq);

// 1) numeração padrão
ok('numera 1..N na ordem informada', JSON.stringify(seqs(fn([
  { nome: 'Id', seq: 1 },
  { nome: 'Descricao', seq: 2 },
  { nome: 'Marca', seq: 3 },
]))) === '[1,2,3]');

// 2) usuário troca a ordem
const trocado = fn([
  { nome: 'Id', seq: 3 },
  { nome: 'Descricao', seq: 1 },
  { nome: 'Marca', seq: 2 },
]);
ok('respeita a sequência digitada', trocado.map((m) => m.nome).join(',') === 'Descricao,Marca,Id', trocado.map((m) => m.nome).join(','));

// 3) campo vazio é preenchido com número sem uso
const vazio = fn([
  { nome: 'Id', seq: 1 },
  { nome: 'Descricao', seq: '' },
  { nome: 'Marca', seq: 2 },
]);
ok('vazio vai para o fim e recebe número', vazio.find((m) => m.nome === 'Descricao').seq === 3);
ok('sem buraco na numeração', JSON.stringify(seqs(vazio)) === '[1,2,3]');

// 4) número repetido não gera duplicidade
const repetido = fn([
  { nome: 'Id', seq: 1, seqEditado: 1 },
  { nome: 'Descricao', seq: 1, seqEditado: 9 },
  { nome: 'Marca', seq: 2 },
]);
ok('repetido é resolvido sem duplicar', new Set(seqs(repetido)).size === 3, JSON.stringify(seqs(repetido)));
ok('quem editou por último vence o empate', repetido[0].nome === 'Descricao', repetido.map((m) => m.nome).join(','));

// 5) buraco na numeração (1, 5, 9) é compactado
const buraco = fn([
  { nome: 'A', seq: 9 },
  { nome: 'B', seq: 1 },
  { nome: 'C', seq: 5 },
]);
ok('compacta buracos mantendo a ordem', buraco.map((m) => m.nome).join(',') === 'B,C,A', buraco.map((m) => m.nome).join(','));

// 6) valores inválidos (0, negativo, texto)
const invalidos = fn([
  { nome: 'A', seq: 0 },
  { nome: 'B', seq: -3 },
  { nome: 'C', seq: 'abc' },
  { nome: 'D', seq: 2 },
]);
ok('inválidos vão para o fim', invalidos[0].nome === 'D');
ok('numeração final sem zero', seqs(invalidos).every((n) => n >= 1 && n <= 4), JSON.stringify(seqs(invalidos)));

console.log(`\n${falhas ? `FALHAS: ${falhas}` : 'todos os testes de sequência ok'}\n`);
process.exit(falhas ? 1 : 0);
