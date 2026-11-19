import type { PageAnnotations, PageField } from '../models/annotation.model';
import type { AiSavedProposal } from '../models/batch.model';
import type { AiProgress, AiProvider } from '../services/ai-helper.service';
import type { AiDetails, AiLiveEvent, AiRow, AiSent, AiStep, AiUsage } from './ai-proposal.utils';

type AiStage = 'reading' | 'asking' | 'resolving';

/** State of «Copiar y adaptar con IA» in the editor: from the request to the review. */
export interface AiSession {
  phase: 'loading' | 'ready' | 'empty' | 'error';
  provider: AiProvider | 'adjust';
  /** Proposal saved by the batch queue (not asked for here): accepting or discarding it also clears the saved copy. */
  saved?: { at: number } | null;
  stage: AiStage;
  startedAt: number;
  rows: AiRow[];
  /** Fields the person ticked or unticked on top of the default selection. */
  overrides: Record<string, boolean>;
  view: 'proposal' | 'original';
  seconds: number;
  error: { code: string; message: string; reset: string | null } | null;
  /** Live log for «Ver detalles» (no PDF content, only names and counts). */
  sent: AiSent | null;
  attempt: number;
  /** Milliseconds since `startedAt` when each stage began. */
  stageLog: Array<{ stage: AiStage; attempt: number; at: number }>;
  stepLog: Array<{ attempt: number; step: AiStep; at: number }>;
  usage: AiUsage | null;
  details: AiDetails | null;
  detailsOpen: boolean;
  endedAt: number | null;
}

/** Most recent steps kept in the log of «Ver detalles». */
export const AI_STEP_LOG_LIMIT = 60;

/** Row ids are `p<page>-f<position>` over the template of A as it was when the request was made. */
export function aiTemplateMap(template: readonly PageAnnotations[]): Map<string, PageField> {
  const map = new Map<string, PageField>();
  for (const page of template) {
    page.fields.forEach((field, i) => map.set(`p${page.num}-f${i + 1}`, field));
  }
  return map;
}

/** The session while the helper is working (nothing to review yet). */
export function loadingAiSession(provider: AiProvider, now: number): AiSession {
  return {
    phase: 'loading',
    provider,
    stage: 'reading',
    startedAt: now,
    rows: [],
    overrides: {},
    view: 'proposal',
    seconds: 0,
    error: null,
    sent: null,
    attempt: 1,
    stageLog: [{ stage: 'reading', attempt: 1, at: 0 }],
    stepLog: [],
    usage: null,
    details: null,
    detailsOpen: false,
    endedAt: null,
  };
}

/** The helper moved to another stage (or attempt). */
export function withAiProgress(cur: AiSession, progress: AiProgress, now: number): AiSession {
  const attempt = progress.attempt ?? cur.attempt;
  return {
    ...cur,
    stage: progress.stage,
    attempt,
    stageLog: [...cur.stageLog, { stage: progress.stage, attempt, at: now - cur.startedAt }],
  };
}

/** A live event of the helper: what was sent, or the steps it took. Other events change nothing. */
export function withAiEvent(cur: AiSession, event: AiLiveEvent, now: number): AiSession {
  if (event.type === 'sent') {
    return { ...cur, sent: event.sent };
  }
  if (event.type === 'step') {
    const at = now - cur.startedAt;
    return {
      ...cur,
      usage: event.usage ?? cur.usage,
      stepLog: [
        ...cur.stepLog,
        ...event.steps.map((step) => ({ attempt: event.attempt, step, at })),
      ].slice(-AI_STEP_LOG_LIMIT),
    };
  }
  return cur;
}

const KNOWN_PROVIDERS: readonly string[] = ['copilot', 'fake', 'adjust'];

/** The session that opens a proposal saved by the batch queue, ready to review. */
export function savedAiSession(saved: AiSavedProposal, rows: readonly AiRow[]): AiSession {
  return {
    phase: 'ready',
    provider: KNOWN_PROVIDERS.includes(saved.provider)
      ? (saved.provider as AiProvider | 'adjust')
      : 'claude',
    saved: { at: saved.at },
    stage: 'resolving',
    startedAt: saved.at,
    rows: [...rows],
    overrides: {},
    view: 'proposal',
    seconds: saved.seconds,
    error: null,
    sent: saved.details?.sent ?? null,
    attempt: 1,
    stageLog: [],
    stepLog: [],
    usage: null,
    details: saved.details,
    detailsOpen: false,
    endedAt: saved.at,
  };
}
