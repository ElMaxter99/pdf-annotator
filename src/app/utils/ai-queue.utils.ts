/** Pure rules for the helper-side queue («Trasladar con IA» keeps running in `tools/ai-helper` after a reload). */
import type { AiBatchPhase } from './ai-batch.utils';

/** What the browser remembers to find its queue again after a reload or after closing the tab. */
export interface AiQueueInfo {
  readonly batchId: string;
  readonly provider: string;
  readonly startedAt: number;
  /** Every PDF of the run, in panel order. */
  readonly order: readonly string[];
  /** Helper item id (`i0`, `i1`…) → id of the PDF in the batch. */
  readonly map: Readonly<Record<string, string>>;
  /** PDFs whose proposal is already in the batch (or solved without AI), so a reload never brings them back. */
  readonly taken: Readonly<Record<string, AiQueueTaken>>;
}

export interface AiQueueTaken {
  readonly phase: 'ready' | 'partial' | 'free';
  readonly placed: number;
  readonly total: number;
  /** Fields that do not exist in B (leaving them out is right). */
  readonly absent?: number;
  /** Fields that were not in A (new page of a field repeated on every page). */
  readonly added?: number;
  /** Fields of A placed with doubts (not «sure»). */
  readonly toCheck?: number;
}

export interface AiRemoteItem {
  id: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  stage: string | null;
  attempt: number | null;
  error: { code: string; message: string; reset: string | null } | null;
}

export interface AiRemoteSnapshot {
  id: string;
  rev: number;
  state: 'active' | 'done' | 'cancelled';
  concurrency: number;
  paused: { reason: 'limit' | 'breaker'; reset: string | null; code: string | null } | null;
  items: AiRemoteItem[];
}

const ID = /^[\w.\-:]{1,80}$/;
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The stored value is not trusted: it is rebuilt field by field. */
export function parseQueueInfo(raw: string | null): AiQueueInfo | null {
  if (!raw) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const batchId = str(data['batchId'], 80);
    if (!ID.test(batchId)) {
      return null;
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries((data['map'] ?? {}) as Record<string, unknown>).slice(
      0,
      500,
    )) {
      if (ID.test(key) && typeof value === 'string' && value.length <= 120) {
        map[key] = value;
      }
    }
    const taken: Record<string, AiQueueTaken> = {};
    for (const [key, value] of Object.entries(
      (data['taken'] ?? {}) as Record<string, Record<string, unknown>>,
    ).slice(0, 500)) {
      const phase = value?.['phase'];
      if (
        typeof key === 'string' &&
        key.length <= 120 &&
        (phase === 'ready' || phase === 'partial' || phase === 'free')
      ) {
        taken[key] = { phase, placed: num(value['placed']), total: num(value['total']), absent: num(value['absent']) };
      }
    }
    const order = Array.isArray(data['order'])
      ? (data['order'] as unknown[])
          .filter((v): v is string => typeof v === 'string' && v.length <= 120)
          .slice(0, 500)
      : [];
    return {
      batchId,
      provider: str(data['provider'], 20),
      startedAt: num(data['startedAt']),
      order,
      map,
      taken,
    };
  } catch {
    return null;
  }
}

/** The helper's answer is rebuilt too: anything unexpected becomes «not a queue». */
export function parseSnapshot(raw: unknown): AiRemoteSnapshot | null {
  const data = raw as Record<string, unknown> | null;
  if (!data || typeof data !== 'object' || !Array.isArray(data['items'])) {
    return null;
  }
  const state = data['state'];
  if (state !== 'active' && state !== 'done' && state !== 'cancelled') {
    return null;
  }
  const items: AiRemoteItem[] = [];
  for (const entry of (data['items'] as unknown[]).slice(0, 500)) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const id = str(item['id'], 80);
    const s = item['state'];
    if (
      !ID.test(id) ||
      (s !== 'queued' && s !== 'running' && s !== 'done' && s !== 'failed' && s !== 'cancelled')
    ) {
      continue;
    }
    const err = item['error'] as Record<string, unknown> | null;
    items.push({
      id,
      state: s,
      stage: typeof item['stage'] === 'string' ? (item['stage'] as string).slice(0, 20) : null,
      attempt: typeof item['attempt'] === 'number' ? (item['attempt'] as number) : null,
      error:
        err && typeof err === 'object'
          ? {
              code: str(err['code'], 40) || 'error',
              message: str(err['message'], 400),
              reset:
                typeof err['reset'] === 'string' ? (err['reset'] as string).slice(0, 40) : null,
            }
          : null,
    });
  }
  const p = data['paused'] as Record<string, unknown> | null;
  const reason = p?.['reason'];
  return {
    id: str(data['id'], 80),
    rev: num(data['rev']),
    state,
    concurrency: Math.min(2, Math.max(1, Math.trunc(num(data['concurrency'])) || 1)),
    paused:
      p && (reason === 'limit' || reason === 'breaker')
        ? {
            reason,
            reset: typeof p['reset'] === 'string' ? (p['reset'] as string).slice(0, 40) : null,
            code: typeof p['code'] === 'string' ? (p['code'] as string).slice(0, 40) : null,
          }
        : null,
    items,
  };
}

/** Row phase in the panel for one helper item. `done` waits for its proposal to be fetched, so it still reads as resolving. */
export function phaseOfRemote(item: Pick<AiRemoteItem, 'state' | 'stage'>): AiBatchPhase {
  switch (item.state) {
    case 'queued':
      return 'queued';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'done':
      return 'resolving';
    default:
      return item.stage === 'asking' || item.stage === 'resolving' ? item.stage : 'reading';
  }
}

/** Helper item ids are `i<position>`: the PDF ids never travel to the helper. */
export const remoteItemId = (index: number): string => `i${index}`;
