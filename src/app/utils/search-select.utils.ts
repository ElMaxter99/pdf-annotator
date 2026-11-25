import { foldChars } from './model-search.utils';

export interface SearchOption {
  id: string;
  label: string;
}

/** Natural order: «dni2» before «dni10», accents and case ignored. */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** The name without extension and without a trailing copy marker («dni-1», «dni (2)», «dni_v3»). */
export function baseName(name: string): string {
  return foldChars(name)
    .replace(/\.[a-z0-9]{1,5}$/, '')
    .replace(/[\s_-]*(\(\d+\)|v?\d+)$/, '')
    .replace(/[\s_-]+$/, '')
    .trim();
}

/** Up to `limit` options whose name looks like `fileName` (same base name or one contains the other). */
export function suggestOptions(
  fileName: string,
  options: SearchOption[],
  limit = 3,
): SearchOption[] {
  const base = baseName(fileName);
  if (base.length < 2) {
    return [];
  }
  const scored: { option: SearchOption; score: number }[] = [];
  for (const option of options) {
    const other = baseName(option.label);
    if (other.length < 2) {
      continue;
    }
    let score = 0;
    if (other === base) {
      score = 3;
    } else if (other.includes(base) || base.includes(other)) {
      score = 2;
    } else if (other.startsWith(base.slice(0, 3)) && base.startsWith(other.slice(0, 3))) {
      score = 1;
    }
    if (score > 0) {
      scored.push({ option, score });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || naturalCompare(a.option.label, b.option.label))
    .slice(0, limit)
    .map((s) => s.option);
}
