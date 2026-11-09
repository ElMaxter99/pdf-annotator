import { LooseJsonError, parseLooseJson } from './loose-json';
import { extractPagesCollection } from './annotation-fields.utils';

export type TemplateTextResult =
  | { readonly ok: true; readonly data: unknown }
  | {
      readonly ok: false;
      readonly reason: 'empty' | 'no-object' | 'syntax' | 'no-pages';
      readonly line?: number;
      readonly column?: number;
    };

/** Index of the `}` that closes the `{` at `start`, skipping strings and comments; -1 if none. */
function findClosingBrace(text: string, start: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === '\\') {
        i += 1;
      } else if (c === quote) {
        quote = null;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
    } else if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      if (end === -1) return -1;
      i = end;
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
    } else if (c === '{') {
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const MONGO_HELPER = /\b(?:new\s+)?(?:ObjectId|ISODate|Date|NumberInt|NumberLong|NumberDecimal)\(\s*([^()]*?)\s*\)/g;

/** `ObjectId("x")`, `ISODate(...)`… become their plain argument (or null); nothing is executed. */
function unwrapMongoHelpers(text: string): string {
  return text.replace(MONGO_HELPER, (_match, arg: string) => arg || 'null');
}

/**
 * Reads a template pasted as plain JSON or as a Mongo/JS script such as
 * `var pdfTemplate = { ... };`. No code is run: it keeps the first balanced `{ ... }` block and
 * parses it with the safe loose parser. Only the `pages` collection matters to callers.
 */
export function parseTemplateText(text: string): TemplateTextResult {
  const source = text.replace(/^﻿/, '');
  if (!source.trim()) {
    return { ok: false, reason: 'empty' };
  }

  const start = source.indexOf('{');
  if (start === -1) {
    return { ok: false, reason: 'no-object' };
  }

  const close = findClosingBrace(source, start);
  const block = source.slice(start, close === -1 ? source.length : close + 1);
  const prefix = source.slice(0, start);
  const lineOffset = prefix.split('\n').length - 1;
  const columnOffset = prefix.length - (prefix.lastIndexOf('\n') + 1);

  let data: unknown;
  try {
    data = parseLooseJson(unwrapMongoHelpers(block));
  } catch (error) {
    if (error instanceof LooseJsonError) {
      return {
        ok: false,
        reason: 'syntax',
        line: error.line + lineOffset,
        column: error.line === 1 ? error.column + columnOffset : error.column,
      };
    }
    return { ok: false, reason: 'syntax' };
  }

  if (!Array.isArray(extractPagesCollection(data))) {
    return { ok: false, reason: 'no-pages' };
  }
  return { ok: true, data };
}
