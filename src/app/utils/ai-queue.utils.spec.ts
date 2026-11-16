import { parseQueueInfo, parseSnapshot, phaseOfRemote, remoteItemId } from './ai-queue.utils';

describe('ai-queue.utils', () => {
  it('rebuilds the stored queue field by field and drops anything odd', () => {
    const info = parseQueueInfo(
      JSON.stringify({
        batchId: 'b-1',
        provider: 'claude',
        startedAt: 5,
        order: ['pdf-a', 7, 'pdf-b'],
        map: { i0: 'pdf-a', '../x': 'bad', i1: 3 },
        taken: { 'pdf-a': { phase: 'ready', placed: 3, total: 4 }, 'pdf-b': { phase: 'hack' } },
      }),
    );
    expect(info).toEqual({
      batchId: 'b-1',
      provider: 'claude',
      startedAt: 5,
      order: ['pdf-a', 'pdf-b'],
      map: { i0: 'pdf-a' },
      taken: { 'pdf-a': { phase: 'ready', placed: 3, total: 4 } },
    });
  });

  it('rejects broken or foreign values', () => {
    expect(parseQueueInfo(null)).toBeNull();
    expect(parseQueueInfo('{no json')).toBeNull();
    expect(parseQueueInfo(JSON.stringify({ batchId: '<script>' }))).toBeNull();
  });

  it('parses a snapshot, clamps concurrency and ignores bad items', () => {
    const snap = parseSnapshot({
      id: 'b',
      rev: 3,
      state: 'active',
      concurrency: 9,
      paused: { reason: 'limit', reset: '18:30' },
      items: [
        { id: 'i0', state: 'running', stage: 'asking', attempt: 2 },
        { id: 'i1', state: 'failed', error: { code: 'timeout', message: 'x' } },
        { id: 'bad id', state: 'done' },
        { id: 'i2', state: 'weird' },
      ],
    });
    expect(snap?.concurrency).toBe(2);
    expect(snap?.paused).toEqual({ reason: 'limit', reset: '18:30', code: null });
    expect(snap?.items.map((i) => i.id)).toEqual(['i0', 'i1']);
    expect(snap?.items[1].error?.code).toBe('timeout');
    expect(parseSnapshot({ state: 'active' })).toBeNull();
    expect(parseSnapshot({ items: [], state: 'nope' })).toBeNull();
  });

  it('maps helper states to panel phases', () => {
    expect(phaseOfRemote({ state: 'queued', stage: null })).toBe('queued');
    expect(phaseOfRemote({ state: 'running', stage: 'asking' })).toBe('asking');
    expect(phaseOfRemote({ state: 'running', stage: null })).toBe('reading');
    expect(phaseOfRemote({ state: 'done', stage: 'resolving' })).toBe('resolving');
    expect(phaseOfRemote({ state: 'failed', stage: null })).toBe('failed');
    expect(remoteItemId(3)).toBe('i3');
  });
});
