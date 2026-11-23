// Gerador de PDF tabular (A4), sem dependencias externas.
// Usa as fontes base Helvetica/Helvetica-Bold com WinAnsiEncoding (acentos do português).
// Suporta quebra de linha nas celulas, tamanho de fonte e orientacao (paisagem/retrato).

const LARGURA_A4_PAISAGEM = 841.89;
const ALTURA_A4_PAISAGEM = 595.28;
const LARGURA_A4 = 595.28;
const ALTURA_A4 = 841.89;

// Larguras por classe de caractere, em relacao ao tamanho da fonte (Helvetica).
// Sao propositalmente um pouco generosas: medir a mais evita texto invadindo a coluna vizinha.
const LARGOS = new Set(['M', 'W', 'm', 'w', '@', '%', '&']);
const ESTREITOS = new Set(['i', 'l', 'j', 't', 'f', 'r', 'I', '.', ',', ':', ';', '|', '!', "'", '(', ')', '[', ']', ' ']);

/** Largura estimada do texto (com folga de 2%) para o tamanho de fonte informado. */
export function larguraTexto(texto, tamanho = 8) {
  let total = 0;
  for (const ch of String(texto ?? '')) {
    if (LARGOS.has(ch)) total += 0.86;
    else if (ESTREITOS.has(ch)) total += 0.30;
    else if (ch >= 'A' && ch <= 'Z') total += 0.70;
    else if (ch >= '0' && ch <= '9') total += 0.58;
    else if (ch >= 'a' && ch <= 'z') total += 0.55;
    else if (ch >= '\u00c0' && ch <= '\u00ff') total += 0.62; // acentuadas
    else total += 0.58;
  }
  return total * tamanho * 1.02;
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

/** Calcula a largura das colunas pelo conteudo das linhas (o cabecalho quebra em 2 linhas). */
export function calcularLarguras(colunas, linhas, larguraDisponivel, fonteTam) {
  const MIN = 40;
  const CAP = 260;

  const medido = colunas.map((_, i) => {
    let maior = MIN;
    for (const linha of linhas.slice(0, 200)) {
      const w = larguraTexto(linha[i] ?? '', fonteTam) + 10;
      if (w > maior) maior = w;
    }
    return maior;
  });
  const natural = medido.map((w) => Math.min(w, CAP));
  const soma = natural.reduce((a, b) => a + b, 0) || 1;

  // sobra: distribui com peso quadratico para a coluna mais larga (normalmente a descricao)
  if (soma <= larguraDisponivel) {
    const sobra = larguraDisponivel - soma;
    const pesos = natural.map((w) => w * w);
    const totalPeso = pesos.reduce((a, b) => a + b, 0) || 1;
    return natural.map((w, i) => w + sobra * (pesos[i] / totalPeso));
  }

  // precisa encolher: colunas curtas (numeros, ids) mantem o tamanho; as longas dividem o resto
  const curtas = natural.map((w) => w <= 70);
  const somaCurtas = natural.filter((_, i) => curtas[i]).reduce((a, b) => a + b, 0);
  const somaLongas = natural.filter((_, i) => !curtas[i]).reduce((a, b) => a + b, 0);
  const restante = larguraDisponivel - somaCurtas;

  if (restante > MIN * 2 && somaLongas > 0) {
    const fator = restante / somaLongas;
    return natural.map((w, i) => (curtas[i] ? w : Math.max(MIN, w * fator)));
  }

  const fator = larguraDisponivel / soma;
  return natural.map((w) => Math.max(MIN, w * fator));
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
export function gerarPdf({ titulo = 'Puxador de Dados', colunas = [], linhas = [], orientacao = 'paisagem', quebrarLinha = true, fonteTam, alinharDireita = [] }) {
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
  const alturaLinhaTexto = tamanho + 2;
  // cabecalho: fonte um pouco menor e ate 3 linhas; se nao couber, termina com "..."
  const tamanhoCab = Math.max(5.5, tamanho - 0.5);
  const cabecalhoLinhas = colunas.map((c, i) => {
    const todas = quebrarEmLinhas(c, larguras[i] - 8, tamanhoCab);
    if (todas.length <= 3) return todas;
    const primeiras = todas.slice(0, 3);
    primeiras[2] = cortar(todas.slice(2).join(' '), larguras[i] - 8, tamanhoCab);
    return primeiras;
  });
  const alturaCabecalho = Math.max(1, ...cabecalhoLinhas.map((l) => l.length)) * (tamanhoCab + 2) + 10;

  // prepara cada linha (com ou sem quebra) e sua altura
  const linhasRender = linhas.map((linha) => {
    const celulas = colunas.map((_, i) => {
      const bruto = linha[i] ?? '';
      return quebrarLinha
        ? quebrarEmLinhas(bruto, larguras[i] - 8, tamanho)
        : [cortar(bruto, larguras[i] - 8, tamanho)];
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
      const linhasCab = cabecalhoLinhas[i] || [''];
      linhasCab.forEach((texto, ordem) => {
        // baseline desce o suficiente para o topo do glifo ficar dentro da faixa azul
        const y = topo - 4 - tamanhoCab * 0.8 - ordem * (tamanhoCab + 2);
        partes.push(`BT /F2 ${tamanhoCab} Tf ${(cx + 4).toFixed(2)} ${y.toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
      });
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
        const direita = Array.isArray(alinharDireita) && alinharDireita.includes(i);
        celula.forEach((texto, ordem) => {
          const y = linhaY + linha.altura - 4 - (ordem + 1) * alturaLinhaTexto + 3;
          const x = direita
            ? px + larguras[i] - 4 - larguraTexto(texto, tamanho)
            : px + 4;
          partes.push(`BT /F1 ${tamanho} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escaparPdf(texto)}) Tj ET`);
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
