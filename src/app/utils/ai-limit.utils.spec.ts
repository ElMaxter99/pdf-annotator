import { limitChoice, normalizeStoredLimit, parseAiLimitInput } from './ai-limit.utils';

describe('ai-limit.utils', () => {
  it('reads whole numbers from 1 to 500', () => {
    expect(parseAiLimitInput(' 75 ')).toEqual({ ok: true, value: 75 });
    expect(parseAiLimitInput('1')).toEqual({ ok: true, value: 1 });
    expect(parseAiLimitInput('500')).toEqual({ ok: true, value: 500 });
  });

  it('rejects empty, non integer and out of range input', () => {
    expect(parseAiLimitInput('')).toEqual({ ok: false, error: 'empty' });
    expect(parseAiLimitInput('7.5')).toEqual({ ok: false, error: 'notInteger' });
    expect(parseAiLimitInput('-3')).toEqual({ ok: false, error: 'notInteger' });
    expect(parseAiLimitInput('abc')).toEqual({ ok: false, error: 'notInteger' });
    expect(parseAiLimitInput('0')).toEqual({ ok: false, error: 'range' });
    expect(parseAiLimitInput('501')).toEqual({ ok: false, error: 'range' });
  });

  it('treats stored values as untrusted', () => {
    expect(normalizeStoredLimit(null, 10)).toBeNull();
    expect(normalizeStoredLimit(50, 10)).toBe(50);
    expect(normalizeStoredLimit(0, 10)).toBe(10);
    expect(normalizeStoredLimit('50', 10)).toBe(10);
    expect(normalizeStoredLimit(9999, null)).toBeNull();
    expect(normalizeStoredLimit(undefined, 10)).toBe(10);
  });

  it('maps a limit to its chip', () => {
    expect(limitChoice(null)).toBe('inf');
    expect(limitChoice(25)).toBe(25);
    expect(limitChoice(75)).toBe('other');
  });
});
