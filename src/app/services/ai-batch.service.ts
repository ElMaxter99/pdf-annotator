import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { BatchItem } from '../models/batch.model';
import {
  AI_BATCH_ACTIVE_PHASES,
  AI_BATCH_BREAKER,
  AI_BATCH_COPILOT_CAP,
  AiBatchPhase,
  classifyAiError,
  isEligibleForAiBatch,
} from '../utils/ai-batch.utils';
import { AiDetails, AiResult, AiSent, AiStep, AiUsage, sumUsage } from '../utils/ai-proposal.utils';
import { AiQueueInfo, AiQueueTaken, AiRemoteSnapshot, parseQueueInfo, phaseOfRemote, remoteItemId } from '../utils/ai-queue.utils';
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
  /** Live log for «Ver detalles» (names and counts only, never PDF content). Times are ms since `t0`. */
  t0: number | null;
  provider: string;
  sent: AiSent | null;
  stageLog: Array<{ stage: 'reading' | 'asking' | 'resolving'; attempt: number; at: number }>;
  stepLog: Array<{ attempt: number; step: AiStep; at: number }>;
  details: AiDetails | null;
  /** What the text-based adjustment found (`null` when it was not tried). */
  cascade: { solved: boolean; why: string | null; fields: number; pagesA: number; pagesB: number; textsA: number; textsB: number; at: number } | null;
}

export type AiBatchRun = 'idle' | 'running' | 'paused' | 'done';

/** Why the queue is paused: the person asked, or it stopped by itself to protect the quota. */
export interface AiBatchPause {
  kind: 'user' | 'limit' | 'breaker' | 'fatal' | 'cap' | 'lost';
  code?: string;
  reset?: string | null;
}

const QUEUE_KEY = 'pdf-annotator.ai.queue';

function readStore(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(QUEUE_KEY);
  } catch {
    return null;
  }
}

function writeStore(value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    if (value === null) {
      localStorage.removeItem(QUEUE_KEY);
    } else {
      localStorage.setItem(QUEUE_KEY, value);
    }
  } catch {
    /* private mode: the queue just cannot be found again after a reload */
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  /** «Ver detalles»: open or not, and which PDF (`null` follows the one in progress). */
  readonly detailsOpen = signal(false);
  readonly detailsId = signal<string | null>(null);
  /** Detail view follows the PDF in progress until one is picked from the list. */
  readonly detailsFollow = signal(true);
  /** Side panel of the run (non-modal): closing it hides it, the work goes on. */
  readonly panelOpen = signal(false);

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
  /** The queue runs inside the helper (it survives a reload) instead of in this tab. */
  readonly viaHelper = signal(false);
  /** Requests the helper runs at once: 2 with Claude, 1 with Copilot. */
  readonly concurrency = signal(1);
  /** Set for a few seconds after a reload found the queue still running. */
  readonly reconnected = signal<{ done: number; total: number } | null>(null);
  /** True while the helper is in use, so the single-pair button must wait. */
  readonly busy = computed(() => this.run() === 'running');

  private abort: AbortController | null = null;
  private generation = 0;
  private pauseRequested = false;
  private cascade = false;
  private sentInWindow = 0;
  private streak: { kind: string; n: number } = { kind: '', n: 0 };
  private queueId: string | null = null;
  private queueMap: Record<string, string> = {};
  private taken: Record<string, AiQueueTaken> = {};
  private fetching = new Set<string>();
  private recovering = false;
  private queueProvider: string | null = null;

  constructor() {
    // After a reload (or a new tab) the queue may still be running in the helper: find it again.
    effect(() => {
      const ready = this.ai.connection() === 'ready' && this.batch.items().length > 0;
      if (ready) {
        untracked(() => void this.recover());
      }
    });
  }

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
    this.detailsFollow.set(true);
    this.detailsId.set(null);
    this.panelOpen.set(true);
    this.launch(pairs.map((item) => item.id));
    return 'started';
  }

  /** The helper's own queue when it has one (Copilot keeps the browser loop beyond its cap of 10 requests). */
  private useHelperQueue(count: number): boolean {
    const copilotCap = this.ai.provider() === 'copilot' && count > AI_BATCH_COPILOT_CAP;
    return this.ai.queueSupported?.() === true && !copilotCap;
  }

  private launch(ids: readonly string[]): void {
    if (this.useHelperQueue(ids.length)) {
      void this.runRemote([...ids]);
    } else {
      this.viaHelper.set(false);
      void this.loop();
    }
  }

  openDetails(id: string | null = null): void {
    this.detailsId.set(id);
    this.detailsFollow.set(id === null);
    this.detailsOpen.set(true);
    this.panelOpen.set(true);
  }

  closeDetails(): void {
    this.detailsOpen.set(false);
  }

  pickDetails(id: string): void {
    this.detailsId.set(id);
    this.detailsFollow.set(false);
  }

  openPanel(): void {
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  /** Stops after the pair in progress; the rest stay queued. */
  requestPause(): void {
    // The helper's queue has no manual pause (mesa P-65, decisión B): «Parar» cancels it and what is done stays.
    if (this.run() === 'running' && !this.viaHelper()) {
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
    if (this.viaHelper()) {
      if (this.queueId) {
        this.pause.set(null);
        this.run.set('running');
        void this.ai.resumeQueue(this.queueId).catch(() => undefined);
      } else {
        // The pairs never reached the helper (it was off): send what is still queued.
        void this.runRemote(this.order().filter((id) => this.rows()[id]?.phase === 'queued'));
      }
      return;
    }
    void this.loop();
  }

  /** Aborts the CLI at once and marks what was not finished as cancelled. */
  cancel(): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.dropQueue(true);
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
    this.panelOpen.set(true);
    this.launch(this.order().filter((id) => this.rows()[id]?.phase === 'queued'));
    return 'started';
  }

  /** Forgets the last run (the stored proposals stay in the items). */
  reset(): void {
    if (this.run() === 'running') {
      return;
    }
    this.dropQueue(false);
    this.viaHelper.set(false);
    this.reconnected.set(null);
    this.rows.set({});
    this.order.set([]);
    this.pause.set(null);
    this.run.set('idle');
    this.panelOpen.set(false);
    this.detailsOpen.set(false);
  }

  // ---- Queue inside the helper (mesas P-65 y P-66) ----

  /** Cascade first (free, in this tab), then every remaining pair goes to the helper, which runs and remembers them. */
  private async runRemote(ids: string[]): Promise<void> {
    const generation = ++this.generation;
    this.viaHelper.set(true);
    this.run.set('running');
    this.pause.set(null);
    this.reconnected.set(null);
    this.queueProvider = this.ai.provider();
    this.queueId = null;
    const send: BatchItem[] = [];
    for (const id of ids) {
      const item = this.batch.find(id);
      if (!item?.bPdf || !isEligibleForAiBatch(item)) {
        this.patchRow(id, { phase: 'failed', endedAt: Date.now(), error: { code: 'not_eligible', message: '', reset: null } });
        continue;
      }
      if (this.cascade && (await this.solveWithoutAi(id, item.aPdf, item.bPdf, item.aPages, generation))) {
        continue;
      }
      if (generation !== this.generation) {
        return;
      }
      send.push(item);
    }
    if (!send.length) {
      this.finishRemote();
      return;
    }
    let batchId = '';
    try {
      batchId = await this.ai.createQueue();
      this.queueId = batchId;
      this.queueMap = Object.fromEntries(send.map((item, index) => [remoteItemId(index), item.id]));
      this.persistQueue();
      for (const [index, item] of send.entries()) {
        await this.ai.addToQueue(batchId, remoteItemId(index), { a: item.aPdf, b: item.bPdf as Blob, template: { pages: item.aPages, pageMap: item.pageMap?.pairs } }, index === send.length - 1);
        if (generation !== this.generation) {
          return;
        }
        this.requests.update((n) => n + 1);
      }
    } catch (error) {
      if (generation !== this.generation) {
        return;
      }
      const code = (error as AiRequestError)?.code;
      if (batchId) {
        void this.ai.cancelQueue(batchId).catch(() => undefined);
      }
      this.dropQueue(false);
      this.stop({ kind: code === 'busy' || code === 'offline' || code === 'queue_lost' ? 'fatal' : 'breaker', code });
      return;
    }
    void this.pollQueue(generation, batchId);
  }

  private async pollQueue(generation: number, batchId: string): Promise<void> {
    let failures = 0;
    let finishTries = 0;
    for (;;) {
      await sleep(1000);
      if (generation !== this.generation) {
        return;
      }
      let snap: AiRemoteSnapshot | null;
      try {
        snap = await this.ai.readQueue(batchId);
        failures = 0;
      } catch {
        // The helper may be busy for a moment: keep asking for a minute before giving the queue up.
        if (++failures >= 60) {
          this.markLost();
          return;
        }
        continue;
      }
      if (generation !== this.generation) {
        return;
      }
      if (!snap) {
        this.markLost();
        return;
      }
      await this.applySnapshot(snap, generation);
      if (generation !== this.generation) {
        return;
      }
      const unread = snap.items.filter((item) => item.state === 'done' && this.rows()[this.queueMap[item.id]]?.phase === 'resolving').length;
      if (snap.state !== 'active' && (unread === 0 || ++finishTries > 5)) {
        this.finishRemote();
        return;
      }
    }
  }

  private async applySnapshot(snap: AiRemoteSnapshot, generation: number): Promise<void> {
    this.concurrency.set(snap.concurrency);
    for (const item of snap.items) {
      const id = this.queueMap[item.id];
      const row = id ? this.rows()[id] : undefined;
      if (!id || !row || this.taken[id]) {
        continue;
      }
      if (item.state === 'done') {
        await this.takeResult(id, item.id);
      } else if (item.state === 'failed') {
        this.patchRow(id, { phase: 'failed', endedAt: row.endedAt ?? Date.now(), error: item.error ?? { code: 'error', message: '', reset: null } });
      } else {
        const phase = phaseOfRemote(item);
        const attempt = item.attempt ?? row.attempt;
        if (phase !== row.phase || attempt !== row.attempt) {
          const now = Date.now();
          this.patchRow(id, {
            phase,
            attempt,
            provider: this.queueProvider ?? '',
            startedAt: phase === 'queued' ? null : (row.startedAt ?? now),
            t0: row.t0 ?? (phase === 'queued' ? null : now),
            endedAt: phase === 'cancelled' ? now : null,
          });
        }
      }
      if (generation !== this.generation) {
        return;
      }
    }
    if (snap.paused) {
      this.pause.set({ kind: snap.paused.reason, code: snap.paused.code ?? undefined, reset: snap.paused.reset });
      this.run.set('paused');
    } else if (this.run() === 'paused' && (this.pause()?.kind === 'limit' || this.pause()?.kind === 'breaker')) {
      this.pause.set(null);
      this.run.set('running');
    }
  }

  private async takeResult(id: string, remoteId: string): Promise<void> {
    if (this.fetching.has(id) || !this.queueId) {
      return;
    }
    this.fetching.add(id);
    try {
      const result = await this.ai.readQueueItem(this.queueId, remoteId);
      if (result) {
        this.acceptResult(id, result);
      } else {
        this.patchRow(id, { phase: 'failed', endedAt: Date.now(), error: { code: 'bad_response', message: '', reset: null } });
      }
    } catch {
      /* the next poll asks again */
    } finally {
      this.fetching.delete(id);
    }
  }

  private finishRemote(): void {
    this.dropQueue(false);
    this.rows.update((rows) =>
      mapRows(rows, (row) => (row.phase === 'queued' || AI_BATCH_ACTIVE_PHASES.includes(row.phase) ? { ...row, phase: 'cancelled', endedAt: Date.now() } : row)),
    );
    this.run.set('done');
  }

  /** The helper no longer knows the queue (it was closed): what already has a proposal stays, the rest can be launched again. */
  private markLost(): void {
    this.dropQueue(false);
    this.rows.update((rows) =>
      mapRows(rows, (row) => (row.phase === 'queued' || AI_BATCH_ACTIVE_PHASES.includes(row.phase) ? { ...row, phase: 'cancelled', endedAt: Date.now() } : row)),
    );
    this.pause.set({ kind: 'lost' });
    this.run.set('done');
    this.panelOpen.set(true);
  }

  private markTaken(id: string, phase: AiQueueTaken['phase'], placed: number, total: number): void {
    if (!this.viaHelper()) {
      return;
    }
    this.taken = { ...this.taken, [id]: { phase, placed, total } };
    this.persistQueue();
  }

  private persistQueue(): void {
    if (!this.queueId) {
      return;
    }
    const info: AiQueueInfo = {
      batchId: this.queueId,
      provider: this.queueProvider ?? '',
      startedAt: this.startedAt() ?? Date.now(),
      order: this.order(),
      map: this.queueMap,
      taken: this.taken,
    };
    writeStore(JSON.stringify(info));
  }

  /** Forgets the helper queue here; with `stopIt` the helper is told to abort what is running. */
  private dropQueue(stopIt: boolean): void {
    const id = this.queueId;
    if (id) {
      void (stopIt ? this.ai.cancelQueue(id) : this.ai.forgetQueue(id)).catch(() => undefined);
    }
    this.queueId = null;
    this.queueMap = {};
    this.taken = {};
    this.fetching.clear();
    writeStore(null);
  }

  /** After a reload: if the helper still has this tab's queue, show it again and keep following it. */
  private async recover(): Promise<void> {
    if (this.recovering || this.run() !== 'idle' || this.ai.queueSupported?.() !== true) {
      return;
    }
    const info = parseQueueInfo(readStore());
    if (!info) {
      return;
    }
    this.recovering = true;
    try {
      let snap: AiRemoteSnapshot | null = null;
      try {
        snap = await this.ai.readQueue(info.batchId);
      } catch {
        return;
      }
      const known = new Set(this.batch.items().map((item) => item.id));
      const order = info.order.filter((id) => known.has(id));
      if (!order.length || this.run() !== 'idle') {
        writeStore(null);
        return;
      }
      const rows: Record<string, AiBatchRow> = {};
      for (const id of order) {
        const taken = info.taken[id];
        rows[id] = taken
          ? { ...emptyRow(id), phase: taken.phase, placed: taken.placed, total: taken.total, provider: taken.phase === 'free' ? 'adjust' : info.provider }
          : emptyRow(id);
      }
      this.order.set(order);
      this.rows.set(rows);
      this.requests.set(Object.keys(info.map).length);
      this.startedAt.set(info.startedAt || Date.now());
      this.detailsFollow.set(true);
      this.detailsId.set(null);
      this.panelOpen.set(true);
      this.viaHelper.set(true);
      this.queueProvider = info.provider || null;
      this.queueId = info.batchId;
      this.queueMap = { ...info.map };
      this.taken = { ...info.taken };
      if (!snap) {
        this.markLost();
        return;
      }
      const generation = ++this.generation;
      this.run.set('running');
      const hereBefore = Object.keys(this.taken).length;
      await this.applySnapshot(snap, generation);
      const done = Object.keys(this.taken).length;
      this.reconnected.set({ done: Math.max(done, hereBefore), total: order.length });
      setTimeout(() => this.reconnected.set(null), 8000);
      if (snap.state !== 'active') {
        this.finishRemote();
      } else {
        void this.pollQueue(generation, info.batchId);
      }
    } finally {
      this.recovering = false;
    }
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

  /** Stores one finished answer: a proposal to review (never applied) or a failure when nothing could be placed. */
  private acceptResult(id: string, result: AiResult): void {
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
        details: result.details,
        error: { code: result.details?.diagnosis ?? 'ai_found_nothing', message: '', reset: null },
      });
      return;
    }
    this.batch.setAiProposal(id, {
      rows: result.rows,
      details: result.details,
      provider: this.queueProvider ?? this.ai.provider(),
      model: result.details?.model ?? null,
      seconds: result.seconds,
      at: Date.now(),
    });
    const phase = placed === total ? 'ready' : 'partial';
    this.patchRow(id, { phase, endedAt: Date.now(), placed, total, usage, details: result.details });
    this.markTaken(id, phase, placed, total);
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
    const t0 = Date.now();
    this.patchRow(id, { phase: 'adjusting', attempt: 1, startedAt: t0, t0, endedAt: null, error: null, provider: 'adjust', stageLog: [], stepLog: [], sent: null, details: null, cascade: null });
    const [a, b] = await Promise.all([this.texts.read(aPdf), this.texts.read(bPdf)]);
    if (generation !== this.generation) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    const result = cascadeAdjust(aPages, a, b);
    const sum = (lists: readonly (readonly unknown[])[]) => lists.reduce((n, list) => n + list.length, 0);
    this.patchRow(id, {
      cascade: {
        solved: result.solved,
        why: result.why,
        fields: aPages.reduce((n, page) => n + (Array.isArray(page.fields) ? page.fields.length : 0), 0),
        pagesA: a.texts.length,
        pagesB: b.texts.length,
        textsA: sum(a.texts),
        textsB: sum(b.texts),
        at: Date.now() - t0,
      },
    });
    if (!result.solved) {
      return false;
    }
    this.batch.setAiProposal(id, { rows: result.rows, details: null, provider: 'adjust', model: null, seconds: 0, at: Date.now() });
    this.patchRow(id, { phase: 'free', endedAt: Date.now(), placed: result.rows.length, total: result.rows.length });
    this.markTaken(id, 'free', result.rows.length, result.rows.length);
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
    const provider = this.ai.provider();
    const started = Date.now();
    const t0 = this.rows()[id]?.t0 ?? started;
    this.patchRow(id, { phase: 'reading', attempt: 1, startedAt: started, t0, provider, endedAt: null, error: null, stageLog: [{ stage: 'reading', attempt: 1, at: started - t0 }], stepLog: [], sent: null, details: null });
    try {
      const result = await this.ai.propose(
        { a: item.aPdf, b: item.bPdf, template: { pages: item.aPages, pageMap: item.pageMap?.pairs } },
        (progress) => {
          if (generation === this.generation) {
            const row = this.rows()[id];
            const attempt = progress.attempt ?? row?.attempt ?? 1;
            this.patchRow(id, {
              phase: progress.stage,
              attempt,
              stageLog: [...(row?.stageLog ?? []), { stage: progress.stage, attempt, at: Date.now() - t0 }],
            });
          }
        },
        abort.signal,
        (event) => {
          if (generation !== this.generation) {
            return;
          }
          const row = this.rows()[id];
          if (event.type === 'sent') {
            this.patchRow(id, { sent: event.sent });
          } else if (event.type === 'step') {
            const at = Date.now() - t0;
            this.patchRow(id, {
              usage: event.usage ?? row?.usage ?? null,
              stepLog: [...(row?.stepLog ?? []), ...event.steps.map((step) => ({ attempt: event.attempt, step, at }))].slice(-60),
            });
          }
        },
      );
      if (generation !== this.generation) {
        return null;
      }
      this.acceptResult(id, result);
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
      this.patchRow(id, { phase: 'failed', endedAt: Date.now(), error: info, details: e?.details ?? this.rows()[id]?.details ?? null });
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
  return { id, phase: 'queued', attempt: 1, startedAt: null, endedAt: null, placed: 0, total: 0, usage: null, error: null, t0: null, provider: '', sent: null, stageLog: [], stepLog: [], details: null, cascade: null };
}

function mapRows(rows: Record<string, AiBatchRow>, fn: (row: AiBatchRow) => AiBatchRow): Record<string, AiBatchRow> {
  return Object.fromEntries(Object.entries(rows).map(([id, row]) => [id, fn(row)]));
}
