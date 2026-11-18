// Formatacao dos valores na saida (planilha/CSV/tela).
// Cada formato devolve { value, type } onde type = 's' (texto) | 'n' (numero).

export const FORMATOS = [
  { id: 'original', label: 'Original (como vem do banco)', decimais: false },
  { id: 'texto', label: 'Texto', decimais: false },
  { id: 'codigo', label: 'Codigo (texto, mantem zeros)', decimais: false },
  { id: 'numero', label: 'Numero', decimais: true },
  { id: 'inteiro', label: 'Inteiro', decimais: false },
  { id: 'decimal', label: 'Decimal', decimais: true },
  { id: 'moeda', label: 'Moeda (R$)', decimais: true },
  { id: 'percentual', label: 'Percentual', decimais: true },
  { id: 'data', label: 'Data (dd/mm/aaaa)', decimais: false },
  { id: 'datahora', label: 'Data e hora', decimais: false },
  { id: 'hora', label: 'Hora (hh:mm)', decimais: false },
  { id: 'maiusculo', label: 'MAIUSCULO', decimais: false },
  { id: 'minusculo', label: 'minusculo', decimais: false },
  { id: 'titulo', label: 'Primeira Maiuscula', decimais: false },
  { id: 'limpar', label: 'Texto limpo (sem espacos duplos)', decimais: false },
  { id: 'sim_nao', label: 'Sim / Nao', decimais: false },
];

const IDS = new Set(FORMATOS.map((f) => f.id));

/** Converte texto em numero aceitando "R$ 1.234,56" e "(10,50)". */
export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.getTime();

  let s = String(value).trim();
  if (!s) return null;
  const negativo = /^-/.test(s) || /^\(.*\)$/.test(s);
  s = s.replace(/R\$\s?/gi, '').replace(/\s/g, '').replace(/[()]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')   // 1.234,56
      : s.replace(/,/g, '');                     // 1,234.56
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  s = s.replace(/[^0-9.\-+eE]/g, '');
  if (!s || s === '-' || s === '+' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -Math.abs(n) : n;
}

const DATA_HORA = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Normaliza datas (Date, ISO, "dd/mm/aaaa") em Date. */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  let m = DATA_HORA.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = DATA_BR.exec(s);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
      Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

function texto(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  return String(value);
}

/** Sugere um formato a partir do tipo da coluna no banco. */
export function sugerirFormato(dbType = '') {
  const t = String(dbType).toLowerCase();
  if (/bool/.test(t)) return 'sim_nao';
  if (/timestamp|datetime/.test(t)) return 'datahora';
  if (/^date|data$/.test(t)) return 'data';
  if (/^time|hora/.test(t)) return 'hora';
  if (/int|serial|long|short/.test(t)) return 'codigo';
  if (/decimal|numeric|money|double|float|real|number/.test(t)) return 'moeda';
  return 'texto';
}

/**
 * Aplica o formato escolhido.
 * @returns {{value: string|number, type: 's'|'n'}}
 */
export function aplicarFormato(value, formato = 'original', decimais) {
  const f = IDS.has(formato) ? formato : 'original';
  if (value === null || value === undefined) return { value: '', type: 's' };

  switch (f) {
    case 'original':
      if (typeof value === 'number') return { value, type: 'n' };
      if (typeof value === 'boolean') return { value: value ? 'Sim' : 'Não', type: 's' };
      return { value: texto(value), type: 's' };

    case 'texto':
      return { value: texto(value), type: 's' };

    case 'codigo': {
      let s = texto(value);
      if (typeof value === 'number' && Number.isInteger(value)) s = String(value);
      return { value: s, type: 's' };
    }

    case 'numero': {
      const n = toNumber(value);
      if (n === null) return { value: '', type: 's' };
      return { value: Number(n.toFixed(decimais ?? 2)), type: 'n' };
    }

    case 'inteiro': {
      const n = toNumber(value);
      return n === null ? { value: '', type: 's' } : { value: Math.round(n), type: 'n' };
    }

    case 'decimal': {
      const n = toNumber(value);
      if (n === null) return { value: '', type: 's' };
      return { value: Number(n.toFixed(decimais ?? 2)), type: 'n' };
    }

    case 'moeda': {
      const n = toNumber(value);
      if (n === null) return { value: '', type: 's' };
      return { value: Number(n.toFixed(decimais ?? 2)), type: 'n' };
    }

    case 'percentual': {
      const n = toNumber(value);
      if (n === null) return { value: '', type: 's' };
      return { value: Number(n.toFixed(decimais ?? 2)), type: 'n' };
    }

    case 'data': {
      const d = toDate(value);
      if (!d) return { value: texto(value), type: 's' };
      return { value: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`, type: 's' };
    }

    case 'datahora': {
      const d = toDate(value);
      if (!d) return { value: texto(value), type: 's' };
      return {
        value: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        type: 's',
      };
    }

    case 'hora': {
      const d = toDate(value);
      if (!d) return { value: texto(value), type: 's' };
      return { value: `${pad(d.getHours())}:${pad(d.getMinutes())}`, type: 's' };
    }

    case 'maiusculo':
      return { value: texto(value).toUpperCase(), type: 's' };

    case 'minusculo':
      return { value: texto(value).toLowerCase(), type: 's' };

    case 'titulo': {
      const s = texto(value).toLowerCase().replace(/\s+/g, ' ').trim();
      return { value: s.replace(/(^|\s)\S/g, (m) => m.toUpperCase()), type: 's' };
    }

    case 'limpar':
      return { value: texto(value).replace(/\s+/g, ' ').trim(), type: 's' };

    case 'sim_nao': {
      if (typeof value === 'boolean') return { value: value ? 'Sim' : 'Não', type: 's' };
      const s = texto(value).trim().toLowerCase();
      if (['1', 't', 'true', 's', 'sim', 'y', 'yes'].includes(s)) return { value: 'Sim', type: 's' };
      if (['0', 'f', 'false', 'n', 'nao', 'não', 'no'].includes(s)) return { value: 'Não', type: 's' };
      return { value: texto(value), type: 's' };
    }

    default:
      return { value: texto(value), type: 's' };
  }
}
