import {
  DEFAULT_DATE_FORMAT,
  formatDateParts,
  formatDateValue,
  parseDateValue,
  sanitizeDateFormat,
} from './date-format.utils';

describe('date-format.utils', () => {
  it('reads ISO dates, ISO timestamps and day/month/year', () => {
    expect(parseDateValue('2026-12-31')).toEqual({ year: 2026, month: 12, day: 31 });
    expect(parseDateValue('2026-03-05T10:00:00Z')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDateValue('2026-03-05T10:00:00.000+01:00')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDateValue(' 5/3/2026 ')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDateValue('05-03-2026')).toEqual({ year: 2026, month: 3, day: 5 });
    expect(parseDateValue('05.03.2026')).toEqual({ year: 2026, month: 3, day: 5 });
  });

  it('rejects anything that is not a real date', () => {
    for (const raw of ['', 'mañana', '2026-13-01', '31/02/2026', '29/02/2025', '2026/12/31', '12/31', 42, null]) {
      expect(parseDateValue(raw)).withContext(String(raw)).toBeNull();
    }
    expect(parseDateValue('29/02/2024')).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it('formats with every token and copies the rest', () => {
    const d = { year: 2026, month: 3, day: 5 };
    expect(formatDateParts(d, 'DD/MM/YYYY')).toBe('05/03/2026');
    expect(formatDateParts(d, 'D/M/YY')).toBe('5/3/26');
    expect(formatDateParts(d, 'YYYY-MM-DD')).toBe('2026-03-05');
    expect(formatDateParts(d, 'DD de MM de YYYY')).toBe('05 de 03 de 2026');
    expect(formatDateParts({ year: 2005, month: 11, day: 20 }, 'YY')).toBe('05');
  });

  it('formats a value, or leaves it as it is when it is not a date', () => {
    expect(formatDateValue('2026-12-31', 'DD.MM.YYYY')).toBe('31.12.2026');
    expect(formatDateValue('2026-12-31', undefined)).toBe('31/12/2026');
    expect(formatDateValue('2026-12-31', 'sin símbolos')).toBe('31/12/2026');
    expect(formatDateValue('{{factura.fecha}}', 'YYYY')).toBe('{{factura.fecha}}');
  });

  it('sanitizes formats read from JSON or storage', () => {
    expect(sanitizeDateFormat(' DD/MM/YYYY ')).toBe('DD/MM/YYYY');
    expect(sanitizeDateFormat('DD\nMM\u0000YYYY')).toBe('DD MM YYYY');
    expect(sanitizeDateFormat('x'.repeat(40) + 'YYYY')).toBeUndefined();
    expect(sanitizeDateFormat('dd/mm/yyyy')).toBeUndefined();
    expect(sanitizeDateFormat('')).toBeUndefined();
    expect(sanitizeDateFormat(12)).toBeUndefined();
    expect(sanitizeDateFormat(DEFAULT_DATE_FORMAT)).toBe(DEFAULT_DATE_FORMAT);
  });
});
