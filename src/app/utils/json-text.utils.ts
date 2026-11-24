import { PageField } from '../models/annotation.model';
import { extractPagesCollection } from './annotation-fields.utils';
import { LooseJsonError, parseLooseJson } from './loose-json';
import { formatJsonForCopy } from './json-copy-format.utils';
import { toFiniteNumber } from './number.utils';

export type JsonTreePreviewStatus = 'empty' | 'ready' | 'error';

export interface JsonTreePreview {
  status: JsonTreePreviewStatus;
  value: unknown | null;
  /** Position of the syntax error (status `error`). */
  errorAt?: { line: number; column: number };
  /** Whether the document has a usable `pages` list (status `ready`). */
  hasPages?: boolean;
  /** Raw number of field entries across all pages (status `ready`). */
  fieldCount?: number;
}

/** The JSON parsed fine but has no `pages` list. */
export class JsonShapeError extends Error {}

export function parseNumericList(value: string): number[] {
  return value
    .split(/[\s,;]+/)
    .map((token) => toFiniteNumber(token))
    .filter((num): num is number => num !== null && num >= 0)
    .map((num) => +num.toFixed(2))
    .filter((num, index, arr) => arr.indexOf(num) === index)
    .sort((a, b) => a - b);
}

export function buildJsonTreePath(pageIndex: number, fieldIndex: number): string {
  return `root/pages/${pageIndex}/fields/${fieldIndex}`;
}

export function countLineBreaks(value: string): number {
  if (!value) {
    return 0;
  }

  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) === 10) {
      count += 1;
    }
  }

  return count;
}

export function buildJsonTreePreview(text: string): JsonTreePreview {
  if (!text.trim()) {
    return { status: 'empty', value: null };
  }

  try {
    const parsed = parseLooseJson(text);
    const pages = extractPagesCollection(parsed);
    const fieldCount = Array.isArray(pages)
      ? pages.reduce<number>((total, page) => {
          const fields = (page as { fields?: unknown } | null)?.fields;
          return total + (Array.isArray(fields) ? fields.length : 0);
        }, 0)
      : 0;
    return { status: 'ready', value: parsed, hasPages: Array.isArray(pages), fieldCount };
  } catch (error) {
    const errorAt =
      error instanceof LooseJsonError ? { line: error.line, column: error.column } : undefined;
    return { status: 'error', value: null, errorAt };
  }
}

export function isEditableElement(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }

  if (el.isContentEditable) {
    return true;
  }

  const tag = el.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') {
    return true;
  }

  if (tag === 'input') {
    const input = el as HTMLInputElement;
    const type = input.type?.toLowerCase();
    const nonEditableTypes = new Set([
      'button',
      'checkbox',
      'radio',
      'range',
      'color',
      'submit',
      'reset',
    ]);
    return !nonEditableTypes.has(type);
  }

  return false;
}

export function getTextareaLineHeight(textarea: HTMLTextAreaElement, doc: Document | null): number {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
    return 20;
  }

  const computed = getComputedStyle(textarea);
  const rawLineHeight = parseFloat(computed.lineHeight);
  if (Number.isFinite(rawLineHeight) && rawLineHeight > 0) {
    return rawLineHeight;
  }

  const measured = measureLineHeightFromElement(computed, doc);
  if (measured !== null) {
    return measured;
  }

  const fontSize = parseFloat(computed.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    return fontSize * 1.4;
  }

  return 20;
}

export function measureLineHeightFromElement(
  computed: CSSStyleDeclaration,
  documentRef: Document | null,
): number | null {
  const doc = documentRef;
  if (!doc) {
    return null;
  }

  const body = doc.body ?? null;
  if (!body) {
    return null;
  }

  const probe = doc.createElement('span');
  probe.textContent = 'M';
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.whiteSpace = 'pre';
  probe.style.fontFamily = computed.fontFamily;
  probe.style.fontSize = computed.fontSize;
  probe.style.fontWeight = computed.fontWeight;
  probe.style.fontStyle = computed.fontStyle;
  probe.style.letterSpacing = computed.letterSpacing;
  probe.style.padding = '0';
  probe.style.margin = '0';
  probe.style.border = '0';
  probe.style.lineHeight = computed.lineHeight;

  body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  body.removeChild(probe);

  return Number.isFinite(height) && height > 0 ? height : null;
}

/** Fields as they appear in the JSON: advanced ones only when asked for. */
export function serializeFieldForJson(
  sanitized: PageField,
  includeAdvanced: boolean,
): Record<string, unknown> {
  if (includeAdvanced) {
    const { aiId: _aiId, ...rest } = sanitized;
    return rest;
  }

  return {
    x: sanitized.x,
    y: sanitized.y,
    mapField: sanitized.mapField,
    fontSize: sanitized.fontSize,
    type: sanitized.type,
  };
}

export function indentJsonBlock(
  value: unknown,
  indent: string,
  keys: 'quoted' | 'bare' = 'quoted',
): string {
  const strict = JSON.stringify(value, null, 2);
  const text =
    keys === 'bare'
      ? (formatJsonForCopy(strict, {
          keys: 'bare',
          quote: 'double',
          indent: '2',
          trailingComma: false,
        }) ?? strict)
      : strict;
  return text
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}
