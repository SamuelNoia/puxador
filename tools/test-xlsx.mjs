// Testa o XLSX: cabecalho usa o nome renomeado e porcentagem nao multiplica por 100.
import { gerarXlsx } from '../src/export.js';
import { zipRead } from '../src/xlsx.js';

const mapeamento = [
  { destino: 'Id', formato: 'codigo', origem: 't0_Id' },
  { destino: 'Fabricante', formato: 'texto', origem: 't1_Descricao' },
  { destino: 'Margem Bruto', formato: 'percentual', origem: 't1_Margem' },
];
const linhas = [{
  Id: { value: '4', type: 's' },
  Fabricante: { value: 'FERTAK', type: 's' },
  'Margem Bruto': { value: 66.67, type: 'n' },
}];

const xlsx = gerarXlsx({ titulo: 'Teste', mapeamento, linhas });
const arquivos = zipRead(xlsx);
const folha = arquivos.get('xl/worksheets/sheet1.xml').toString('utf8');
const estilos = arquivos.get('xl/styles.xml').toString('utf8');

let falhas = 0;
const ok = (nome, cond, extra = '') => {
  if (cond) console.log(`  ok   ${nome}`);
  else { falhas += 1; console.log(`  FALHOU ${nome}${extra ? ` — ${extra}` : ''}`); }
};

ok('cabecalho usa o nome renomeado (Fabricante)', folha.includes('>Fabricante<'));
ok('cabecalho respeita espacos ("Margem Bruto")', folha.includes('>Margem Bruto<'));
ok('nao vaza nome interno da coluna', !folha.includes('t0_Id') && !folha.includes('t1_Descricao'));

// estilo da celula de porcentagem -> numFmt literal "%"
const celulaPct = /<c r="C2" s="(\d+)"/.exec(folha)?.[1];
const xfs = [...(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/.exec(estilos)[1]).matchAll(/<xf ([^>]*)>/g)]
  .map((m) => /numFmtId="(\d+)"/.exec(m[1])?.[1]);
const fmtId = celulaPct !== undefined ? xfs[Number(celulaPct)] : null;
const formatos = Object.fromEntries([...estilos.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)]
  .map((m) => [m[1], m[2]]));
const codigo = formatos[fmtId] || '';

ok('porcentagem usa formato literal (sem multiplicar por 100)', codigo.includes('&quot;%&quot;'), codigo);
ok('porcentagem nao usa o formato 0.0%', codigo !== '0.0%', codigo);

console.log(`\n${falhas ? `FALHAS: ${falhas}` : 'todos os testes de XLSX ok'}\n`);
process.exit(falhas ? 1 : 0);
