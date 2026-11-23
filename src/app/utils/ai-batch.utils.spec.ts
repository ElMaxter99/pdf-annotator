import type { BatchItem } from '../models/batch.model';
import {
  AI_BATCH_COPILOT_CAP,
  AI_MAX_REQUESTS_PER_PDF,
  phaseOfResult,
  usedPagesOfA,
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
    expect(isEligibleForAiBatch({ ...item('a', 3), status: 'ready' })).toBeFalse();
  });

  it('estimates pairs, requests and the Copilot cap', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`p${i}`, 2));
    items.push(item('sinB', 2, false), item('vacio', 0));
    const claude = estimateAiBatch(items, 'claude', true);
    expect(claude.pairs).toBe(12);
    expect(claude.fields).toBe(24);
    expect(claude.bytes).toBe(12 * 150);
    // One page of A with fields per pair: 1 request each; up to re-ask + a retry of each = 4.
    expect(claude.minRequests).toBe(12);
    expect(claude.maxRequests).toBe(48);
    expect(claude.beyondCap).toBe(0);
    const copilot = estimateAiBatch(items, 'copilot', false);
    expect(copilot.maxRequests).toBe(24);
    expect(copilot.beyondCap).toBe(12 - AI_BATCH_COPILOT_CAP);
  });

  it('uses the limit chosen in Opciones instead of the provider default', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`p${i}`, 2));
    expect(estimateAiBatch(items, 'copilot', false, null).beyondCap).toBe(0);
    expect(estimateAiBatch(items, 'copilot', false, 50).beyondCap).toBe(0);
    expect(estimateAiBatch(items, 'claude', false, 5).beyondCap).toBe(7);
  });

  it('counts only the pages of A with fields and caps the requests per PDF', () => {
    const wide: BatchItem = {
      ...item('w', 0),
      aPages: Array.from({ length: 10 }, (_, i) => ({
        num: i + 1,
        fields: i < 3 ? [{} as never] : [],
      })),
    };
    expect(usedPagesOfA(wide)).toBe(3);
    const est = estimateAiBatch([wide], 'claude', true);
    expect(est.minRequests).toBe(3);
    expect(est.maxRequests).toBe(AI_MAX_REQUESTS_PER_PDF);
  });

  it('does not count the fields that do not exist in B as failures', () => {
    expect(phaseOfResult(11, 2, 13)).toBe('ready');
    expect(phaseOfResult(11, 2, 17)).toBe('partial');
    expect(phaseOfResult(0, 3, 3)).toBe('ready');
    expect(phaseOfResult(0, 1, 4)).toBe('failed');
    expect(phaseOfResult(4, 0, 4)).toBe('ready');
  });

  it('classifies errors by what the queue must do', () => {
    expect(classifyAiError('limit')).toBe('limit');
    expect(classifyAiError('aborted')).toBe('aborted');
    for (const code of ['offline', 'missing', 'busy', 'model_no_vision']) {
      expect(classifyAiError(code)).toBe('fatal');
    }
    for (const code of ['cli_error', 'timeout', 'bad_response']) {
      expect(classifyAiError(code)).toBe('transient');
    }
    expect(classifyAiError('images_not_read')).toBe('item');
    expect(classifyAiError('whatever')).toBe('item');
  });
});
