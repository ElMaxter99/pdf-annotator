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

const EXTENDED_NUMBERS = new Set(['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal']);

/** MongoDB Extended JSON wrappers (`{"$numberInt":"5"}`, `{"$oid":"…"}`) become plain values. */
export function unwrapExtendedJson(value: unknown, depth = 0): unknown {
  if (depth > 64) return null;
  if (Array.isArray(value)) return value.map((entry) => unwrapExtendedJson(entry, depth + 1));
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1) {
      const [key, inner] = entries[0];
      if (EXTENDED_NUMBERS.has(key)) {
        const number = Number(inner);
        return Number.isFinite(number) ? number : null;
      }
      if (key === '$oid') return typeof inner === 'string' ? inner : null;
    }
    return Object.fromEntries(
      entries.map(([key, inner]) => [key, unwrapExtendedJson(inner, depth + 1)])
    );
  }
  return value;
}

/** One template found in a larger text (several objects in a row, one per line, or an array). */
export interface TemplateDocument {
  /** The `{ ... }` block exactly as written. */
  readonly text: string;
  /** 1-based line where the block starts. */
  readonly line: number;
  readonly result: TemplateTextResult;
  /** Top-level string values (such as `pdfName`), also read from blocks that fail to parse. */
  readonly keys: Readonly<Record<string, string>>;
}

const KEY_PEEK = /"(pdfName|pdf_name|pdfFileName|fileName|filename|file|pdf|name)"\s*:\s*"((?:[^"\\]|\\.)*)"/;
const MAX_KEY_LENGTH = 200;

function topLevelStrings(data: unknown): Record<string, string> {
  const keys: Record<string, string> = {};
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length <= MAX_KEY_LENGTH) keys[key] = value;
    }
  }
  return keys;
}

function peekKeys(block: string): Record<string, string> {
  const keys: Record<string, string> = {};
  const found = KEY_PEEK.exec(block);
  if (found && found[2].length <= MAX_KEY_LENGTH) keys[found[1]] = found[2];
  return keys;
}

/**
 * Splits a pasted text or file into its top-level `{ ... }` blocks and parses each one on its own,
 * so a Mongo export (one JSON per line), objects pasted one after another or an array of templates
 * all work, and one broken template does not hide the rest. Nothing is evaluated.
 */
export function splitTemplateDocuments(text: string, limit = 2000): TemplateDocument[] {
  const source = text.replace(/^\uFEFF/, '');
  const docs: TemplateDocument[] = [];
  let position = 0;
  let line = 1;
  let consumed = 0;
  while (docs.length < limit) {
    const start = source.indexOf('{', position);
    if (start === -1) break;
    line += countNewlines(source, consumed, start);
    consumed = start;
    const close = findClosingBrace(source, start);
    const block = source.slice(start, close === -1 ? source.length : close + 1);
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const result = parseTemplateText(block);
    const adjusted: TemplateTextResult =
      !result.ok && result.line !== undefined
        ? {
            ...result,
            line: result.line + line - 1,
            column:
              result.line === 1 && result.column !== undefined
                ? result.column + (start - lineStart)
                : result.column,
          }
        : result;
    docs.push({
      text: block,
      line,
      result: adjusted,
      keys: result.ok ? topLevelStrings(result.data) : peekKeys(block),
    });
    if (close === -1) break;
    position = close + 1;
  }
  return docs;
}

function countNewlines(text: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i += 1) if (text.charCodeAt(i) === 10) count += 1;
  return count;
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
    data = unwrapExtendedJson(parseLooseJson(unwrapMongoHelpers(block)));
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
