import type { SearchOption } from './search-select.utils';
import { pairingKey } from './migration.utils';
import { foldChars } from './model-search.utils';

/** Nombre comparable: sin extensión ni «-nuevo/-v2», sin acentos ni mayúsculas y con los separadores como espacio. */
const words = (name: string) =>
  foldChars(pairingKey(name))
    .replace(/[\s._()\-]+/g, ' ')
    .trim();
/** Números del nombre (2 cifras o más, sin ceros a la izquierda): «aso-0412» → 412. */
const numbers = (name: string) =>
  new Set((words(name).match(/\d{2,}/g) ?? []).map((n) => String(Number(n))));

/**
 * Cuánto se parece el nombre de un archivo B al de un PDF del lote (0 = nada). Los números cuentan: si los dos
 * nombres llevan números y no comparten ninguno, no se parecen («asesoramiento-07» frente a «asesoramiento-12»).
 */
export function nameScore(fileName: string, label: string): number {
  const a = words(fileName);
  const b = words(label);
  if (a.length < 2 || b.length < 2) return 0;
  const numsA = numbers(fileName);
  const numsB = numbers(label);
  const shared = [...numsA].some((n) => numsB.has(n));
  if (numsA.size && numsB.size && !shared) return 0;
  if (a === b) return 4;
  const ca = a.replace(/ /g, '');
  const cb = b.replace(/ /g, '');
  if (ca === cb) return 3;
  if (ca.includes(cb) || cb.includes(ca)) return 2;
  if (shared && ca.slice(0, 3) === cb.slice(0, 3)) return 1;
  return 0;
}

/**
 * Sugerencia de pareja para cada archivo B sin pareja: el PDF con el nombre más parecido, solo si es claro (sin
 * empate en la mejor puntuación) y si ningún otro archivo lo quiere con la misma o más puntuación. Un PDF se sugiere
 * como mucho a un archivo. Devuelve `índice del archivo → id del PDF`.
 */
export function suggestPairs(
  files: readonly { readonly name: string }[],
  options: readonly SearchOption[],
): Map<number, string> {
  const best: { file: number; id: string; score: number }[] = [];
  files.forEach((file, index) => {
    let top = 0;
    let ids: string[] = [];
    for (const option of options) {
      const score = nameScore(file.name, option.label);
      if (score > top) {
        top = score;
        ids = [option.id];
      } else if (score === top && score > 0) {
        ids.push(option.id);
      }
    }
    if (top > 0 && ids.length === 1) best.push({ file: index, id: ids[0], score: top });
  });
  const out = new Map<number, string>();
  for (const candidate of best) {
    const rivals = best.filter((other) => other.id === candidate.id && other !== candidate);
    if (rivals.every((other) => other.score < candidate.score))
      out.set(candidate.file, candidate.id);
  }
  return out;
}
