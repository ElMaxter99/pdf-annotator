import type { PageField } from '../models/annotation.model';
import { formatNumberWithTruncation, toFiniteNumber } from './number.utils';
import { normalizeFieldDecimals, normalizeFieldType, sanitizeOptionalAppender } from './annotation-fields.utils';

export type PreviewMode = 'sample' | 'map' | 'data';

export interface SampleValues {
  readonly text: string;
  readonly check: string;
  readonly radio: string;
  readonly number: string;
}

export const MAX_SAMPLE_LENGTH = 12;
export const DEFAULT_SAMPLE_VALUES: SampleValues = {
  text: 'XXXXX',
  check: 'X',
  radio: 'X',
  number: '00000',
};

export type SampleKind = keyof SampleValues;

/** Saved values are untrusted: keep only short, single-line strings and fall back to defaults. */
export function normalizeSampleValues(raw: unknown): SampleValues {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = (key: SampleKind): string => {
    const value = source[key];
    if (typeof value !== 'string') {
      return DEFAULT_SAMPLE_VALUES[key];
    }
    const clean = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_SAMPLE_LENGTH);
    return clean || DEFAULT_SAMPLE_VALUES[key];
  };
  return { text: pick('text'), check: pick('check'), radio: pick('radio'), number: pick('number') };
}

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** Splits `holder[0].fullname` into `['holder', 0, 'fullname']`. Returns null for invalid paths. */
export function parseMapPath(path: string): (string | number)[] | null {
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  const segments: (string | number)[] = [];
  const pattern = /([^.[\]]+)|\[(\d+)\]/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(trimmed)) !== null) {
    segments.push(match[2] !== undefined ? Number(match[2]) : match[1]);
    consumed += match[0].length;
  }
  const separators = (trimmed.match(/\./g) ?? []).length;
  if (!segments.length || consumed + separators !== trimmed.length) {
    return null;
  }
  return segments;
}

/** Looks the path up without prototype access; returns `undefined` when the data is missing. */
export function resolveMapPath(data: unknown, path: string): string | undefined {
  const segments = parseMapPath(path);
  if (!segments) {
    return undefined;
  }
  let current: unknown = data;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else {
      if (BLOCKED_KEYS.has(segment) || Array.isArray(current)) {
        return undefined;
      }
      if (!Object.prototype.hasOwnProperty.call(current, segment)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment];
    }
  }
  if (typeof current === 'string') {
    return current;
  }
  if (typeof current === 'number' || typeof current === 'boolean') {
    return String(current);
  }
  return undefined;
}

export interface PreviewContext {
  readonly mode: PreviewMode;
  readonly samples: SampleValues;
  readonly data: unknown | null;
}

export interface PreviewResult {
  readonly text: string;
  readonly source: 'value' | 'data' | 'sample' | 'map';
}

/** Same as the editor always did: only numeric text gets decimals and the appender. */
function formatNumber(raw: string, field: PageField): string {
  const numeric = toFiniteNumber(raw);
  const appender = sanitizeOptionalAppender(field.appender) ?? '';
  if (numeric === null) {
    return raw;
  }
  const decimals = normalizeFieldDecimals(field.decimals);
  const formatted = decimals !== undefined ? formatNumberWithTruncation(numeric, decimals) : raw;
  return `${formatted}${appender}`;
}

/**
 * Decides what an annotation paints. Priority: its own `value`, then the test data (mode `data`),
 * then the sample value of its type. Mode `map` paints the mapField as the editor always did.
 */
export function resolveFieldPreview(field: PageField, ctx: PreviewContext): PreviewResult {
  if (typeof field.value === 'string' && field.value.trim()) {
    return { text: field.value, source: 'value' };
  }

  const type = normalizeFieldType(field.type);
  const mapField = typeof field.mapField === 'string' ? field.mapField : '';

  if (ctx.mode === 'map') {
    if (type === 'check' || type === 'radio') {
      return { text: 'X', source: 'map' };
    }
    return { text: type === 'number' ? formatNumber(mapField, field) : mapField, source: 'map' };
  }

  if (ctx.mode === 'data' && ctx.data !== null && type !== 'check' && type !== 'radio') {
    const resolved = resolveMapPath(ctx.data, mapField);
    if (resolved !== undefined) {
      return { text: type === 'number' ? formatNumber(resolved, field) : resolved, source: 'data' };
    }
  }

  const sample = ctx.samples[type as SampleKind] ?? ctx.samples.text;
  return { text: type === 'number' ? formatNumber(sample, field) : sample, source: 'sample' };
}
