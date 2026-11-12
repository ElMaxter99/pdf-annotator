/** Pure helpers for «Copiar y adaptar con IA»: the helper answer is untrusted, so everything is validated here. */

export type AiConfidence = 'high' | 'medium' | 'low';

export interface AiRow {
  /** Stable id of the field of A (`p<page>-f<position>`). */
  id: string;
  /** Page and position (0-based) of the field in the template of A. */
  page: number;
  index: number;
  /** The AI found a place for it in B. */
  ok: boolean;
  newPage: number;
  x: number;
  y: number;
  confidence: number;
  reason: string;
  anchorA: string;
  anchorB: string;
}

export interface AiResult {
  rows: AiRow[];
  seconds: number;
  warnings: number;
}

export type AiMessage =
  | { stage: 'reading' | 'asking' | 'resolving' }
  | { result: AiResult }
  | { error: { code: string; message: string; reset: string | null } };

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, max = 400): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

export function sanitizeRow(raw: unknown): AiRow | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const page = Math.trunc(num(r['page'], 0));
  const index = Math.trunc(num(r['index'], -1));
  if (typeof r['id'] !== 'string' || page < 1 || index < 0) {
    return null;
  }
  const ok = r['ok'] === true && Number.isFinite(r['x']) && Number.isFinite(r['y']);
  const newPage = Math.trunc(num(r['newPage'], page));
  return {
    id: r['id'].slice(0, 40),
    page,
    index,
    ok: ok && newPage >= 1,
    newPage: newPage >= 1 ? newPage : page,
    x: Math.max(0, num(r['x'])),
    y: Math.max(0, num(r['y'])),
    confidence: Math.min(1, Math.max(0, num(r['confidence'], 0.5))),
    reason: text(r['reason']),
    anchorA: text(r['anchorA'], 120),
    anchorB: text(r['anchorB'], 120),
  };
}

/** Reads the `\n`-separated JSON lines of the helper; the incomplete tail is returned to be completed later. */
export function parseNdjson(buffer: string): { messages: AiMessage[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const messages: AiMessage[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let data: unknown;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }
    if (!data || typeof data !== 'object') {
      continue;
    }
    const d = data as Record<string, unknown>;
    if (d['stage'] === 'reading' || d['stage'] === 'asking' || d['stage'] === 'resolving') {
      messages.push({ stage: d['stage'] });
    } else if (d['result'] && typeof d['result'] === 'object') {
      const r = d['result'] as Record<string, unknown>;
      const rows = (Array.isArray(r['rows']) ? r['rows'] : [])
        .map(sanitizeRow)
        .filter((row): row is AiRow => !!row);
      messages.push({
        result: {
          rows,
          seconds: num(r['seconds']),
          warnings: Array.isArray(r['warnings']) ? r['warnings'].length : 0,
        },
      });
    } else if (d['error'] && typeof d['error'] === 'object') {
      const e = d['error'] as Record<string, unknown>;
      messages.push({
        error: {
          code: text(e['code'], 30) || 'error',
          message: text(e['message']),
          reset: typeof e['reset'] === 'string' ? e['reset'].slice(0, 40) : null,
        },
      });
    }
  }
  return { messages, rest };
}

export function confidenceLevel(confidence: number): AiConfidence {
  return confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
}

export const rowChangesPage = (row: AiRow): boolean => row.ok && row.newPage !== row.page;

/** Rows that are applied only if the person marks them: low confidence or not found. */
export const rowNeedsReview = (row: AiRow): boolean =>
  !row.ok || confidenceLevel(row.confidence) === 'low';

/** Keys the person ticked on top of the default selection (`checked`) or unticked (`unchecked`). */
export function isRowSelected(row: AiRow, overrides: ReadonlyMap<string, boolean>): boolean {
  if (!row.ok) {
    return false;
  }
  return overrides.get(row.id) ?? !rowNeedsReview(row);
}

export function summarizeAi(rows: AiRow[], overrides: ReadonlyMap<string, boolean>) {
  return {
    total: rows.length,
    placed: rows.filter((row) => row.ok).length,
    changePage: rows.filter(rowChangesPage).length,
    notFound: rows.filter((row) => !row.ok).length,
    selected: rows.filter((row) => isRowSelected(row, overrides)).length,
  };
}

/** Failed or low-confidence rows first, then by page, so the list starts with what needs a look. */
export function sortAiRows(rows: AiRow[]): AiRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(rowNeedsReview(b)) - Number(rowNeedsReview(a)) || a.page - b.page || a.index - b.index,
  );
}
