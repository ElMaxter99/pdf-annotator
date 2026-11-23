import { classifyAiRun, sanitizeAiRun, type AiRunRecord } from './ai-run.utils';

const proposal = (edits?: Record<string, unknown>, at = 10) => ({ edits, at }) as never;

describe('ai-run.utils', () => {
  it('descarta lo que no es un registro válido', () => {
    expect(sanitizeAiRun(null)).toBeNull();
    expect(sanitizeAiRun({ ids: [] })).toBeNull();
    expect(sanitizeAiRun({ ids: [1, 2] })).toBeNull();
  });

  it('reconstruye un registro y recorta lo ajeno', () => {
    const rec = sanitizeAiRun({
      ids: ['a', 3, 'b'],
      provider: 'claude',
      startedAt: 5,
      started: ['a'],
      failed: 'x',
      extra: 1,
    });
    expect(rec).toEqual({
      ids: ['a', 'b'],
      provider: 'claude',
      startedAt: 5,
      started: ['a'],
      failed: [],
      rerun: [],
    });
  });

  it('reparte guardados, fallidos, interrumpidos y sin empezar', () => {
    const rec: AiRunRecord = {
      ids: ['a', 'b', 'c', 'd', 'gone'],
      provider: 'claude',
      startedAt: 1,
      started: ['b', 'c'],
      failed: ['b'],
      rerun: [],
    };
    const items = [
      { id: 'a', aiProposal: proposal({ r1: {} }) },
      { id: 'b', aiProposal: undefined },
      { id: 'c', aiProposal: undefined },
      { id: 'd', aiProposal: undefined },
    ];
    const s = classifyAiRun(rec, items)!;
    expect(s.saved).toEqual(['a']);
    expect(s.failed).toEqual(['b']);
    expect(s.interrupted).toEqual(['c']);
    expect(s.notStarted).toEqual(['d']);
    expect(s.pending).toEqual(['b', 'c', 'd']);
    expect(s.missing).toBe(1);
    expect(s.edited).toBe(1);
  });

  it('no hay nada pendiente si todo tiene propuesta', () => {
    const rec: AiRunRecord = {
      ids: ['a'],
      provider: '',
      startedAt: 1,
      started: [],
      failed: [],
      rerun: [],
    };
    expect(classifyAiRun(rec, [{ id: 'a', aiProposal: proposal() }])).toBeNull();
    expect(classifyAiRun(null, [])).toBeNull();
  });

  it('una propuesta anterior a la pasada no cuenta como guardada por ella', () => {
    const rec: AiRunRecord = {
      ids: ['a', 'b'],
      provider: '',
      startedAt: 100,
      started: ['a'],
      failed: [],
      rerun: ['a'],
    };
    const s = classifyAiRun(rec, [
      { id: 'a', aiProposal: proposal(undefined, 50) },
      { id: 'b', aiProposal: proposal(undefined, 150) },
    ])!;
    expect(s.pending).toEqual(['a']);
    expect(s.interrupted).toEqual(['a']);
    expect(s.saved).toEqual(['b']);
  });
});
