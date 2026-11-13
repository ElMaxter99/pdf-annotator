import { Injectable, computed, inject, signal } from '@angular/core';
import type { BatchItem } from '../models/batch.model';
import {
  AI_BATCH_ACTIVE_PHASES,
  AI_BATCH_BREAKER,
  AI_BATCH_COPILOT_CAP,
  AiBatchPhase,
  classifyAiError,
  isEligibleForAiBatch,
} from '../utils/ai-batch.utils';
import { AiUsage, sumUsage } from '../utils/ai-proposal.utils';
import { cascadeAdjust } from '../utils/adjust-cascade.utils';
import { AiHelperService, AiRequestError } from './ai-helper.service';
import { BatchStoreService } from './batch-store.service';
import { PdfTextService } from './pdf-text.service';

export interface AiBatchRow {
  id: string;
  phase: AiBatchPhase;
  attempt: number;
  startedAt: number | null;
  endedAt: number | null;
  placed: number;
  total: number;
  usage: AiUsage | null;
  error: { code: string; message: string; reset: string | null } | null;
}

export type AiBatchRun = 'idle' | 'running' | 'paused' | 'done';

/** Why the queue is paused: the person asked, or it stopped by itself to protect the quota. */
export interface AiBatchPause {
  kind: 'user' | 'limit' | 'breaker' | 'fatal' | 'cap';
  code?: string;
  reset?: string | null;
}

export type AiBatchStart = 'started' | 'nothing' | 'busy' | 'not_ready' | 'no_consent';

/**
 * Sends every pair of the batch to the AI helper one after another («Trasladar con IA»). Nothing is applied:
 * each answer is stored in the item as a proposal that the person reviews in the editor. Pure rules live in
 * `utils/ai-batch.utils.ts`; this class only runs the queue and keeps the state for the panel.
 */
@Injectable({ providedIn: 'root' })
export class AiBatchService {
  private readonly ai = inject(AiHelperService);
  private readonly batch = inject(BatchStoreService);
  private readonly texts = inject(PdfTextService);

  readonly rows = signal<Record<string, AiBatchRow>>({});
  readonly run = signal<AiBatchRun>('idle');
  readonly pause = signal<AiBatchPause | null>(null);
  /** Requests started in this run (shown while the provider reports no tokens). */
  readonly requests = signal(0);
  readonly startedAt = signal<number | null>(null);

  readonly order = signal<string[]>([]);
  readonly usage = computed(() => sumUsage(Object.values(this.rows()).map((row) => row.usage)));
  readonly counts = computed(() => {
    const all = Object.values(this.rows());
    const n = (...phases: AiBatchPhase[]) => all.filter((row) => phases.includes(row.phase)).length;
    return {
      total: all.length,
      queued: n('queued'),
      active: all.filter((row) => AI_BATCH_ACTIVE_PHASES.includes(row.phase)).length,
      done: n('ready', 'free', 'partial'),
      failed: n('failed'),
      cancelled: n('cancelled'),
    };
  });
  /** True while the helper is in use, so the single-pair button must wait. */
  readonly busy = computed(() => this.run() === 'running');

  private abort: AbortController | null = null;
  private generation = 0;
  private pauseRequested = false;
  private cascade = false;
  private sentInWindow = 0;
  private streak: { kind: string; n: number } = { kind: '', n: 0 };

  /** Starts a new run over `ids` (default: every eligible pair). Pairs without B or without fields are skipped. */
  start(ids?: readonly string[], options: { cascade?: boolean } = {}): AiBatchStart {
    if (this.run() === 'running') {
      return 'busy';
    }
    if (this.ai.connection() !== 'ready') {
      return 'not_ready';
    }
    if (!this.ai.consent()) {
      return 'no_consent';
    }
    const wanted = ids ? new Set(ids) : null;
    const pairs = this.batch
      .items()
      .filter((item) => (!wanted || wanted.has(item.id)) && isEligibleForAiBatch(item));
    if (!pairs.length) {
      return 'nothing';
    }
    this.cascade = options.cascade === true;
    this.order.set(pairs.map((item) => item.id));
    this.rows.set(Object.fromEntries(pairs.map((item) => [item.id, emptyRow(item.id)])));
    this.requests.set(0);
    this.startedAt.set(Date.now());
    this.sentInWindow = 0;
    this.streak = { kind: '', n: 0 };
    void this.loop();
    return 'started';
  }

  /** Stops after the pair in progress; the rest stay queued. */
  requestPause(): void {
    if (this.run() === 'running') {
      this.pauseRequested = true;
    }
  }

  /** Continues a paused queue (also the explicit «Continue» after the Copilot cap or a stop by failures). */
  resume(): void {
    if (this.run() !== 'paused') {
      return;
    }
    this.sentInWindow = 0;
    this.streak = { kind: '', n: 0 };
    void this.loop();
  }

  /** Aborts the CLI at once and marks what was not finished as cancelled. */
  cancel(): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.pauseRequested = false;
    this.pause.set(null);
    this.rows.update((rows) =>
      mapRows(rows, (row) =>
        row.phase === 'queued' || AI_BATCH_ACTIVE_PHASES.includes(row.phase)
          ? { ...row, phase: 'cancelled', endedAt: Date.now() }
          : row,
      ),
    );
    this.run.set(this.order().length ? 'done' : 'idle');
  }

  /** Aborts only the pair in progress («Cancelar este»); the queue goes on with the next one. */
  skipCurrent(): void {
    this.abort?.abort();
  }

  /** Manual retry of what failed or was cancelled; never automatic. */
  retryFailed(): AiBatchStart {
    if (this.run() === 'running') {
      return 'busy';
    }
    const again = Object.values(this.rows())
      .filter((row) => row.phase === 'failed' || row.phase === 'cancelled')
      .map((row) => row.id);
    if (!again.length) {
      return 'nothing';
    }
    this.rows.update((rows) => mapRows(rows, (row) => (again.includes(row.id) ? emptyRow(row.id) : row)));
    this.sentInWindow = 0;
    this.streak = { kind: '', n: 0 };
    this.pause.set(null);
    void this.loop();
    return 'started';
  }

  /** Forgets the last run (the stored proposals stay in the items). */
  reset(): void {
    if (this.run() === 'running') {
      return;
    }
    this.rows.set({});
    this.order.set([]);
    this.pause.set(null);
    this.run.set('idle');
  }

  private async loop(): Promise<void> {
    const generation = ++this.generation;
    this.run.set('running');
    this.pause.set(null);
    this.pauseRequested = false;
    const cap = this.ai.provider() === 'copilot' ? AI_BATCH_COPILOT_CAP : Infinity;
    for (;;) {
      if (generation !== this.generation) {
        return;
      }
      const id = this.order().find((candidate) => this.rows()[candidate]?.phase === 'queued');
      if (!id) {
        this.run.set('done');
        return;
      }
      if (this.pauseRequested) {
        return this.stop({ kind: 'user' });
      }
      if (this.sentInWindow >= cap) {
        return this.stop({ kind: 'cap' });
      }
      const outcome = await this.solve(id, generation);
      if (generation !== this.generation) {
        return;
      }
      if (outcome?.stop) {
        return this.stop(outcome.stop);
      }
    }
  }

  private stop(reason: AiBatchPause): void {
    this.pause.set(reason);
    this.run.set('paused');
  }

  private patchRow(id: string, patch: Partial<AiBatchRow>): void {
    this.rows.update((rows) => (rows[id] ? { ...rows, [id]: { ...rows[id], ...patch } } : rows));
  }

  /** Runs one pair; returns what the queue must do next when it has to stop. */
  /** Text-based adjustment first: free, and enough when every field has a confident position. */
  private async solveWithoutAi(
    id: string,
    aPdf: Blob,
    bPdf: Blob,
    aPages: BatchItem['aPages'],
    generation: number,
  ): Promise<boolean> {
    this.patchRow(id, { phase: 'adjusting', attempt: 1, startedAt: Date.now(), endedAt: null, error: null });
    const [a, b] = await Promise.all([this.texts.read(aPdf), this.texts.read(bPdf)]);
    if (generation !== this.generation) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    const result = cascadeAdjust(aPages, a, b);
    if (!result.solved) {
      return false;
    }
    this.batch.setAiProposal(id, { rows: result.rows, details: null, provider: 'adjust', model: null, seconds: 0, at: Date.now() });
    this.patchRow(id, { phase: 'free', endedAt: Date.now(), placed: result.rows.length, total: result.rows.length });
    return true;
  }

  private async solve(id: string, generation: number): Promise<{ stop?: AiBatchPause } | null> {
    const item = this.batch.find(id);
    if (!item?.bPdf || !isEligibleForAiBatch(item)) {
      this.patchRow(id, { phase: 'failed', endedAt: Date.now(), error: { code: 'not_eligible', message: '', reset: null } });
      return null;
    }
    const abort = new AbortController();
    this.abort = abort;
    if (this.cascade && (await this.solveWithoutAi(id, item.aPdf, item.bPdf, item.aPages, generation))) {
      return null;
    }
    if (generation !== this.generation) {
      return null;
    }
    this.sentInWindow += 1;
    this.requests.update((n) => n + 1);
    this.patchRow(id, { phase: 'reading', attempt: 1, startedAt: Date.now(), endedAt: null, error: null });
    try {
      const result = await this.ai.propose(
        { a: item.aPdf, b: item.bPdf, template: { pages: item.aPages } },
        (progress) => {
          if (generation === this.generation) {
            this.patchRow(id, { phase: progress.stage, attempt: progress.attempt ?? this.rows()[id]?.attempt ?? 1 });
          }
        },
        abort.signal,
        (event) => {
          if (generation === this.generation && event.type === 'step' && event.usage) {
            this.patchRow(id, { usage: event.usage });
          }
        },
      );
      if (generation !== this.generation) {
        return null;
      }
      const placed = result.rows.filter((row) => row.ok).length;
      const total = result.rows.length;
      const usage = sumUsage(result.details?.attempts.map((a) => a.usage) ?? []) ?? this.rows()[id]?.usage ?? null;
      this.streak = { kind: '', n: 0 };
      if (placed === 0) {
        this.patchRow(id, {
          phase: 'failed',
          endedAt: Date.now(),
          placed,
          total,
          usage,
          error: { code: result.details?.diagnosis ?? 'ai_found_nothing', message: '', reset: null },
        });
        return null;
      }
      this.batch.setAiProposal(id, {
        rows: result.rows,
        details: result.details,
        provider: this.ai.provider(),
        model: result.details?.model ?? null,
        seconds: result.seconds,
        at: Date.now(),
      });
      this.patchRow(id, { phase: placed === total ? 'ready' : 'partial', endedAt: Date.now(), placed, total, usage });
      return null;
    } catch (error) {
      if (generation !== this.generation) {
        return null;
      }
      const e = error as AiRequestError;
      const code = e?.code ?? 'error';
      const kind = classifyAiError(code);
      const info = { code, message: String(e?.message ?? error), reset: e?.reset ?? null };
      if (kind === 'aborted') {
        this.patchRow(id, { phase: 'cancelled', endedAt: Date.now() });
        return null;
      }
      if (kind === 'limit' || kind === 'fatal') {
        // Not the pair's fault: it goes back to the queue so «Continue» tries it again.
        this.patchRow(id, { phase: 'queued', startedAt: null, error: null });
        this.sentInWindow = Math.max(0, this.sentInWindow - 1);
        return { stop: { kind: kind === 'limit' ? 'limit' : 'fatal', code, reset: info.reset } };
      }
      this.patchRow(id, { phase: 'failed', endedAt: Date.now(), error: info });
      if (kind === 'transient') {
        this.streak = { kind: code, n: this.streak.kind === code ? this.streak.n + 1 : 1 };
        if (this.streak.n >= AI_BATCH_BREAKER) {
          return { stop: { kind: 'breaker', code } };
        }
      } else {
        this.streak = { kind: '', n: 0 };
      }
      return null;
    } finally {
      if (this.abort === abort) {
        this.abort = null;
      }
    }
  }
}

function emptyRow(id: string): AiBatchRow {
  return { id, phase: 'queued', attempt: 1, startedAt: null, endedAt: null, placed: 0, total: 0, usage: null, error: null };
}

function mapRows(rows: Record<string, AiBatchRow>, fn: (row: AiBatchRow) => AiBatchRow): Record<string, AiBatchRow> {
  return Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, fn(row)]));
}
