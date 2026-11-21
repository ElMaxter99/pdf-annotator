import type { PageAnnotations, PageField } from '../models/annotation.model';
import type { AiRow } from './ai-proposal.utils';

/**
 * Campos que se repiten en el mismo sitio de cada página de A (número de página, pie, sello…). Si B tiene otro
 * número de páginas, la propuesta se completa con uno por página de B en esa misma posición, sin IA.
 * - `indexed`: el nombre lleva un número que sigue a la página («numpages0» en la 1, «numpages1» en la 2…).
 * - `same`: el mismo nombre en todas las páginas («{{pagina}}»).
 */
export interface PagePattern {
  kind: 'indexed' | 'same';
  /** Campo de A por página de A (id `p<página>-f<n>` → campo). */
  members: { id: string; page: number; field: PageField }[];
  /** Nombre por número: prefijo + número (con el mismo relleno de ceros) + sufijo; `offset` = número − página. */
  prefix: string;
  suffix: string;
  pad: number;
  offset: number;
}

const TOL = 3;
const MIN_PAGES = 3;
const NUMBERED = /^(.*?)(\d+)(\D*)$/;

/** Patrones de A: misma posición (±3 pt) y tipo en al menos 3 páginas distintas, con nombre numerado por página o igual. */
export function findPagePatterns(template: readonly PageAnnotations[]): PagePattern[] {
  const all = template.flatMap((page) =>
    page.fields.map((field, i) => ({ id: `p${page.num}-f${i + 1}`, page: page.num, field })),
  );
  const used = new Set<string>();
  const patterns: PagePattern[] = [];
  for (const seed of all) {
    if (used.has(seed.id)) continue;
    const near = all.filter(
      (o) =>
        !used.has(o.id) &&
        Math.abs(o.field.x - seed.field.x) <= TOL &&
        Math.abs(o.field.y - seed.field.y) <= TOL &&
        (o.field.type ?? 'text') === (seed.field.type ?? 'text'),
    );
    // Uno por página (si una página tiene dos en el mismo sitio, no es un patrón de página).
    const byPage = new Map<number, (typeof near)[number]>();
    let clash = false;
    for (const o of near) {
      if (byPage.has(o.page)) clash = true;
      byPage.set(o.page, o);
    }
    if (clash || byPage.size < MIN_PAGES) continue;
    const members = [...byPage.values()].sort((a, b) => a.page - b.page);
    const pattern = namePattern(members);
    if (!pattern) continue;
    for (const m of members) used.add(m.id);
    patterns.push(pattern);
  }
  return patterns;
}

function namePattern(members: PagePattern['members']): PagePattern | null {
  const names = members.map((m) => String(m.field.mapField ?? '').trim());
  if (names.some((n) => !n)) return null;
  if (names.every((n) => n === names[0])) {
    return { kind: 'same', members, prefix: names[0], suffix: '', pad: 0, offset: 0 };
  }
  const parts = names.map((n) => NUMBERED.exec(n));
  if (parts.some((p) => !p)) return null;
  const [first] = parts as RegExpExecArray[];
  const prefix = first[1];
  const suffix = first[3];
  const offset = Number(first[2]) - members[0].page;
  const pad = first[2].length > 1 && first[2].startsWith('0') ? first[2].length : 0;
  const ok = (parts as RegExpExecArray[]).every(
    (p, i) => p[1] === prefix && p[3] === suffix && Number(p[2]) - members[i].page === offset,
  );
  return ok ? { kind: 'indexed', members, prefix, suffix, pad, offset } : null;
}

/** Nombre del campo del patrón para una página de B. */
export function patternName(pattern: PagePattern, pageB: number): string {
  if (pattern.kind === 'same') return pattern.prefix;
  const n = String(pageB + pattern.offset);
  return `${pattern.prefix}${pattern.pad ? n.padStart(pattern.pad, '0') : n}${pattern.suffix}`;
}

/**
 * Completa la propuesta con los patrones de página: una fila por página de B (1…pagesB) en la posición del patrón.
 * Las filas de los campos de A que ya tienen pareja de página (mismo número) se recolocan si no estaban colocadas o
 * estaban en otra página; las páginas de B que no existían en A reciben filas nuevas (`pattern-<g>-p<n>`) cuyo campo
 * (copia del último de A con el nombre que toca) va en `extra`. Las páginas de A que ya no existen en B se dejan como
 * estaban. Devuelve también cuántas filas añade o recoloca.
 */
export function extendPagePattern(
  rows: readonly AiRow[],
  template: readonly PageAnnotations[],
  pagesB: number,
): { rows: AiRow[]; extra: Map<string, PageField>; placed: number } {
  const out = rows.map((row) => ({ ...row }));
  const extra = new Map<string, PageField>();
  let placed = 0;
  if (!Number.isInteger(pagesB) || pagesB < 1) return { rows: out, extra, placed };
  findPagePatterns(template).forEach((pattern, g) => {
    const last = pattern.members[pattern.members.length - 1];
    for (let pageB = 1; pageB <= pagesB; pageB++) {
      const name = patternName(pattern, pageB);
      const member =
        pattern.kind === 'same'
          ? pattern.members.find((m) => m.page === pageB)
          : pattern.members.find((m) => String(m.field.mapField).trim() === name);
      const ref = member ?? last;
      const at = { x: ref.field.x, y: ref.field.y };
      const reason = `Se repite en cada página de A (${pattern.members.length} de ${pattern.members.length}): misma posición en la página ${pageB} de B.`;
      if (member) {
        const row = out.find((r) => r.id === member.id);
        if (row && (!row.ok || row.newPage !== pageB)) {
          Object.assign(row, { ok: true, newPage: pageB, ...at, confidence: 0.8, reason, why: '', source: 'pattern' as const });
          placed += 1;
        }
        continue;
      }
      const id = `pattern-${g + 1}-p${pageB}`;
      extra.set(id, { ...last.field, mapField: name });
      out.push({
        id,
        page: last.page,
        index: -1,
        ok: true,
        newPage: pageB,
        ...at,
        confidence: 0.8,
        reason,
        anchorA: '',
        anchorB: '',
        why: '',
        source: 'pattern',
      });
      placed += 1;
    }
  });
  return { rows: out, extra, placed };
}
