/** Pure rules for the «Límite de peticiones por traslado» option (P-150 a P-152). `null` = no limit. */
export type AiLimit = number | null;

export const AI_LIMIT_MIN = 1;
export const AI_LIMIT_MAX = 500;
/** Quick choices offered as chips (besides «Sin límite» and «Otro…»). */
export const AI_LIMIT_PRESETS: readonly number[] = [10, 25, 50, 100];

/** Copilot's credits cannot be measured, so it stops by default; Claude Code has no limit unless asked. */
export const DEFAULT_AI_LIMITS: Record<string, AiLimit> = { claude: null, copilot: 10, fake: null };

export type AiLimitError = 'empty' | 'notInteger' | 'range';

export type AiLimitParse = { ok: true; value: number } | { ok: false; error: AiLimitError };

/** Reads what the person typed in «Otro…»: a whole number from 1 to 500. */
export function parseAiLimitInput(text: string): AiLimitParse {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: 'empty' };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: 'notInteger' };
  }
  const value = Number(trimmed);
  if (value < AI_LIMIT_MIN || value > AI_LIMIT_MAX) {
    return { ok: false, error: 'range' };
  }
  return { ok: true, value };
}

/** A stored value is untrusted: anything that is not `null` or a valid whole number goes back to the default. */
export function normalizeStoredLimit(stored: unknown, fallback: AiLimit): AiLimit {
  if (stored === null) {
    return null;
  }
  if (typeof stored === 'number' && Number.isInteger(stored) && stored >= AI_LIMIT_MIN && stored <= AI_LIMIT_MAX) {
    return stored;
  }
  return fallback;
}

/** Which chip is on: a preset, «inf», or «other» for any other number. */
export function limitChoice(limit: AiLimit): 'inf' | 'other' | number {
  if (limit === null) {
    return 'inf';
  }
  return AI_LIMIT_PRESETS.includes(limit) ? limit : 'other';
}
