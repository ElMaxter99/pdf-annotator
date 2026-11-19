import type { PageAnnotations } from '../models/annotation.model';
import type { AiSavedProposal } from '../models/batch.model';
import type { AiLiveEvent, AiRow, AiSent, AiStep, AiUsage } from './ai-proposal.utils';
import {
  AI_STEP_LOG_LIMIT,
  aiTemplateMap,
  loadingAiSession,
  savedAiSession,
  withAiEvent,
  withAiProgress,
} from './ai-session.utils';

const step = (n: number) => ({ n }) as unknown as AiStep;

describe('ai-session.utils', () => {
  it('names the template fields p<page>-f<position> (position from 1)', () => {
    const template = [
      { num: 2, fields: [{ x: 1 }, { x: 2 }] },
      { num: 5, fields: [{ x: 3 }] },
    ] as unknown as PageAnnotations[];
    const map = aiTemplateMap(template);
    expect([...map.keys()]).toEqual(['p2-f1', 'p2-f2', 'p5-f1']);
    expect(map.get('p2-f2')).toEqual(jasmine.objectContaining({ x: 2 }));
  });

  it('starts loading in the reading stage with an empty log', () => {
    const s = loadingAiSession('copilot', 1000);
    expect(s).toEqual(
      jasmine.objectContaining({
        phase: 'loading',
        provider: 'copilot',
        stage: 'reading',
        startedAt: 1000,
        attempt: 1,
        stageLog: [{ stage: 'reading', attempt: 1, at: 0 }],
      }),
    );
  });

  it('records each stage with the time since the start and keeps the attempt when none comes', () => {
    const s0 = loadingAiSession('claude', 1000);
    const s1 = withAiProgress(s0, { stage: 'asking', attempt: 2 }, 1500);
    expect(s1.stage).toBe('asking');
    expect(s1.attempt).toBe(2);
    expect(s1.stageLog.at(-1)).toEqual({ stage: 'asking', attempt: 2, at: 500 });
    const s2 = withAiProgress(s1, { stage: 'resolving' }, 1800);
    expect(s2.attempt).toBe(2);
    expect(s0.stageLog.length).toBe(1);
  });

  it('keeps what was sent, the usage and only the last steps', () => {
    const s0 = loadingAiSession('claude', 0);
    const sent = { pages: 1 } as unknown as AiSent;
    expect(withAiEvent(s0, { type: 'sent', sent }, 5).sent).toBe(sent);

    const usage = { out: 1 } as unknown as AiUsage;
    const many = Array.from({ length: AI_STEP_LOG_LIMIT + 5 }, (_, i) => step(i));
    const s1 = withAiEvent(s0, { type: 'step', attempt: 1, steps: many, usage }, 7);
    expect(s1.usage).toBe(usage);
    expect(s1.stepLog.length).toBe(AI_STEP_LOG_LIMIT);
    expect(s1.stepLog.at(-1)).toEqual({ attempt: 1, step: many.at(-1)!, at: 7 });
    const s2 = withAiEvent(s1, { type: 'step', attempt: 1, steps: [], usage: null }, 9);
    expect(s2.usage).toBe(usage);
  });

  it('ignores the events that change nothing', () => {
    const s0 = loadingAiSession('claude', 0);
    const event = { type: 'resolved', placed: 1, total: 2, diagnosis: null } as AiLiveEvent;
    expect(withAiEvent(s0, event, 5)).toBe(s0);
  });

  it('opens a saved proposal ready to review, falling back to Claude for unknown providers', () => {
    const rows = [{ id: 'p1-f1' }] as unknown as AiRow[];
    const saved = { provider: 'copilot', seconds: 12, at: 99, details: null } as AiSavedProposal;
    const s = savedAiSession(saved, rows);
    expect(s).toEqual(
      jasmine.objectContaining({
        phase: 'ready',
        provider: 'copilot',
        saved: { at: 99 },
        seconds: 12,
        endedAt: 99,
        stage: 'resolving',
      }),
    );
    expect(s.rows).toEqual(rows);
    expect(s.rows).not.toBe(rows);
    expect(savedAiSession({ ...saved, provider: 'otro' }, rows).provider).toBe('claude');
  });
});
