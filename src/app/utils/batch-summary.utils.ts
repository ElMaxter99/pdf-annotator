/** Pure rules for the batch summary: the funnel, «what they have» kinds and why a PDF stays out of «Trasladar con IA». */
import type { BatchItem } from '../models/batch.model';
import { countTemplateFields } from './ai-batch.utils';

/** What a PDF has, whatever its state: template A, version B, both or nothing. */
export type BatchKind = 'none' | 'onlyA' | 'aPlusB' | 'onlyB';
/** Kinds the panel can filter by: the four above plus the funnel steps. */
export type KindFilter = 'any' | BatchKind | 'withA' | 'withB' | 'ai';
/** Why a PDF goes or does not go to the AI (the first rule that applies). */
export type AiReason = 'eligible' | 'noB' | 'ready' | 'noFields';

type Source = Pick<BatchItem, 'aPages' | 'bPdf' | 'bPages' | 'status'>;

export function kindOf(item: Source): BatchKind {
  const hasA = countTemplateFields(item) > 0;
  const hasB = !!item.bPdf;
  if (hasA) {
    return hasB ? 'aPlusB' : 'onlyA';
  }
  return hasB || !!item.bPages ? 'onlyB' : 'none';
}

export function aiReasonOf(item: Source): AiReason {
  if (!item.bPdf) {
    return 'noB';
  }
  if (item.status === 'ready') {
    return 'ready';
  }
  return countTemplateFields(item) > 0 ? 'eligible' : 'noFields';
}

export function matchesKind(item: Source, filter: KindFilter): boolean {
  switch (filter) {
    case 'any':
      return true;
    case 'withA':
      return countTemplateFields(item) > 0;
    case 'withB':
      return !!item.bPdf;
    case 'ai':
      return aiReasonOf(item) === 'eligible';
    default:
      return kindOf(item) === filter;
  }
}

export interface BatchFunnel {
  total: number;
  none: number;
  onlyA: number;
  aPlusB: number;
  onlyB: number;
  withA: number;
  withB: number;
  /** Same rule as the «Trasladar con IA» button. */
  ai: number;
  ready: number;
  /** Not «Listo» and not empty: the «Por revisar» filter. */
  pending: number;
}

export function buildFunnel(items: readonly Source[]): BatchFunnel {
  const f: BatchFunnel = {
    total: items.length,
    none: 0,
    onlyA: 0,
    aPlusB: 0,
    onlyB: 0,
    withA: 0,
    withB: 0,
    ai: 0,
    ready: 0,
    pending: 0,
  };
  for (const item of items) {
    f[kindOf(item)]++;
    if (countTemplateFields(item) > 0) {
      f.withA++;
    }
    if (item.bPdf) {
      f.withB++;
    }
    if (aiReasonOf(item) === 'eligible') {
      f.ai++;
    }
    if (item.status === 'ready') {
      f.ready++;
    } else if (kindOf(item) !== 'none') {
      f.pending++;
    }
  }
  return f;
}

export interface AiBreakdown {
  eligible: number;
  noB: number;
  ready: number;
  noFields: number;
  /** PDFs with a version B: the base of «X de Y se enviarán». */
  withB: number;
}

export function buildAiBreakdown(items: readonly Source[]): AiBreakdown {
  const b: AiBreakdown = { eligible: 0, noB: 0, ready: 0, noFields: 0, withB: 0 };
  for (const item of items) {
    b[aiReasonOf(item)]++;
    if (item.bPdf) {
      b.withB++;
    }
  }
  return b;
}
