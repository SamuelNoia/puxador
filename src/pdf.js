// Gerador de PDF tabular (A4 paisagem), sem dependencias externas.
// Usa as fontes base Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos do português).

const LARGURA_A4_PAISAGEM = 841.89;
const ALTURA_A4_PAISAGEM = 595.28;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

// largura media de cada caractere em relacao ao tamanho da fonte (Helvetica)
const FATORES = { i: 0.28, l: 0.28, j: 0.28, t: 0.33, f: 0.33, r: 0.39, ' ': 0.28, '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28, '|': 0.26, '1': 0.5, 'I': 0.28 };
const FATOR_PADRAO = 0.52;

/** Largura aproximada do texto para o tamanho de fonte informado. */
export function larguraTexto(texto, tamanho = 8) {
  let total = 0;
  for (const ch of String(texto ?? '')) total += FATORES[ch] ?? FATOR_PADRAO;
  return total * tamanho;
}

// caracteres tipograficos que existem fora do latin-1 e precisam virar equivalente
const SUBSTITUTOS = {
  '\u2014': '-', // travessao
  '\u2013': '-', // meia-risca
  '\u2018': "'",
  '\u2019': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u2026': '...',
  '\u00a0': ' ',
  '\u2022': '*',
  '\u2212': '-',
};

function escaparPdf(texto) {
  let s = String(texto ?? '');
  for (const [de, para] of Object.entries(SUBSTITUTOS)) s = s.split(de).join(para);
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r?\n/g, ' ')
    // caracteres fora do latin-1 viram '?'
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
}

/** Corta o texto para caber na largura, com reticencias. */
function cortar(texto, largura, tamanho) {
  const s = String(texto ?? '');
  if (larguraTexto(s, tamanho) <= largura) return s;
  let corte = s;
  while (corte.length > 1 && larguraTexto(`${corte}...`, tamanho) > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}...`;
}

function conteudoPagina({ colunas, linhas, larguras, area, titulo, pagina, totalPaginas, fonteTam }) {
  const partes = [];
  const { x, y, largura, altura } = area;
  const alturaLinha = fonteTam + 5;
  const alturaCabecalho = fonteTam + 8;

  // faixa do cabecalho
  partes.push(`0.184 0.333 0.588 rg ${x} ${y + altura - alturaCabecalho} ${largura} ${alturaCabecalho} re f`);
  partes.push('1 1 1 rg');

  let cx = x;
  for (let i = 0; i < colunas.length; i += 1) {
    const texto = cortar(colunas[i], larguras[i] - 6, fonteTam);
    partes.push(`BT /F2 ${fonteTam} Tf ${(cx + 3).toFixed(2)} ${(y + altura - alturaCabecalho + 4).toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
    cx += larguras[i];
  }

  // linhas
  let linhaY = y + altura - alturaCabecalho - alturaLinha;
  let zebra = false;
  for (const linha of linhas) {
    if (linhaY < y + 16) break;
    if (zebra) {
      partes.push(`0.96 0.97 0.99 rg ${x} ${linhaY.toFixed(2)} ${largura} ${alturaLinha} re f`);
    }
    zebra = !zebra;

    partes.push('0 0 0 rg');
    let px = x;
    for (let i = 0; i < colunas.length; i += 1) {
      const bruto = linha[i] ?? '';
      const texto = cortar(bruto, larguras[i] - 6, fonteTam);
      partes.push(`BT /F1 ${fonteTam} Tf ${(px + 3).toFixed(2)} ${(linhaY + 3).toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
      px += larguras[i];
    }
    linhaY -= alturaLinha;
  }

  // rodape
  partes.push(`0.42 0.47 0.55 rg BT /F1 7 Tf ${x} ${(y - 8).toFixed(2)} Td (${escaparPdf(titulo)}) Tj ET`);
  const rodape = `Pagina ${pagina} de ${totalPaginas}`;
  partes.push(`BT /F1 7 Tf ${(x + largura - larguraTexto(rodape, 7)).toFixed(2)} ${(y - 8).toFixed(2)} Td (${escaparPdf(rodape)}) Tj ET`);

  return partes.join('\n');
}

/** Calcula a largura das colunas proporcionalmente ao conteudo. */
function calcularLarguras(colunas, linhas, larguraDisponivel, fonteTam) {
  const natural = colunas.map((c, i) => {
    let maior = larguraTexto(c, fonteTam) + 10;
    for (const linha of linhas.slice(0, 60)) {
      const w = larguraTexto(linha[i] ?? '', fonteTam) + 10;
      if (w > maior) maior = w;
    }
    return Math.min(Math.max(maior, 42), 260);
  });
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= larguraDisponivel) {
    // sobra espaco: distribui proporcionalmente
    const fator = larguraDisponivel / total;
    return natural.map((w) => w * fator);
  }
  return natural.map((w) => (w / total) * larguraDisponivel);
}

/**
 * Monta o PDF.
 * @param {{ titulo?: string, colunas: string[], linhas: string[][], orientacao?: 'paisagem'|'retrato' }} dados
 */
export function gerarPdf({ titulo = 'Puxador de Dados', colunas = [], linhas = [], orientacao = 'paisagem' }) {
  const paisagem = orientacao !== 'retrato';
  const larguraPagina = paisagem ? LARGURA_A4_PAISAGEM : LARGURA_A4;
  const alturaPagina = paisagem ? ALTURA_A4_PAISAGEM : ALTURA_A4;
  const margem = 28;
  const fonteTam = colunas.length > 10 ? 6.5 : 7.5;

  const area = {
    x: margem,
    y: margem + 10,
    largura: larguraPagina - margem * 2,
    altura: alturaPagina - margem * 2 - 10,
  };
  const larguras = calcularLarguras(colunas, linhas, area.largura, fonteTam);
  const alturaLinha = fonteTam + 5;
  const capacidade = Math.max(1, Math.floor((area.altura - (fonteTam + 8)) / alturaLinha));

  const paginas = [];
  for (let i = 0; i < linhas.length; i += capacidade) {
    paginas.push(linhas.slice(i, i + capacidade));
  }
  if (!paginas.length) paginas.push([]);

  const objetos = [];
  const add = (corpo) => {
    objetos.push(corpo);
    return objetos.length; // numero do objeto (1-based)
  };

  // 1 = catalogo, 2 = paginas, 3 = Helvetica, 4 = Helvetica-Bold
  const idCatalogo = add(null);
  const idPaginas = add(null);
  const idFonteNormal = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const idFonteBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const idsPaginas = [];
  paginas.forEach((linhasPagina, indice) => {
    const conteudo = conteudoPagina({
      colunas,
      linhas: linhasPagina,
      larguras,
      area,
      titulo,
      pagina: indice + 1,
      totalPaginas: paginas.length,
      fonteTam,
    });
    const idConteudo = add(`<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`);
    const idPagina = add(`<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${larguraPagina.toFixed(2)} ${alturaPagina.toFixed(2)}] `
      + `/Resources << /Font << /F1 ${idFonteNormal} 0 R /F2 ${idFonteBold} 0 R >> >> /Contents ${idConteudo} 0 R >>`);
    idsPaginas.push(idPagina);
  });

  objetos[idCatalogo - 1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas - 1] = `<< /Type /Pages /Kids [${idsPaginas.map((n) => `${n} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;

  // serializa
  const partes = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let deslocamento = partes[0].length;
  const deslocamentos = [];

  objetos.forEach((corpo, i) => {
    deslocamentos.push(deslocamento);
    const bloco = Buffer.from(`${i + 1} 0 obj\n${corpo}\nendobj\n`, 'latin1');
    partes.push(bloco);
    deslocamento += bloco.length;
  });

  const inicioXref = deslocamento;
  const linhasXref = [`xref\n0 ${objetos.length + 1}\n`, '0000000000 65535 f \n'];
  for (const off of deslocamentos) linhasXref.push(`${String(off).padStart(10, '0')} 00000 n \n`);
  const xref = Buffer.from(linhasXref.join(''), 'latin1');
  partes.push(xref);

  const trailer = Buffer.from(
    `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R /Info << /Title (${escaparPdf(titulo)}) /Producer (Puxador de Dados) >> >>\n`
    + `startxref\n${inicioXref}\n%%EOF\n`,
    'latin1',
  );
  partes.push(trailer);

  return Buffer.concat(partes);
}
