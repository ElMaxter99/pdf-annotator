import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AiResult, AiRow } from '../utils/ai-proposal.utils';
import type { AiRemoteSnapshot } from '../utils/ai-queue.utils';
import { AiBatchService } from './ai-batch.service';
import { AiHelperService, AiRequestError } from './ai-helper.service';
import { BatchStoreService } from './batch-store.service';
import { PdfTextService } from './pdf-text.service';

const row = (id: string, ok: boolean): AiRow => ({
  id,
  page: 1,
  index: 0,
  ok,
  newPage: 1,
  x: 10,
  y: 20,
  confidence: 0.9,
  reason: '',
  anchorA: '',
  anchorB: '',
  why: '',
  source: 'ai',
});

const result = (...oks: boolean[]): AiResult => ({
  rows: oks.map((ok, i) => row(`p1-f${i + 1}`, ok)),
  seconds: 1,
  warnings: 0,
  details: null,
});

type Step = AiResult | AiRequestError | 'wait';

class FakeHelper {
  readonly connection = signal('ready');
  readonly provider = signal('claude');
  readonly consent = signal(true);
  readonly limits = signal<Record<string, number | null>>({ claude: null, copilot: 10 });
  limitFor(provider: string): number | null {
    return this.limits()[provider] ?? null;
  }
  calls = 0;
  steps: Step[] = [];
  release: (() => void) | null = null;
  instructions: (string | undefined)[] = [];
  async propose(args: { instructions?: string }, onProgress: (p: { stage: 'asking' }) => void, signal: AbortSignal) {
    this.calls++;
    this.instructions.push(args.instructions);
    onProgress({ stage: 'asking' });
    const step = this.steps.shift() ?? result(true);
    if (step === 'wait') {
      await new Promise<void>((resolve, reject) => {
        this.release = resolve;
        signal.addEventListener('abort', () => reject(new AiRequestError('aborted', 'Cancelado.')));
      });
      return result(true);
    }
    if (step instanceof AiRequestError) {
      throw step;
    }
    return step;
  }
}

describe('AiBatchService', () => {
  let helper: FakeHelper;
  let service: AiBatchService;
  let batch: BatchStoreService;
  let ids: string[];
  let texts: { read: (blob: Blob) => Promise<unknown> };

  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  const finished = async () => {
    for (let i = 0; i < 50 && service.run() === 'running'; i++) {
      await pause();
    }
  };

  beforeEach(() => {
    helper = new FakeHelper();
    texts = { read: async () => null };
    TestBed.configureTestingModule({
      providers: [
        { provide: AiHelperService, useValue: helper },
        { provide: PdfTextService, useValue: texts },
      ],
    });
    service = TestBed.inject(AiBatchService);
    batch = TestBed.inject(BatchStoreService);
    ids = [];
    for (let i = 0; i < 4; i++) {
      const item = batch.add({
        name: `doc${i}.pdf`,
        aPdf: new Blob(['a']),
        aPages: [{ num: 1, fields: [{ mapField: 'x', x: 1, y: 1 } as never] }],
      });
      batch.setB(item.id, new File(['b'], `doc${i}-b.pdf`));
      ids.push(item.id);
    }
  });

  it('refuses to start without helper, consent or pairs', () => {
    helper.connection.set('offline');
    expect(service.start()).toBe('not_ready');
    helper.connection.set('ready');
    helper.consent.set(false);
    expect(service.start()).toBe('no_consent');
    helper.consent.set(true);
    expect(service.start(['nope'])).toBe('nothing');
  });

  it('runs the pairs one by one and stores proposals without applying them', async () => {
    helper.steps = [result(true), result(true, false), result(false)];
    expect(service.start(ids.slice(0, 3))).toBe('started');
    await finished();
    const phases = ids.slice(0, 3).map((id) => service.rows()[id].phase);
    expect(phases).toEqual(['ready', 'partial', 'failed']);
    expect(service.run()).toBe('done');
    expect(helper.calls).toBe(3);
    expect(batch.find(ids[0])?.aiProposal?.rows.length).toBe(1);
    expect(batch.find(ids[2])?.aiProposal).toBeUndefined();
    expect(batch.find(ids[0])?.bPages).toBeNull();
    expect(batch.find(ids[0])?.status).toBe('review');
  });

  it('sends each PDF its own AI instructions, or the batch ones when it has none (A6)', async () => {
    batch.setBatchAiInstructions('Casillas a la izquierda');
    batch.setItemAiInstructions(ids[1], 'Solo este PDF');
    batch.setItemAiInstructions(ids[2], '');
    expect(service.start(ids.slice(0, 3))).toBe('started');
    await finished();
    expect(helper.instructions).toEqual(['Casillas a la izquierda', 'Solo este PDF', '']);
    batch.setBatchAiInstructions(''); // the settings record lives in the browser's IndexedDB: leave it empty
  });

  it('pauses the whole queue on a usage limit and keeps the rest queued', async () => {
    helper.steps = [result(true), new AiRequestError('limit', 'límite', '21:00')];
    service.start();
    await finished();
    expect(service.run()).toBe('paused');
    expect(service.pause()).toEqual({ kind: 'limit', code: 'limit', reset: '21:00' });
    expect(ids.map((id) => service.rows()[id].phase)).toEqual(['ready', 'queued', 'queued', 'queued']);
  });

  it('stops after two transient failures in a row', async () => {
    helper.steps = [new AiRequestError('timeout', 't'), new AiRequestError('timeout', 't')];
    service.start();
    await finished();
    expect(service.pause()?.kind).toBe('breaker');
    expect(helper.calls).toBe(2);
    expect(service.rows()[ids[2]].phase).toBe('queued');
  });

  it('a pair that cannot be solved does not stop the others', async () => {
    helper.steps = [new AiRequestError('images_not_read', 'x'), result(true), result(true), result(true)];
    service.start();
    await finished();
    expect(service.run()).toBe('done');
    expect(ids.map((id) => service.rows()[id].phase)).toEqual(['failed', 'ready', 'ready', 'ready']);
    expect(service.retryFailed()).toBe('started');
    await finished();
    expect(service.rows()[ids[0]].phase).toBe('ready');
  });

  it('stops at the Copilot cap and continues only on request', async () => {
    helper.provider.set('copilot');
    for (let i = 4; i < 12; i++) {
      const item = batch.add({ name: `d${i}.pdf`, aPdf: new Blob(['a']), aPages: [{ num: 1, fields: [{ mapField: 'x' } as never] }] });
      batch.setB(item.id, new File(['b'], `d${i}-b.pdf`));
    }
    service.start();
    await finished();
    expect(service.pause()?.kind).toBe('cap');
    expect(helper.calls).toBe(10);
    service.resume();
    await finished();
    expect(helper.calls).toBe(12);
    expect(service.run()).toBe('done');
  });

  it('stops at the limit chosen in Opciones, also with Claude Code', async () => {
    helper.limits.set({ claude: 3, copilot: 10 });
    service.start();
    await finished();
    expect(service.pause()?.kind).toBe('cap');
    expect(helper.calls).toBe(3);
  });

  it('counts every request a PDF makes against the limit, not one per PDF', async () => {
    helper.limits.set({ claude: 5, copilot: 10 });
    const many = { ...result(true), details: { requests: 4 } as never };
    helper.steps = [many, many, many];
    service.start();
    await finished();
    expect(service.pause()?.kind).toBe('cap');
    expect(helper.calls).toBe(2);
  });

  it('pauses after the pair in progress and cancels by aborting it', async () => {
    helper.steps = ['wait'];
    service.start();
    await pause();
    service.requestPause();
    helper.release?.();
    await finished();
    expect(service.pause()?.kind).toBe('user');
    expect(service.rows()[ids[0]].phase).toBe('ready');
    helper.steps = ['wait'];
    service.resume();
    await pause();
    service.cancel();
    await pause();
    expect(service.run()).toBe('done');
    expect(service.rows()[ids[1]].phase).toBe('cancelled');
    expect(service.rows()[ids[3]].phase).toBe('cancelled');
  });

  it('with the cascade on, a pair solved by the text adjustment costs no request', async () => {
    const page = (dy: number) => ({
      texts: [[
        { text: 'Nombre completo', x: 100, y: 710 + dy },
        { text: 'Domicilio fiscal', x: 100, y: 650 + dy },
        { text: 'Teléfono móvil', x: 100, y: 610 + dy },
      ]],
      sizes: [{ w: 595, h: 842 }],
    });
    let calls = 0;
    texts.read = async () => page(calls++ % 2 === 0 ? 0 : -20);
    const item = batch.add({
      name: 'solo.pdf',
      aPdf: new Blob(['a']),
      aPages: [{ num: 1, fields: [{ mapField: 'x', x: 100, y: 700 } as never, { mapField: 'y', x: 100, y: 600 } as never] }],
    });
    batch.setB(item.id, new File(['b'], 'solo-b.pdf'));
    expect(service.start([item.id], { cascade: true })).toBe('started');
    await finished();
    expect(service.rows()[item.id].phase).toBe('free');
    expect(helper.calls).toBe(0);
    expect(service.requests()).toBe(0);
    expect(batch.find(item.id)?.aiProposal?.provider).toBe('adjust');
  });

  it('opens the side panel on start; closing it keeps the run and forgetting the run closes it', async () => {
    expect(service.panelOpen()).toBe(false);
    service.start(ids.slice(0, 1));
    expect(service.panelOpen()).toBe(true);
    service.closePanel();
    expect(service.panelOpen()).toBe(false);
    expect(service.run()).toBe('running');
    await finished();
    service.openDetails(ids[0]);
    expect(service.panelOpen()).toBe(true);
    expect(service.detailsFollow()).toBe(false);
    service.reset();
    expect(service.panelOpen()).toBe(false);
    expect(service.detailsOpen()).toBe(false);
  });
});


/** The helper keeps the queue: the tab only uploads the pairs, follows the helper and picks up the proposals. */
describe('AiBatchService with the helper queue', () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 0));
  const until = async (condition: () => boolean) => {
    for (let i = 0; i < 80 && !condition(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  };

  class QueueHelper {
    readonly connection = signal('ready');
    readonly provider = signal('claude');
    readonly consent = signal(true);
    readonly queueSupported = signal(true);
    limitFor(provider: string): number | null {
      return provider === 'copilot' ? 10 : null;
    }
    added: string[] = [];
    sentInstructions: (string | undefined)[] = [];
    resumed = 0;
    cancelled = 0;
    lost = false;
    snapshot: AiRemoteSnapshot = { id: 'q1', rev: 0, state: 'active', concurrency: 2, paused: null, items: [] };
    async createQueue() {
      return 'q1';
    }
    async addToQueue(_id: string, itemId: string, args: { instructions?: string }) {
      this.added.push(itemId);
      this.sentInstructions.push(args.instructions);
    }
    async readQueue() {
      return this.lost ? null : this.snapshot;
    }
    async readQueueItem() {
      return result(true);
    }
    async resumeQueue() {
      this.resumed++;
    }
    async cancelQueue() {
      this.cancelled++;
    }
    async forgetQueue() {
      return;
    }
  }

  let helper: QueueHelper;
  let service: AiBatchService;
  let batch: BatchStoreService;
  let ids: string[];

  beforeEach(() => {
    localStorage.removeItem('pdf-annotator.ai.queue');
    helper = new QueueHelper();
    TestBed.configureTestingModule({
      providers: [
        { provide: AiHelperService, useValue: helper },
        { provide: PdfTextService, useValue: { read: async () => null } },
      ],
    });
    service = TestBed.inject(AiBatchService);
    batch = TestBed.inject(BatchStoreService);
    ids = [];
    for (let i = 0; i < 3; i++) {
      const item = batch.add({ name: `d${i}.pdf`, aPdf: new Blob(['a']), aPages: [{ num: 1, fields: [{ mapField: 'x', x: 1, y: 1 } as never] }] });
      batch.setB(item.id, new File(['b'], `d${i}-b.pdf`));
      ids.push(item.id);
    }
  });

  afterEach(() => {
    service.cancel();
    localStorage.removeItem('pdf-annotator.ai.queue');
  });

  const items = (...states: Array<'queued' | 'running' | 'done' | 'failed'>): AiRemoteSnapshot['items'] =>
    states.map((state, i) => ({ id: `i${i}`, state, stage: state === 'running' ? 'asking' : null, attempt: 1, error: state === 'failed' ? { code: 'timeout', message: 'x', reset: null } : null }));

  it('uploads every pair once and follows the helper until it finishes', async () => {
    expect(service.start()).toBe('started');
    await until(() => helper.added.length === 3);
    expect(helper.added).toEqual(['i0', 'i1', 'i2']);
    expect(helper.sentInstructions).toEqual(['', '', '']);
    expect(service.viaHelper()).toBe(true);
    expect(service.run()).toBe('running');
    expect(localStorage.getItem('pdf-annotator.ai.queue')).toContain('q1');

    helper.snapshot = { ...helper.snapshot, items: items('done', 'running', 'queued') };
    await until(() => service.rows()[ids[0]].phase === 'ready');
    expect(service.rows()[ids[1]].phase).toBe('asking');
    expect(service.rows()[ids[2]].phase).toBe('queued');
    expect(service.concurrency()).toBe(2);
    expect(batch.find(ids[0])?.aiProposal?.rows.length).toBe(1);

    helper.snapshot = { ...helper.snapshot, state: 'done', items: items('done', 'done', 'failed') };
    await until(() => service.run() === 'done');
    expect(ids.map((id) => service.rows()[id].phase)).toEqual(['ready', 'ready', 'failed']);
    expect(localStorage.getItem('pdf-annotator.ai.queue')).toBeNull();
  });

  it('shows a usage limit as a pause and resumes through the helper', async () => {
    service.start();
    await until(() => helper.added.length === 3);
    helper.snapshot = { ...helper.snapshot, paused: { reason: 'limit', reset: '18:30', code: null }, items: items('done', 'queued', 'queued') };
    await until(() => service.run() === 'paused');
    expect(service.pause()).toEqual({ kind: 'limit', code: undefined, reset: '18:30' });
    service.resume();
    expect(helper.resumed).toBe(1);
    expect(service.run()).toBe('running');
  });

  it('has no manual pause and cancel aborts the helper queue', async () => {
    service.start();
    await until(() => helper.added.length === 3);
    service.requestPause();
    await pause();
    expect(service.pause()).toBeNull();
    service.cancel();
    expect(helper.cancelled).toBe(1);
    expect(service.run()).toBe('done');
    expect(localStorage.getItem('pdf-annotator.ai.queue')).toBeNull();
  });

  it('when the helper forgot the queue, keeps what is done and offers to launch the rest again', async () => {
    service.start();
    await until(() => helper.added.length === 3);
    helper.snapshot = { ...helper.snapshot, items: items('done', 'running', 'queued') };
    await until(() => service.rows()[ids[0]].phase === 'ready');
    helper.lost = true;
    await until(() => service.run() === 'done');
    expect(service.pause()?.kind).toBe('lost');
    expect(ids.map((id) => service.rows()[id].phase)).toEqual(['ready', 'cancelled', 'cancelled']);
    expect(service.counts().cancelled).toBe(2);
  });

  it('finds the queue again after a reload', async () => {
    localStorage.setItem(
      'pdf-annotator.ai.queue',
      JSON.stringify({ batchId: 'q1', provider: 'claude', startedAt: Date.now() - 5000, order: ids, map: { i0: ids[0], i1: ids[1] }, taken: { [ids[2]]: { phase: 'free', placed: 2, total: 2 } } }),
    );
    helper.snapshot = { ...helper.snapshot, items: items('done', 'running') };
    helper.connection.set('ready');
    // A fresh service (as after a reload) picks the stored queue up as soon as the batch is loaded.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AiHelperService, useValue: helper },
        { provide: PdfTextService, useValue: { read: async () => null } },
      ],
    });
    const again = TestBed.inject(AiBatchService);
    const store = TestBed.inject(BatchStoreService);
    store.items.set(batch.items());
    TestBed.tick();
    await until(() => again.run() === 'running');
    expect(again.viaHelper()).toBe(true);
    expect(again.reconnected()?.total).toBe(3);
    expect(again.rows()[ids[2]].phase).toBe('free');
    await until(() => again.rows()[ids[0]].phase === 'ready');
    expect(again.rows()[ids[1]].phase).toBe('asking');
    again.cancel();
  });
});
