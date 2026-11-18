// Geracao das saidas: XLSX e CSV.
import { buildXlsx, S } from './xlsx.js';
import { aplicarFormato } from './format.js';

/** Aplica o mapeamento (destino/formato) em uma linha crua do banco. */
export function aplicarLinha(origemColunas, mapeamento, linha) {
  return mapeamento.map((m) => {
    const idx = origemColunas.indexOf(m.origem);
    const bruto = idx >= 0 ? linha[m.origem] : null;
    return { ...aplicarFormato(bruto, m.formato, m.decimais), origem: m.origem, destino: m.destino };
  });
}

function celulaXlsx(item, formato) {
  if (item.value === '' || item.value === null || item.value === undefined) return null;
  if (item.type === 'n' && formato !== 'codigo') {
    const estilo = formato === 'moeda' ? S.money : (formato === 'percentual' ? S.pct : S.value);
    return { v: item.value, s: estilo };
  }
  return { v: String(item.value), s: S.cell };
}

/**
 * Monta o XLSX tabular.
 * mapeamento: [{ destino, formato }]
 * linhas: [{ origem: valor }]
 */
export function gerarXlsx({ titulo, mapeamento, linhas, larguras }) {
  const header = mapeamento.map((m) => ({ v: m.destino, s: S.header }));
  const rows = [header];
  for (const linha of linhas) {
    rows.push(mapeamento.map((m) => celulaXlsx(linha[m.destino] || linha[m.origem] || {}, m.formato)));
  }
  const cols = (larguras && larguras.length ? larguras : mapeamento.map((m) => Math.min(45, Math.max(10, String(m.destino).length + 6))));

  return buildXlsx([
    {
      name: titulo || 'Dados',
      cols,
      rows,
      freeze: 'A2',
    },
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
