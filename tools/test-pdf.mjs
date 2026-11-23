// Testa o layout do PDF: colunas sem sobreposicao, descricao larga e numeros justos.
// Precisa de pdfjs-dist (dependencia de desenvolvimento): npm install && npm run test:pdf
import { gerarPdfTabela } from '../src/export.js';
import { larguraTexto, calcularLarguras } from '../src/pdf.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const TAM = 7.5;
const colunas = [
  'Id', 'Descricao', 'NumFabricante', 'NumOriginal',
  'item_valor_QtdAtual', 'item_valor_ValorCusto', 'item_valor_ValorVendaVarejo',
  'item_valor_MargemLucroBrutoVarejo', 'item_valor_FpMargemLiquidaVarejo',
];
const descricoes = [
  'SERVICO DE MAO DE OBRA',
  'ABRACADEIRA NYLON 200X2,5MM 100UND BRANCA',
  'CHAVE ALLEN HEXAGONAL 8MM LONGA',
  'COLA ARALDITE TEKBOND HOBBY 16G',
  'LUVA ALGODAO FERTAK PIG PRETA PAR',
  'GUIA PASSA FIO C/ ALMA DE ACO 15MT ENERGIA',
  'DESENGRIPANTE SPRAY WHITE LUB SUPER 300ML 180G',
];
const linhas = descricoes.map((d, i) => ({
  id: String(i + 1), desc: d, nf: '1568053894', no: '220205BR',
  qtd: '41', custo: '21,50', venda: '46,74', margem: '117,40', liq: '37,00',
}));
const mapeamento = [
  { destino: colunas[0], formato: 'codigo', origem: 'id' },
  { destino: colunas[1], formato: 'texto', origem: 'desc' },
  { destino: colunas[2], formato: 'texto', origem: 'nf' },
  { destino: colunas[3], formato: 'texto', origem: 'no' },
  { destino: colunas[4], formato: 'numero_limpo', origem: 'qtd' },
  { destino: colunas[5], formato: 'moeda', origem: 'custo' },
  { destino: colunas[6], formato: 'moeda', origem: 'venda' },
  { destino: colunas[7], formato: 'moeda', origem: 'margem' },
  { destino: colunas[8], formato: 'moeda', origem: 'liq' },
];

const linhasFmt = linhas.map((l) => mapeamento.map((m) => {
  const bruto = l[m.origem];
  if (m.formato === 'moeda' || m.formato === 'numero_limpo') return bruto;
  return bruto;
}));

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas += 1; console.log(`  FALHOU ${nome}${extra ? ` — ${extra}` : ''}`); }
};

const pdf = gerarPdfTabela({
  titulo: 'Itens',
  mapeamento,
  linhas: linhas.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { value: v, type: /^\d+$/.test(v) ? 'n' : (/^[\d.,]+$/.test(v) ? 'n' : 's') }]))),
  quebrarLinha: true,
  fonteTam: TAM,
  orientacao: 'paisagem',
});

ok('pdf gerado', pdf.length > 1000 && pdf.subarray(0, 4).toString() === '%PDF', `${pdf.length} bytes`);

const doc = await getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
const pagina = await doc.getPage(1);
const itens = (await pagina.getTextContent()).items
  .filter((i) => i.str && i.str.trim())
  .map((i) => ({ x: i.transform[4], y: Math.round(i.transform[5] * 2) / 2, texto: i.str }));

const porLinha = new Map();
for (const item of itens) {
  if (!porLinha.has(item.y)) porLinha.set(item.y, []);
  porLinha.get(item.y).push(item);
}

let sobrepostos = 0;
for (const [, grupo] of porLinha) {
  grupo.sort((a, b) => a.x - b.x);
  for (let i = 0; i < grupo.length - 1; i += 1) {
    if (grupo[i].x + larguraTexto(grupo[i].texto, TAM) > grupo[i + 1].x + 1) sobrepostos += 1;
  }
}
ok('nenhum texto invade a coluna vizinha', sobrepostos === 0, `${sobrepostos} sobreposicoes`);

// o cabecalho precisa ficar DENTRO da faixa azul (topo = altura da pagina - margem)
const topo = 595.28 - 28;
const acimaDaFaixa = itens.filter((i) => i.y > topo - 3);
ok('cabecalho nao fica cortado no topo da faixa', acimaDaFaixa.length === 0,
  `${acimaDaFaixa.length} itens acima de ${topo.toFixed(1)}`);

const larguras = calcularLarguras(colunas, linhasFmt, 841.89 - 56, TAM);
const larguraDescricao = larguras[1];
const maiorNumero = Math.max(...[0, 2, 3, 4, 5, 6, 7, 8].map((i) => larguras[i]));
ok('descricao e a coluna mais larga', larguraDescricao > maiorNumero, `desc=${larguraDescricao.toFixed(0)} vs ${maiorNumero.toFixed(0)}`);
ok('colunas numericas ficam justas (< 90pt)', larguras.filter((_, i) => i >= 2 && i !== 2).every((w) => w < 90),
  larguras.map((w) => w.toFixed(0)).join('|'));

const soma = larguras.reduce((a, b) => a + b, 0);
ok('larguras ocupam a pagina (sem sobra grande)', Math.abs(soma - (841.89 - 56)) < 2, `${soma.toFixed(1)}`);

const cabecalhoLongo = itens.filter((i) => /^item_valor/.test(i.texto) || /Margem|FpMargem/.test(i.texto));
ok('cabecalho longo foi quebrado em mais de um pedaco', cabecalhoLongo.length >= 6, `${cabecalhoLongo.length} pedacos para 3 colunas longas`);

console.log(`\n${falhas ? `FALHAS: ${falhas}` : 'todos os testes de PDF ok'}\n`);
process.exit(falhas ? 1 : 0);
