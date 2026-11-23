// Gerador de PDF tabular (A4), sem dependencias externas.
// Usa as fontes base Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos do português).
// Suporta quebra de linha nas celulas, tamanho de fonte e orientacao (paisagem/retrato).

const LARGURA_A4_PAISAGEM = 841.89;
const ALTURA_A4_PAISAGEM = 595.28;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

// largura media de cada caractere em relacao ao tamanho da fonte (Helvetica)
const FATORES = { i: 0.28, l: 0.28, j: 0.28, t: 0.33, f: 0.33, r: 0.39, ' ': 0.28, '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28, '|': 0.26, '1': 0.5, I: 0.28 };
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

/** Divide o texto em linhas que cabem na largura (quebra por palavra e, se preciso, por caractere). */
function quebrarEmLinhas(texto, largura, tamanho) {
  const palavras = String(texto ?? '').split(/\s+/).filter(Boolean);
  if (!palavras.length) return [''];

  const linhas = [];
  let atual = '';

  for (const palavra of palavras) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (larguraTexto(tentativa, tamanho) <= largura) {
      atual = tentativa;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra;

    // palavra maior que a coluna inteira: quebra por caractere
    while (larguraTexto(atual, tamanho) > largura && atual.length > 1) {
      let corte = atual.length - 1;
      while (corte > 1 && larguraTexto(atual.slice(0, corte), tamanho) > largura) corte -= 1;
      linhas.push(atual.slice(0, corte));
      atual = atual.slice(corte);
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [''];
}

/** Calcula a largura das colunas proporcionalmente ao conteudo. */
function calcularLarguras(colunas, linhas, larguraDisponivel, fonteTam) {
  const natural = colunas.map((c, i) => {
    let maior = larguraTexto(c, fonteTam) + 10;
    for (const linha of linhas.slice(0, 60)) {
      const w = larguraTexto(linha[i] ?? '', fonteTam) + 10;
      if (w > maior) maior = w;
    }
    return Math.min(Math.max(maior, 42), 240);
  });
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= larguraDisponivel) {
    const fator = larguraDisponivel / total;
    return natural.map((w) => w * fator);
  }
  return natural.map((w) => (w / total) * larguraDisponivel);
}

/**
 * Monta o PDF.
 * @param {{
 *   titulo?: string,
 *   colunas: string[],
 *   linhas: string[][],
 *   orientacao?: 'paisagem'|'retrato',
 *   quebrarLinha?: boolean,
 *   fonteTam?: number
 * }} dados
 */
export function gerarPdf({ titulo = 'Puxador de Dados', colunas = [], linhas = [], orientacao = 'paisagem', quebrarLinha = true, fonteTam }) {
  const paisagem = orientacao !== 'retrato';
  const larguraPagina = paisagem ? LARGURA_A4_PAISAGEM : LARGURA_A4;
  const alturaPagina = paisagem ? ALTURA_A4_PAISAGEM : ALTURA_A4;
  const margem = 28;

  const tamanho = Number(fonteTam) >= 5 && Number(fonteTam) <= 14
    ? Number(fonteTam)
    : (colunas.length > 10 ? 6.5 : 7.5);

  const area = {
    x: margem,
    y: margem + 10,
    largura: larguraPagina - margem * 2,
    altura: alturaPagina - margem * 2 - 10,
  };
  const larguras = calcularLarguras(colunas, linhas, area.largura, tamanho);
  const alturaCabecalho = tamanho + 8;
  const alturaLinhaTexto = tamanho + 2;

  // prepara cada linha (com ou sem quebra) e sua altura
  const linhasRender = linhas.map((linha) => {
    const celulas = colunas.map((_, i) => {
      const bruto = linha[i] ?? '';
      return quebrarLinha
        ? quebrarEmLinhas(bruto, larguras[i] - 6, tamanho)
        : [cortar(bruto, larguras[i] - 6, tamanho)];
    });
    const qtdLinhas = Math.max(1, ...celulas.map((c) => c.length));
    return { celulas, altura: qtdLinhas * alturaLinhaTexto + 4 };
  });

  // pagina considerando a altura de cada linha
  const disponivel = area.altura - alturaCabecalho;
  const paginas = [];
  let atual = [];
  let usado = 0;
  for (const linha of linhasRender) {
    if (usado + linha.altura > disponivel && atual.length) {
      paginas.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(linha);
    usado += linha.altura;
  }
  paginas.push(atual);
  if (!paginas.length) paginas.push([]);

  const objetos = [];
  const add = (corpo) => {
    objetos.push(corpo);
    return objetos.length;
  };

  const idCatalogo = add(null);
  const idPaginas = add(null);
  const idFonteNormal = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const idFonteBold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const idsPaginas = [];
  paginas.forEach((linhasPagina, indice) => {
    const partes = [];
    const topo = area.y + area.altura;

    // cabecalho
    partes.push(`0.184 0.333 0.588 rg ${area.x} ${topo - alturaCabecalho} ${area.largura} ${alturaCabecalho} re f`);
    partes.push('1 1 1 rg');
    let cx = area.x;
    for (let i = 0; i < colunas.length; i += 1) {
      const texto = cortar(colunas[i], larguras[i] - 6, tamanho);
      partes.push(`BT /F2 ${tamanho} Tf ${(cx + 3).toFixed(2)} ${(topo - alturaCabecalho + 4).toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
      cx += larguras[i];
    }

    // linhas
    let linhaY = topo - alturaCabecalho;
    let zebra = false;
    for (const linha of linhasPagina) {
      linhaY -= linha.altura;
      if (zebra) {
        partes.push(`0.96 0.97 0.99 rg ${area.x} ${linhaY.toFixed(2)} ${area.largura} ${linha.altura.toFixed(2)} re f`);
      }
      zebra = !zebra;

      partes.push('0 0 0 rg');
      let px = area.x;
      for (let i = 0; i < colunas.length; i += 1) {
        const celula = linha.celulas[i] || [''];
        celula.forEach((texto, ordem) => {
          const y = linhaY + linha.altura - 4 - (ordem + 1) * alturaLinhaTexto + 3;
          partes.push(`BT /F1 ${tamanho} Tf ${(px + 3).toFixed(2)} ${y.toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
        });
        px += larguras[i];
      }
    }

    // rodape
    partes.push(`0.42 0.47 0.55 rg BT /F1 7 Tf ${area.x} ${(area.y - 8).toFixed(2)} Td (${escaparPdf(titulo)}) Tj ET`);
    const rodape = `Pagina ${indice + 1} de ${paginas.length}`;
    partes.push(`BT /F1 7 Tf ${(area.x + area.largura - larguraTexto(rodape, 7)).toFixed(2)} ${(area.y - 8).toFixed(2)} Td (${escaparPdf(rodape)}) Tj ET`);

    const conteudo = partes.join('\n');
    const idConteudo = add(`<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`);
    const idPagina = add(`<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${larguraPagina.toFixed(2)} ${alturaPagina.toFixed(2)}] `
      + `/Resources << /Font << /F1 ${idFonteNormal} 0 R /F2 ${idFonteBold} 0 R >> >> /Contents ${idConteudo} 0 R >>`);
    idsPaginas.push(idPagina);
  });

  objetos[idCatalogo - 1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas - 1] = `<< /Type /Pages /Kids [${idsPaginas.map((n) => `${n} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;

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
  partes.push(Buffer.from(linhasXref.join(''), 'latin1'));

  partes.push(Buffer.from(
    `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R /Info << /Title (${escaparPdf(titulo)}) /Producer (Puxador de Dados) >> >>\n`
    + `startxref\n${inicioXref}\n%%EOF\n`,
    'latin1',
  ));

  return Buffer.concat(partes);
}
