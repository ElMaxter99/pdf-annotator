import type { BatchItem } from '../models/batch.model';
import {
  AI_BATCH_COPILOT_CAP,
  classifyAiError,
  countTemplateFields,
  estimateAiBatch,
  isEligibleForAiBatch,
} from './ai-batch.utils';

const pdf = (bytes: number) => new Blob([new Uint8Array(bytes)]);
const item = (id: string, fields: number, withB = true): BatchItem => ({
  id,
  name: `${id}.pdf`,
  aPdf: pdf(100),
  aPages: fields ? [{ num: 1, fields: Array.from({ length: fields }, () => ({}) as never) }] : [],
  bPdf: withB ? pdf(50) : null,
  bName: withB ? `${id}-b.pdf` : null,
  bPages: null,
  bJson: null,
  links: [],
  dismissed: [],
  status: 'review',
  updatedAt: 0,
});

describe('ai-batch.utils', () => {
  it('counts fields and decides who is eligible', () => {
    expect(countTemplateFields(item('a', 3))).toBe(3);
    expect(isEligibleForAiBatch(item('a', 3))).toBeTrue();
    expect(isEligibleForAiBatch(item('a', 3, false))).toBeFalse();
    expect(isEligibleForAiBatch(item('a', 0))).toBeFalse();
  });

  it('estimates pairs, requests and the Copilot cap', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`p${i}`, 2));
    items.push(item('sinB', 2, false), item('vacio', 0));
    const claude = estimateAiBatch(items, 'claude', true);
    expect(claude.pairs).toBe(12);
    expect(claude.fields).toBe(24);
    expect(claude.bytes).toBe(12 * 150);
    expect(claude.minRequests).toBe(12);
    expect(claude.maxRequests).toBe(24);
    expect(claude.beyondCap).toBe(0);
    const copilot = estimateAiBatch(items, 'copilot', false);
    expect(copilot.maxRequests).toBe(12);
    expect(copilot.beyondCap).toBe(12 - AI_BATCH_COPILOT_CAP);
  });

  it('classifies errors by what the queue must do', () => {
    expect(classifyAiError('limit')).toBe('limit');
    expect(classifyAiError('aborted')).toBe('aborted');
    for (const code of ['offline', 'missing', 'busy']) {
      expect(classifyAiError(code)).toBe('fatal');
    }
    for (const code of ['cli_error', 'timeout', 'bad_response']) {
      expect(classifyAiError(code)).toBe('transient');
    }
    expect(classifyAiError('images_not_read')).toBe('item');
    expect(classifyAiError('whatever')).toBe('item');
  });
});
