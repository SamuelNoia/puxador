// Geracao das saidas: XLSX, CSV e PDF.
import { buildXlsx, S } from './xlsx.js';
import { aplicarFormato } from './format.js';
import { gerarPdf } from './pdf.js';

/** Aplica o mapeamento (destino/formato) em uma linha crua do banco. */
export function aplicarLinha(origemColunas, mapeamento, linha) {
  return mapeamento.map((m) => {
    const idx = origemColunas.indexOf(m.origem);
    const bruto = idx >= 0 ? linha[m.origem] : null;
    return { ...aplicarFormato(bruto, m.formato, m.decimais), origem: m.origem, destino: m.destino };
  });
}

function celulaXlsx(item, formato, quebrarLinha) {
  if (item.value === '' || item.value === null || item.value === undefined) return null;
  if (item.type === 'n' && formato !== 'codigo') {
    let estilo = S.value;
    if (formato === 'moeda') estilo = S.money;
    else if (formato === 'percentual') estilo = S.pct;
    else if (formato === 'numero' || formato === 'decimal') estilo = S.decimal;
    // 'numero_limpo' fica em General (o Excel esconde os zeros a direita)
    return { v: item.value, s: estilo };
  }
  return { v: String(item.value), s: quebrarLinha ? S.wrap : S.cell };
}

/**
 * Monta o XLSX tabular.
 * mapeamento: [{ destino, formato }]
 * linhas: [{ origem: valor }]
 */
export function gerarXlsx({ titulo, mapeamento, linhas, larguras, quebrarLinha = false }) {
  const header = mapeamento.map((m) => ({ v: m.destino, s: S.header }));
  const rows = [header];
  for (const linha of linhas) {
    rows.push(mapeamento.map((m) => celulaXlsx(linha[m.destino] || linha[m.origem] || {}, m.formato, quebrarLinha)));
  }
  const cols = (larguras && larguras.length
    ? larguras
    : mapeamento.map((m) => Math.min(45, Math.max(10, String(m.destino).length + 6))));

  return buildXlsx([
    { name: titulo || 'Dados', cols, rows, freeze: 'A2' },
  ], { title: titulo || 'Puxador de Dados', creator: 'Puxador de Dados' });
}

function csvCampo(valor) {
  if (valor === null || valor === undefined) return '';
  let s = String(valor);
  if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV com ; (padrao Excel pt-BR) e BOM UTF-8. */
export function gerarCsv({ mapeamento, linhas }) {
  const cabecalho = mapeamento.map((m) => csvCampo(m.destino)).join(';');
  const corpo = linhas.map((linha) => mapeamento.map((m) => {
    const item = linha[m.destino] || linha[m.origem] || {};
    return csvCampo(item.value ?? '');
  }).join(';'));
  return Buffer.from('\ufeff' + [cabecalho, ...corpo].join('\r\n') + '\r\n', 'utf8');
}

/** Numero para exibir no PDF, respeitando o formato escolhido. */
function numeroParaPdf(item, formato, decimais) {
  if (item.type !== 'n' || typeof item.value !== 'number') return String(item.value ?? '');
  const casas = decimais === undefined || decimais === null || decimais === '' ? 2 : Number(decimais);
  const opcoes = { minimumFractionDigits: casas, maximumFractionDigits: casas };

  if (formato === 'numero_limpo') {
    const max = Number.isFinite(casas) && casas > 0 ? casas : 6;
    return item.value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: max });
  }
  if (formato === 'inteiro') {
    return item.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  if (formato === 'percentual') {
    // o valor ja vem em pontos percentuais (66.67 = 66,67%): nao multiplica por 100
    return `${item.value.toLocaleString('pt-BR', opcoes)}%`;
  }
  return item.value.toLocaleString('pt-BR', opcoes);
}

/** PDF em A4, com cabecalho, zebra, numeracao de paginas e opcoes visuais. */
export function gerarPdfTabela({ titulo, mapeamento, linhas, orientacao = 'paisagem', quebrarLinha = true, fonteTam }) {
  const colunas = mapeamento.map((m) => m.destino);
  const corpo = linhas.map((linha) => mapeamento.map((m) => {
    const item = linha[m.destino] || linha[m.origem] || {};
    return numeroParaPdf(item, m.formato, m.decimais);
  }));

  const numericos = new Set(['numero', 'numero_limpo', 'inteiro', 'decimal', 'moeda', 'percentual']);
  const alinharDireita = mapeamento
    .map((m, i) => (numericos.has(m.formato) ? i : -1))
    .filter((i) => i >= 0);

  return gerarPdf({
    titulo: titulo || 'Dados',
    colunas,
    linhas: corpo,
    orientacao,
    quebrarLinha,
    fonteTam,
    alinharDireita,
  });
}
