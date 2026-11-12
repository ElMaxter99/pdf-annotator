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
  details: AiDetails | null;
}

/** What went to the AI: only names and sizes, never the content of the PDFs. */
export interface AiSent {
  files: Array<{ name: string; bytes: number }>;
  fields: number;
  pagesA: number;
  pagesB: number;
  textsA: number;
  textsB: number;
  textsByPageA?: number[];
  textsByPageB?: number[];
  imageBytes: number;
}

export interface AiUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type AiStep = { kind: 'read'; file: string; tool: string } | { kind: 'answer'; chars: number };

export interface AiAttempt {
  n: number;
  seconds: number;
  usage: AiUsage | null;
  costUsd: number | null;
  turns: number | null;
  permissionDenials: number;
  parsed: number;
  warnings: number;
  retry: boolean;
}

export type AiDiagnosis =
  | 'no_text_a'
  | 'no_text_b'
  | 'permission_denied'
  | 'no_valid_answer'
  | 'anchors_not_found'
  | 'ai_found_nothing'
  | 'partial';

export interface AiDetails {
  model: string | null;
  sent: AiSent | null;
  attempts: AiAttempt[];
  /** `measured`: the CLI reports real usage (Claude). `unavailable`: it does not (Copilot). */
  usageSource: 'measured' | 'unavailable' | 'none';
  seconds: number;
  placed: number;
  notPlaced: Record<string, number>;
  diagnosis: AiDiagnosis | null;
}

export type AiLiveEvent =
  | { type: 'sent'; sent: AiSent }
  | { type: 'step'; attempt: number; steps: AiStep[]; usage: AiUsage | null }
  | { type: 'resolved'; placed: number; total: number; diagnosis: AiDiagnosis | null };

export type AiMessage =
  | { stage: 'reading' | 'asking' | 'resolving'; n?: number }
  | { event: AiLiveEvent }
  | { result: AiResult }
  | { error: { code: string; message: string; reset: string | null; details?: AiDetails | null } };

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, max = 400): string =>
  typeof value === 'string' ? value.slice(0, max) : '';

const DIAGNOSES: readonly AiDiagnosis[] = [
  'no_text_a',
  'no_text_b',
  'permission_denied',
  'no_valid_answer',
  'anchors_not_found',
  'ai_found_nothing',
  'partial',
];
const diagnosisOf = (value: unknown): AiDiagnosis | null =>
  DIAGNOSES.includes(value as AiDiagnosis) ? (value as AiDiagnosis) : null;
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const count = (value: unknown): number => Math.max(0, Math.trunc(num(value)));

export function sanitizeUsage(raw: unknown): AiUsage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = obj(raw);
  return {
    input: count(r['input']),
    output: count(r['output']),
    cacheRead: count(r['cacheRead']),
    cacheWrite: count(r['cacheWrite']),
  };
}

export function sanitizeSent(raw: unknown): AiSent | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = obj(raw);
  const files = (Array.isArray(r['files']) ? r['files'] : []).slice(0, 80).flatMap((f) => {
    const o = obj(f);
    return typeof o['name'] === 'string'
      ? [{ name: (o['name'] as string).slice(0, 60), bytes: count(o['bytes']) }]
      : [];
  });
  return {
    files,
    fields: count(r['fields']),
    pagesA: count(r['pagesA']),
    pagesB: count(r['pagesB']),
    textsA: count(r['textsA']),
    textsB: count(r['textsB']),
    textsByPageA: (Array.isArray(r['textsByPageA']) ? r['textsByPageA'] : []).slice(0, 200).map(count),
    textsByPageB: (Array.isArray(r['textsByPageB']) ? r['textsByPageB'] : []).slice(0, 200).map(count),
    imageBytes: count(r['imageBytes']),
  };
}

export function sanitizeSteps(raw: unknown): AiStep[] {
  return (Array.isArray(raw) ? raw : []).slice(0, 40).flatMap((item): AiStep[] => {
    const o = obj(item);
    if (o['kind'] === 'read') {
      return [{ kind: 'read', file: text(o['file'], 60), tool: text(o['tool'], 30) }];
    }
    return o['kind'] === 'answer' ? [{ kind: 'answer', chars: count(o['chars']) }] : [];
  });
}

export function sanitizeDetails(raw: unknown): AiDetails | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const r = obj(raw);
  const attempts = (Array.isArray(r['attempts']) ? r['attempts'] : []).slice(0, 4).map((a) => {
    const o = obj(a);
    return {
      n: count(o['n']),
      seconds: num(o['seconds']),
      usage: sanitizeUsage(o['usage']),
      costUsd: typeof o['costUsd'] === 'number' && Number.isFinite(o['costUsd']) ? o['costUsd'] : null,
      turns: typeof o['turns'] === 'number' ? count(o['turns']) : null,
      permissionDenials: count(o['permissionDenials']),
      parsed: count(o['parsed']),
      warnings: count(o['warnings']),
      retry: o['retry'] === true,
    };
  });
  const notPlaced: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj(r['notPlaced'])).slice(0, 10)) {
    notPlaced[key.slice(0, 40)] = count(value);
  }
  const source = r['usageSource'];
  return {
    model: typeof r['model'] === 'string' ? r['model'].slice(0, 60) : null,
    sent: sanitizeSent(r['sent']),
    attempts,
    usageSource: source === 'measured' || source === 'unavailable' ? source : 'none',
    seconds: num(r['seconds']),
    placed: count(r['placed']),
    notPlaced,
    diagnosis: diagnosisOf(r['diagnosis']),
  };
}

export function sanitizeEvent(raw: unknown): AiLiveEvent | null {
  const r = obj(raw);
  if (r['type'] === 'sent') {
    const sent = sanitizeSent(r['sent']);
    return sent ? { type: 'sent', sent } : null;
  }
  if (r['type'] === 'step') {
    return {
      type: 'step',
      attempt: Math.max(1, count(r['attempt'])),
      steps: sanitizeSteps(r['steps']),
      usage: sanitizeUsage(r['usage']),
    };
  }
  if (r['type'] === 'resolved') {
    return {
      type: 'resolved',
      placed: count(r['placed']),
      total: count(r['total']),
      diagnosis: diagnosisOf(r['diagnosis']),
    };
  }
  return null;
}

export const usageTotal = (u: AiUsage | null): number =>
  u ? u.input + u.output + u.cacheRead + u.cacheWrite : 0;

export function sumUsage(list: Array<AiUsage | null>): AiUsage | null {
  const found = list.filter((u): u is AiUsage => !!u);
  return found.length
    ? found.reduce((a, b) => ({
        input: a.input + b.input,
        output: a.output + b.output,
        cacheRead: a.cacheRead + b.cacheRead,
        cacheWrite: a.cacheWrite + b.cacheWrite,
      }))
    : null;
}

/** Rough token count for a provider that reports none: text at ~4 bytes per token, each page image at ~1,600. Always shown as an estimate. */
export function estimateTokens(sent: AiSent | null, requests = 1): number {
  if (!sent) {
    return 0;
  }
  const textBytes = sent.files
    .filter((f) => !f.name.endsWith('.png') && !f.name.endsWith('.pdf'))
    .reduce((n, f) => n + f.bytes, 0);
  const images = sent.files.filter((f) => f.name.endsWith('.png')).length;
  return Math.round((textBytes / 4 + images * 1600) * Math.max(1, requests) / 100) * 100;
}

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
      const n = count(d['n']);
      messages.push(n ? { stage: d['stage'], n } : { stage: d['stage'] });
    } else if (d['event'] && typeof d['event'] === 'object') {
      const event = sanitizeEvent(d['event']);
      if (event) {
        messages.push({ event });
      }
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
          details: sanitizeDetails(r['details']),
        },
      });
    } else if (d['error'] && typeof d['error'] === 'object') {
      const e = d['error'] as Record<string, unknown>;
      messages.push({
        error: {
          code: text(e['code'], 30) || 'error',
          message: text(e['message']),
          reset: typeof e['reset'] === 'string' ? e['reset'].slice(0, 40) : null,
          details: sanitizeDetails(e['details']),
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
