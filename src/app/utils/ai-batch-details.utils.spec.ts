import type { AiBatchRow } from '../services/ai-batch.service';
import { buildBatchTimeline, currentStep, isFinished } from './ai-batch-details.utils';

const t = (key: string, params?: Record<string, string | number>) => `${key}${params ? JSON.stringify(params) : ''}`;

function row(patch: Partial<AiBatchRow>): AiBatchRow {
  return {
    id: 'a', phase: 'queued', attempt: 1, startedAt: null, endedAt: null, placed: 0, total: 0, usage: null, error: null,
    t0: 0, provider: 'claude', sent: null, stageLog: [], stepLog: [], details: null, cascade: null,
    ...patch,
  };
}

describe('ai-batch-details.utils', () => {
  it('tells a PDF solved by the text adjustment without asking the AI', () => {
    const items = buildBatchTimeline(
      row({ phase: 'free', provider: 'adjust', placed: 9, total: 9, endedAt: 1000, cascade: { solved: true, why: null, fields: 9, pagesA: 1, pagesB: 1, textsA: 24, textsB: 24, at: 800 } }),
      t,
      'Ajuste',
    );
    expect(items.map((i) => i.state)).toEqual(['done', 'done', 'done']);
    expect(items[2].title).toContain('batch.ai.details.save');
    expect(isFinished(row({ phase: 'free' }))).toBeTrue();
  });

  it('follows the live steps of the AI and points at the current one', () => {
    const items = buildBatchTimeline(
      row({
        phase: 'asking',
        stageLog: [{ stage: 'reading', attempt: 1, at: 0 }, { stage: 'asking', attempt: 1, at: 2000 }],
        stepLog: [{ attempt: 1, step: { kind: 'read', file: 'A-p1.png', tool: 'Read' }, at: 6000 }],
      }),
      t,
      'Claude',
    );
    const step = currentStep(items);
    expect(step?.title).toContain('ai.details.step.read');
    expect(step?.n).toBeLessThan(step!.total);
    expect(items[items.length - 1].state).toBe('wait');
  });

  it('ends a failed PDF with an error step', () => {
    const items = buildBatchTimeline(row({ phase: 'failed', endedAt: 4000, error: { code: 'images_not_read', message: 'x', reset: null }, stageLog: [{ stage: 'asking', attempt: 1, at: 1000 }] }), t, 'Claude');
    expect(items[items.length - 1].state).toBe('err');
    expect(currentStep(items)).toBeNull();
  });

  it('keeps the AI steps after a text adjustment that was not enough', () => {
    const items = buildBatchTimeline(
      row({ phase: 'asking', cascade: { solved: false, why: 'pages', fields: 5, pagesA: 1, pagesB: 2, textsA: 3, textsB: 4, at: 500 }, stageLog: [{ stage: 'asking', attempt: 1, at: 900 }] }),
      t,
      'Claude',
    );
    expect(items[1].sub).toContain('batch.ai.details.adjustNot');
    expect(items.some((i) => i.title.includes('ai.details.step.send'))).toBeTrue();
  });
});
