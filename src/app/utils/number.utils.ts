/** Converts numbers and numeric strings to a finite number; anything else yields `null`. */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return fromExtendedJson(value);
}

const EXTENDED_NUMBER_KEYS = ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'];

/** MongoDB extended JSON numbers, e.g. `{ "$numberInt": "12" }` or `{ "$numberDouble": "10.5" }`. */
function fromExtendedJson(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const key = EXTENDED_NUMBER_KEYS.find((candidate) => candidate in record);
  return key && typeof record[key] === 'string' ? toFiniteNumber(record[key]) : null;
}

/** Truncates (does not round) to the given number of decimals and returns a fixed-width string. */
export function formatNumberWithTruncation(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  const truncated = Math.trunc(value * factor) / factor;
  return truncated.toFixed(decimals);
}
