import type { FieldType } from '../models/annotation.model';
import { toFiniteNumber } from './number.utils';

/** Unknown or missing types fall back to `text`. */
export function normalizeFieldType(value: unknown): FieldType {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (
      normalized === 'check' ||
      normalized === 'radio' ||
      normalized === 'number' ||
      normalized === 'text'
    ) {
      return normalized as FieldType;
    }
  }
  return 'text';
}

/** Collapses whitespace/newlines into single spaces; returns the first usable item of an array. */
export function normalizeFieldText(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeFieldText(item);
      if (normalized !== null) {
        return normalized;
      }
    }
    return null;
  }

  let source: string | null = null;

  if (typeof value === 'string') {
    source = value;
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    source = String(value);
  } else if (typeof value === 'boolean') {
    source = value ? 'true' : 'false';
  }

  if (!source) {
    return null;
  }

  const collapsed = source
    .replace(/\r\n?/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!collapsed) {
    return null;
  }

  if (/[\.\[\]]/.test(collapsed)) {
    return collapsed.replace(/\s*([\.\[\]])\s*/g, '$1');
  }

  return collapsed;
}

export function normalizeFieldDecimals(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const parsed = toFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return undefined;
  }
  return Math.round(parsed);
}

export function sanitizeOptionalAppender(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim() ? value : undefined;
}

export function sanitizeTextPreservingSpacing(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value.trim() ? value : undefined;
}

/** Accepts either a bare array of pages or an object with a `pages` array. */
export function extractPagesCollection(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === 'object') {
    const maybePages = (data as { pages?: unknown }).pages;
    if (Array.isArray(maybePages)) {
      return maybePages;
    }
  }

  return null;
}
