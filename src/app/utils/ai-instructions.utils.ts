import type { BatchItem } from '../models/batch.model';

/** Longest text kept for the AI instructions of a batch or a PDF (A6 of 1.17). */
export const AI_INSTRUCTIONS_MAX = 500;

/** Control and direction characters (also invisible ones): never kept. */
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * Instructions typed by the person (or read back from storage) are untrusted: plain text only, no control or
 * direction characters, normalised line breaks and at most {@link AI_INSTRUCTIONS_MAX} characters.
 * The helper cleans them again with the same rules (`tools/ai-helper/instructions.mjs`).
 */
export function cleanAiInstructions(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(UNSAFE, '')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, AI_INSTRUCTIONS_MAX).trim();
}

/** What a PDF of the batch sends: its own instructions if it has them (even empty), otherwise the batch ones. */
export function effectiveAiInstructions(
  item: Pick<BatchItem, 'aiInstructions'> | null | undefined,
  batchInstructions: string,
): string {
  const own = item?.aiInstructions;
  return cleanAiInstructions(typeof own === 'string' ? own : batchInstructions);
}
