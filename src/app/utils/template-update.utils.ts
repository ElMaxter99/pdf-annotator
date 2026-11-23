import type { PageAnnotations, PageField } from '../models/annotation.model';

export interface PageDiff {
  readonly num: number;
  readonly before: number;
  readonly after: number;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

export interface TemplateDiff {
  readonly before: number;
  readonly after: number;
  readonly added: number;
  readonly removed: number;
  /** Fields that exist on both sides but moved or were edited. */
  readonly changed: number;
  readonly pages: readonly PageDiff[];
  readonly same: boolean;
}

export function countFields(pages: readonly PageAnnotations[]): number {
  return pages.reduce((sum, page) => sum + page.fields.length, 0);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => key !== 'aiId' && record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function diffFields(
  before: readonly PageField[],
  after: readonly PageField[],
): Pick<PageDiff, 'added' | 'removed' | 'changed'> {
  const pool = new Map<string, number>();
  for (const field of before) {
    const key = stable(field);
    pool.set(key, (pool.get(key) ?? 0) + 1);
  }
  let leftNew = 0;
  for (const field of after) {
    const key = stable(field);
    const left = pool.get(key) ?? 0;
    if (left > 0) {
      pool.set(key, left - 1);
    } else {
      leftNew++;
    }
  }
  let leftOld = 0;
  pool.forEach((count) => (leftOld += count));
  const changed = Math.min(leftOld, leftNew);
  return { added: leftNew - changed, removed: leftOld - changed, changed };
}

/** What replacing the template `before` with `after` would do, per page and in total. */
export function diffTemplates(
  before: readonly PageAnnotations[],
  after: readonly PageAnnotations[],
): TemplateDiff {
  const nums = new Set<number>([...before.map((p) => p.num), ...after.map((p) => p.num)]);
  const pages = [...nums]
    .sort((a, b) => a - b)
    .map((num): PageDiff => {
      const b = before.find((page) => page.num === num)?.fields ?? [];
      const a = after.find((page) => page.num === num)?.fields ?? [];
      return { num, before: b.length, after: a.length, ...diffFields(b, a) };
    });
  const total = pages.reduce(
    (sum, page) => ({
      added: sum.added + page.added,
      removed: sum.removed + page.removed,
      changed: sum.changed + page.changed,
    }),
    { added: 0, removed: 0, changed: 0 },
  );
  return {
    before: countFields(before),
    after: countFields(after),
    ...total,
    pages,
    same: total.added + total.removed + total.changed === 0,
  };
}
