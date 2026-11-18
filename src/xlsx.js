// Engine XLSX sem dependencias: escrita (ZIP + SpreadsheetML) e leitura.
// Suporta estilos, mesclagens, formulas com valor em cache, largura de colunas,
// altura de linhas, freeze panes e configuracao de impressao.
import zlib from 'node:zlib';

// ---------------------------------------------------------------- CRC32 / ZIP
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

/** Empacota arquivos em um ZIP (deflate). files: [{name, data:Buffer|string}] */
export function zipWrite(files, when = new Date()) {
  const { time, date } = dosDateTime(when);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const raw = Buffer.isBuffer(file.data) ? file.data : Buffer.from(String(file.data), 'utf8');
    const crc = crc32(raw);
    const deflated = zlib.deflateRawSync(raw, { level: 6 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

/** Le um ZIP e devolve Map(nome -> Buffer). */
export function zipRead(buf) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo ZIP invalido (EOCD nao encontrado).');

  const count = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOff = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    if (!name.endsWith('/')) {
      try {
        out.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
      } catch {
        out.set(name, Buffer.alloc(0));
      }
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ---------------------------------------------------------------- XML utils
export function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // caracteres de controle invalidos em XML 1.0
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
}

function xmlUnesc(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

export function colToNum(letters) {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numToCol(n) {
  let s = '';
  let v = Math.max(1, Math.floor(n));
  while (v > 0) {
    const r = (v - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    v = Math.floor((v - 1) / 26);
  }
  return s;
}

export function a1(col, row) {
  return `${numToCol(col)}${row}`;
}

/** Nome de aba valido e citavel em formulas. */
export function safeSheetName(name, used = new Set()) {
  let base = String(name || 'Planilha')
    .replace(/[\][:*?/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31)
    .trim() || 'Planilha';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function quoteSheet(name) {
  return `'${String(name).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------- estilos
// Indices de cellXfs. Mantidos na mesma ordem de styles.xml abaixo.
export const S = {
  default: 0,
  title: 1,
  section: 2,
  label: 3,
  value: 4,
  header: 5,
  cell: 6,
  center: 7,
  money: 8,
  qty: 9,
  pct: 10,
  totalMoney: 11,
  totalLabel: 12,
  boldText: 13,
  boldMoney: 14,
  wrap: 15,
  note: 16,
  rightBold: 17,
  rightText: 18,
  headerBordered: 19,
  subLabel: 20,
  smallCenter: 21,
  moneyPlain: 22,
  headerLeft: 23,
};

const THEME_PADRAO = {
  font: 'Segoe UI',
  szBody: 9,
  szTitle: 13,
  szSection: 10,
  szHeader: 10,
  szTotal: 11,
  primary: '1F4E78',
  headerFill: '2F5597',
  soft: 'D9E1F2',
  text: '000000',
  titleText: 'FFFFFF',
  sectionText: '1F4E78',
  headerText: 'FFFFFF',
  totalText: 'FFFFFF',
  note: '444444',
  borderColor: 'B4C6E7',
  borderStyle: 'thin',
  borders: 'all',
  headerAlign: 'center',
  titleAlign: 'center',
};

/** Monta o styles.xml a partir do tema (layout) escolhido. */
function stylesXml(input) {
  const t = { ...THEME_PADRAO, ...(input || {}) };
  const rgb = (hex) => `FF${String(hex).replace('#', '').toUpperCase().slice(0, 6)}`;
  const font = (size, bold, color) => `<font>${bold ? '<b/>' : ''}<sz val="${size}"/><color rgb="${rgb(color)}"/><name val="${xmlEsc(t.font)}"/><family val="2"/></font>`;
  const lado = (nome, estilo) => (estilo
    ? `<${nome} style="${estilo}"><color rgb="${rgb(t.borderColor)}"/></${nome}>`
    : `<${nome}/>`);

  let borda;
  if (t.borders === 'none') {
    borda = '<border><left/><right/><top/><bottom/><diagonal/></border>';
  } else if (t.borders === 'bottom') {
    borda = `<border>${lado('left')}${lado('right')}${lado('top')}${lado('bottom', 'thin')}<diagonal/></border>`;
  } else {
    borda = `<border>${lado('left', t.borderStyle)}${lado('right', t.borderStyle)}${lado('top', t.borderStyle)}${lado('bottom', t.borderStyle)}<diagonal/></border>`;
  }

  const fonts = [
    font(t.szBody, false, t.text),
    font(t.szTitle, true, t.titleText),
    font(t.szSection, true, t.sectionText),
    font(t.szBody, true, t.text),
    font(t.szHeader, true, t.headerText),
    font(t.szTotal, true, t.totalText),
    font(t.szHeader, true, t.text),
    font(t.szBody, false, t.note),
  ].join('');

  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(t.primary)}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(t.headerFill)}"/><bgColor indexed="64"/></patternFill></fill>`,
    `<fill><patternFill patternType="solid"><fgColor rgb="${rgb(t.soft)}"/><bgColor indexed="64"/></patternFill></fill>`,
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>',
  ].join('');

  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="${t.titleAlign}" vertical="center"/></xf>`,
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    `<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="${t.headerAlign}" vertical="center" wrapText="1"/></xf>`,
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="3" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="166" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
    '<xf numFmtId="164" fontId="5" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="5" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="top" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    `<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${t.headerAlign}" vertical="center" wrapText="1"/></xf>`,
    '<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right"/></xf>',
    '<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3">
<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="#,##0.00"/>
<numFmt numFmtId="166" formatCode="0.0%"/>
</numFmts>
<fonts count="8">${fonts}</fonts>
<fills count="6">${fills}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${borda}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="24">
${xfs}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

// ---------------------------------------------------------------- escrita
function resolveStyle(s) {
  if (s === undefined || s === null) return 0;
  if (typeof s === 'number') return s;
  if (typeof s === 'string') {
    const idx = S[s];
    if (idx === undefined) throw new Error(`Estilo desconhecido: ${s}`);
    return idx;
  }
  return 0;
}

function cellXml(ref, cell) {
  let c = cell;
  if (c === null || c === undefined) return '';
  if (typeof c === 'string') c = { v: c };
  else if (typeof c === 'number') c = { v: c };
  else if (typeof c === 'boolean') c = { v: c ? 'VERDADEIRO' : 'FALSO' };
  const s = resolveStyle(c.s);
  const sAttr = s ? ` s="${s}"` : '';
  const hasF = c.f !== undefined && c.f !== null && String(c.f) !== '';
  const hasV = c.v !== undefined && c.v !== null && c.v !== '';

  if (hasF) {
    let xml = `<c r="${ref}"${sAttr}><f>${xmlEsc(c.f)}</f>`;
    if (typeof c.v === 'number' && Number.isFinite(c.v)) {
      xml += `<v>${c.v}</v>`;
    } else if (hasV && typeof c.v === 'string') {
      xml += `<v>${c.v}</v>`;
    } else {
      xml += '<v>0</v>';
    }
    return `${xml}</c>`;
  }

  if (!hasV) return sAttr ? `<c r="${ref}"${sAttr}/>` : '';

  if (typeof c.v === 'number' && Number.isFinite(c.v)) {
    return `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`;
  }
  const text = String(c.v);
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(text)}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  const cols = sheet.cols || [];
  const merges = sheet.merges || [];
  let maxCol = 1;

  const rowsXml = [];
  rows.forEach((row, ri) => {
    if (!row) return;
    const rNum = row.r || ri + 1;
    const cells = Array.isArray(row) ? row : row.cells || [];
    const attrs = [`r="${rNum}"`];
    if (row.h) attrs.push(`ht="${row.h}" customHeight="1"`);
    if (row.hidden) attrs.push('hidden="1"');
    const cellsXml = [];
    cells.forEach((cell, ci) => {
      const colNum = ci + 1;
      if (colNum > maxCol) maxCol = colNum;
      const xml = cellXml(a1(colNum, rNum), cell);
      if (xml) cellsXml.push(xml);
    });
    rowsXml.push(`<row ${attrs.join(' ')}>${cellsXml.join('')}</row>`);
  });

  let colsXml = '';
  if (cols.length) {
    const parts = cols.map((w, i) => {
      if (!w) return '';
      return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    }).filter(Boolean);
    if (parts.length) colsXml = `<cols>${parts.join('')}</cols>`;
  }

  let paneXml = '';
  if (sheet.freeze) {
    const m = /^([A-Z]+)(\d+)$/.exec(sheet.freeze);
    if (m) {
      const xSplit = colToNum(m[1]) - 1;
      const ySplit = Number(m[2]) - 1;
      paneXml = `<pane${xSplit ? ` xSplit="${xSplit}"` : ''}${ySplit ? ` ySplit="${ySplit}"` : ''} topLeftCell="${sheet.freeze}" activePane="bottomRight" state="frozen"/>`;
    }
  }

  const lastRow = rows.length ? (rows[rows.length - 1]?.r || rows.length) : 1;
  const dim = `A1:${numToCol(Math.max(maxCol, sheet.minCols || 1))}${Math.max(lastRow, 1)}`;

  const mergesXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';

  const page = sheet.page || {};

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<dimension ref="${dim}"/>
<sheetViews><sheetView workbookViewId="0"${sheet.selected ? ' tabSelected="1"' : ''}>${paneXml}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15" baseColWidth="10"/>
${colsXml}
<sheetData>${rowsXml.join('')}</sheetData>
${mergesXml}
${sheet.hideGrid ? '<sheetView showGridLines="0"/>' : ''}
<printOptions horizontalCentered="${page.centerH ? 1 : 0}"/>
<pageMargins left="${page.left ?? 0.4}" right="${page.right ?? 0.4}" top="${page.top ?? 0.5}" bottom="${page.bottom ?? 0.5}" header="0.3" footer="0.3"/>
<pageSetup orientation="${page.orientation || 'portrait'}" paperSize="${page.paperSize || 9}"${page.fitToWidth ? ` fitToWidth="${page.fitToWidth}" fitToHeight="0"` : ''}${page.fitToWidth ? '' : ''}/>
</worksheet>`;
}

/**
 * Monta um .xlsx.
 * sheets: [{ name, cols:[larguras], rows:[ [celula,...] | {cells,r,h} ], merges:[], freeze, page, selected }]
 * celula: string | number | { v, f, s }
 */
export function buildXlsx(sheets, meta = {}) {
  const files = [];
  const sheetEntries = [];
  const used = new Set();

  const firstVisible = Math.max(0, sheets.findIndex((s) => !s.hidden));

  sheets.forEach((sheet, i) => {
    const name = safeSheetName(sheet.name, used);
    const selected = sheet.hidden ? false : (sheet.selected ?? i === firstVisible);
    const xml = sheetXml({ ...sheet, selected });
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml });
    sheetEntries.push({ name, rid: `rId${i + 1}`, hidden: !!sheet.hidden, html: xml });
  });

  const stylesRid = `rId${sheets.length + 1}`;

  const width = (sheet) => (sheet.cols || []).reduce((a, b) => a + (b || 8.43), 0);

  files.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="27126"/>
<workbookPr defaultThemeVersion="166925"/>
<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="${firstVisible}"/></bookViews>
<sheets>${sheetEntries.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="${s.rid}"/>`).join('')}</sheets>
<calcPr calcId="171027" fullCalcOnLoad="1"/>
</workbook>`,
  });

  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetEntries.map((s) => `<Relationship Id="${s.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.rid.replace('rId', '')}.xml"/>`).join('')}
<Relationship Id="${stylesRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });

  files.push({ name: 'xl/styles.xml', data: stylesXml(meta.theme) });

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  files.push({
    name: 'docProps/core.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${xmlEsc(meta.title || 'Orcamento')}</dc:title>
<dc:creator>${xmlEsc(meta.creator || 'Plataforma de Orcamentos')}</dc:creator>
<cp:lastModifiedBy>${xmlEsc(meta.creator || 'Plataforma de Orcamentos')}</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`,
  });

  files.push({
    name: 'docProps/app.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>Plataforma de Orcamentos</Application>
<DocSecurity>0</DocSecurity>
<ScaleCrop>false</ScaleCrop>
<AppVersion>1.0</AppVersion>
</Properties>`,
  });

  files.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  });

  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  });

  return zipWrite(files);
}

// ---------------------------------------------------------------- leitura
function readSharedStrings(files) {
  const buf = files.get('xl/sharedStrings.xml');
  if (!buf) return [];
  const xml = buf.toString('utf8');
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const inner = m[1] || '';
    let text = '';
    const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tre.exec(inner))) text += xmlUnesc(tm[1]);
    out.push(text);
  }
  return out;
}

function workbookSheetPaths(files) {
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('Workbook invalido: xl/workbook.xml ausente.');
  const wbXml = wb.toString('utf8');
  const relsBuf = files.get('xl/_rels/workbook.xml.rels');
  const relsXml = relsBuf ? relsBuf.toString('utf8') : '';

  const relMap = new Map();
  const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g;
  let rm;
  while ((rm = relRe.exec(relsXml))) {
    let target = rm[2];
    if (target.startsWith('/')) target = target.slice(1);
    else if (!target.startsWith('xl/')) target = `xl/${target}`;
    relMap.set(rm[1], target);
  }

  const out = [];
  const sheetRe = /<sheet\b[^>]*name="([^"]*)"[^>]*sheetId="(\d+)"[^>]*r:id="([^"]+)"/g;
  let sm;
  while ((sm = sheetRe.exec(wbXml))) {
    const path = relMap.get(sm[3]);
    if (path) out.push({ name: xmlUnesc(sm[1]), path, sheetId: Number(sm[2]) });
  }
  if (!out.length) {
    // fallback: ordem dos arquivos
    for (let i = 1; files.has(`xl/worksheets/sheet${i}.xml`); i += 1) {
      out.push({ name: `Planilha${i}`, path: `xl/worksheets/sheet${i}.xml`, sheetId: i });
    }
  }
  return out;
}

function parseSheetXml(xml, shared) {
  const rows = [];
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g;
  let rm;
  let autoRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const attrs = rm[1] || rm[3] || '';
    const inner = rm[2] || '';
    const rMatch = /r="(\d+)"/.exec(attrs);
    const rNum = rMatch ? Number(rMatch[1]) : autoRow + 1;
    autoRow = rNum;

    const cells = [];
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRe.exec(inner))) {
      const cAttrs = cm[1] || cm[2] || '';
      const cInner = cm[3] || '';
      const refM = /r="([A-Z]+)(\d+)"/.exec(cAttrs);
      const colNum = refM ? colToNum(refM[1]) : cells.length + 1;
      const tM = /\bt="([^"]+)"/.exec(cAttrs);
      const type = tM ? tM[1] : 'n';

      let value;
      if (type === 'inlineStr') {
        let text = '';
        const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tm;
        while ((tm = tre.exec(cInner))) text += xmlUnesc(tm[1]);
        value = text;
      } else {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(cInner);
        const raw = vM ? xmlUnesc(vM[1]) : '';
        if (type === 's') {
          const idx = Number(raw);
          value = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
        } else if (type === 'str' || type === 'e') {
          value = raw;
        } else if (type === 'b') {
          value = raw === '1';
        } else if (raw === '') {
          value = '';
        } else {
          const n = Number(raw);
          value = Number.isFinite(n) ? n : raw;
        }
      }
      cells[colNum - 1] = value;
    }
    rows[rNum - 1] = cells;
  }
  return rows;
}

/** Detecta e le um arquivo tabular. Retorna {sheets:[{name, rows:[[...]]}], format}. */
export function readTable(buffer, filename = '') {
  const name = String(filename).toLowerCase();
  const head = buffer.subarray(0, 4);

  if (head[0] === 0x50 && head[1] === 0x4b) {
    const files = zipRead(buffer);
    const shared = readSharedStrings(files);
    const sheets = workbookSheetPaths(files).map((s) => {
      const xml = (files.get(s.path) || Buffer.from('')).toString('utf8');
      return { name: s.name, rows: parseSheetXml(xml, shared) };
    });
    return { sheets, format: 'xlsx' };
  }

  if (head[0] === 0xd0 && head[1] === 0xcf) {
    throw new Error('Arquivo .xls (Excel 97-2003) nao suportado. Abra no Excel e salve como .xlsx ou .csv.');
  }

  // Texto: csv / tsv / txt
  return { sheets: [{ name: 'CSV', rows: parseDelimited(buffer) }], format: 'csv' };
}

function decodeText(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('\ufffd')) return utf8.replace(/^\ufeff/, '');
  // Windows-1252 improvisado para pt-BR
  const map = {
    0xc7: 'Ç', 0xe7: 'ç', 0xc1: 'Á', 0xe1: 'á', 0xc9: 'É', 0xe9: 'é', 0xcd: 'Í', 0xed: 'í',
    0xd3: 'Ó', 0xf3: 'ó', 0xda: 'Ú', 0xfa: 'ú', 0xc3: 'Ã', 0xe3: 'ã', 0xd5: 'Õ', 0xf5: 'õ',
    0xc2: 'Â', 0xe2: 'â', 0xca: 'Ê', 0xea: 'ê', 0xd4: 'Ô', 0xf4: 'ô', 0xc0: 'À', 0xe0: 'à',
  };
  let out = '';
  for (const byte of buffer) {
    if (byte < 0x80) out += String.fromCharCode(byte);
    else out += map[byte] || String.fromCharCode(byte);
  }
  return out.replace(/^\ufeff/, '');
}

function parseDelimited(buffer) {
  const text = decodeText(buffer);
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = {
    ';': (firstLine.match(/;/g) || []).length,
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    '|': (firstLine.match(/\|/g) || []).length,
  };
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ';';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

/** Converte valor de celula em numero (aceita "R$ 1.234,56"). */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/R\$\s?/gi, '').replace(/\s/g, '');
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  if (s.includes(',') && s.includes('.')) {
    // 1.234,56 -> 1234.56
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  s = s.replace(/[^0-9.\-+eE]/g, '');
  if (s === '' || s === '-' || s === '+' || s === '.' || s === ',') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Converte celula em texto limpo. */
export function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(value).replace('.', ',');
  }
  return String(value).replace(/\s+/g, ' ').trim();
}
