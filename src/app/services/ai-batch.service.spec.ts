import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AiResult, AiRow } from '../utils/ai-proposal.utils';
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
  calls = 0;
  steps: Step[] = [];
  release: (() => void) | null = null;
  async propose(_args: unknown, onProgress: (p: { stage: 'asking' }) => void, signal: AbortSignal) {
    this.calls++;
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
});
