/** Pure rules for «Trasladar con IA» over a whole batch: who is eligible, what it costs and what to do on each failure. */
import type { BatchItem } from '../models/batch.model';

/** Requests per run with Copilot before the queue stops and asks to continue (credits are not measurable there). */
export const AI_BATCH_COPILOT_CAP = 10;
/** Failures of the same transient kind in a row before the queue stops and asks. */
export const AI_BATCH_BREAKER = 2;

export type AiBatchPhase =
  | 'queued'
  | 'adjusting'
  | 'reading'
  | 'asking'
  | 'resolving'
  | 'ready'
  | 'free'
  | 'partial'
  | 'failed'
  | 'cancelled';

export const AI_BATCH_ACTIVE_PHASES: readonly AiBatchPhase[] = ['adjusting', 'reading', 'asking', 'resolving'];

export function countTemplateFields(item: Pick<BatchItem, 'aPages'>): number {
  return item.aPages.reduce((n, page) => n + (Array.isArray(page.fields) ? page.fields.length : 0), 0);
}

/** A pair can be sent when B exists and A has fields to move. */
export function isEligibleForAiBatch(item: BatchItem): boolean {
  return !!item.bPdf && countTemplateFields(item) > 0;
}

export interface AiBatchEstimate {
  pairs: number;
  fields: number;
  /** PDF bytes that will go to the local helper (A + B of every pair). */
  bytes: number;
  /** Requests to the AI: one per pair, up to two per pair when retry is on. */
  minRequests: number;
  maxRequests: number;
  /** Pairs that would wait for an explicit «Continue» because of the Copilot cap. */
  beyondCap: number;
}

export function estimateAiBatch(
  items: readonly BatchItem[],
  provider: string,
  retry: boolean,
): AiBatchEstimate {
  const pairs = items.filter(isEligibleForAiBatch);
  const cap = provider === 'copilot' ? AI_BATCH_COPILOT_CAP : Infinity;
  return {
    pairs: pairs.length,
    fields: pairs.reduce((n, item) => n + countTemplateFields(item), 0),
    bytes: pairs.reduce((n, item) => n + item.aPdf.size + (item.bPdf?.size ?? 0), 0),
    minRequests: pairs.length,
    maxRequests: pairs.length * (retry ? 2 : 1),
    beyondCap: Math.max(0, pairs.length - cap),
  };
}

/**
 * What a failed request means for the queue:
 * - `limit`: the plan is exhausted, stop everything (the rest stay queued).
 * - `fatal`: the helper or CLI is not there, stop everything.
 * - `transient`: may pass on its own; two in a row stop the queue.
 * - `item`: this pair cannot be solved, the queue goes on.
 * - `aborted`: the user cancelled.
 */
export type AiErrorKind = 'limit' | 'fatal' | 'transient' | 'item' | 'aborted';

export function classifyAiError(code: string): AiErrorKind {
  switch (code) {
    case 'limit':
      return 'limit';
    case 'aborted':
      return 'aborted';
    case 'offline':
    case 'missing':
    case 'busy':
    case 'bad_provider':
      return 'fatal';
    case 'cli_error':
    case 'timeout':
    case 'bad_response':
      return 'transient';
    default:
      return 'item';
  }
}

export function nextPendingId(order: readonly string[], phases: Readonly<Record<string, AiBatchPhase>>): string | null {
  return order.find((id) => phases[id] === 'queued') ?? null;
}
