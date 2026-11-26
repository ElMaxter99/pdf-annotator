/**
 * Fechas de las anotaciones de tipo `date`. El formato usa los símbolos DD, D, MM, M, YYYY y YY; cualquier otro
 * carácter se copia tal cual. Los datos se leen con reglas propias (nunca `new Date(texto)`, que depende del navegador).
 */
export const DEFAULT_DATE_FORMAT = 'DD/MM/YYYY';
export const DATE_FORMAT_PRESETS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'YYYY-MM-DD',
  'DD/MM/YY',
  'D/M/YYYY',
] as const;
export const MAX_DATE_FORMAT_LENGTH = 32;

const TOKENS = /YYYY|YY|DD|D|MM|M/g;

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Formato guardado o importado (no confiable): texto plano, ≤ 32 caracteres y con algún símbolo de fecha. */
export function sanitizeDateFormat(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const clean = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_DATE_FORMAT_LENGTH);
  TOKENS.lastIndex = 0;
  return clean && TOKENS.test(clean) ? clean : undefined;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day <= days[month - 1];
}

/** Lee `2026-12-31`, `2026-12-31T10:00:00Z` y `31/12/2026` (también con `-` o `.`). Otro valor → `null`. */
export function parseDateValue(raw: unknown): DateParts | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : [NaN, NaN, NaN];
  return isRealDate(year, month, day) ? { year, month, day } : null;
}

export function formatDateParts(parts: DateParts, format: string): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return format.replace(TOKENS, (token) => {
    switch (token) {
      case 'YYYY':
        return pad(parts.year, 4);
      case 'YY':
        return pad(parts.year % 100, 2);
      case 'DD':
        return pad(parts.day, 2);
      case 'D':
        return String(parts.day);
      case 'MM':
        return pad(parts.month, 2);
      default:
        return String(parts.month);
    }
  });
}

/** Lo que pinta una anotación de fecha: el dato con su formato si se entiende como fecha; si no, el texto tal cual. */
export function formatDateValue(raw: string, format: unknown): string {
  const parts = parseDateValue(raw);
  return parts ? formatDateParts(parts, sanitizeDateFormat(format) ?? DEFAULT_DATE_FORMAT) : raw;
}
