import { LooseJsonError, parseLooseJson } from './loose-json';
import { pairingKey } from './migration.utils';

/** One template found in pasted text (e.g. a document extracted from a Mongo collection). */
export interface PastedTemplate {
  /** What the user recognises it by: `pdfName`, `name`, `fileName` or `type`. */
  readonly label: string;
  readonly pdfName: string | null;
  readonly name: string | null;
  readonly fileName: string | null;
  readonly type: string | null;
  /** The whole document; only its `pages` are used. */
  readonly data: unknown;
}

export interface PasteResult {
  readonly templates: PastedTemplate[];
  readonly error: { readonly line: number; readonly column: number } | null;
}

const MONGO_TYPES =
  /\b(?:new\s+)?(?:ObjectId|ISODate|NumberLong|NumberInt|NumberDecimal|Timestamp|UUID|Date)\s*\(([^()]*)\)/g;

/** Mongo shell values that are not JSON are reduced to their inner literal (never evaluated). */
function cleanMongo(text: string): string {
  return text
    .replace(MONGO_TYPES, (_match, inner: string) => inner.trim() || 'null')
    .replace(/\bundefined\b/g, 'null')
    .replace(/;\s*$/, '');
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function collect(value: unknown, out: PastedTemplate[], depth = 0): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collect(item, out, depth));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  const doc = value as Record<string, unknown>;
  if (Array.isArray(doc['pages'])) {
    const pdfName = text(doc['pdfName']) ?? text(doc['pdfname']);
    const name = text(doc['name']);
    const fileName = text(doc['fileName']) ?? text(doc['filename']) ?? text(doc['file']);
    const type = text(doc['type']);
    out.push({
      label: pdfName ?? name ?? fileName ?? type ?? `#${out.length + 1}`,
      pdfName,
      name,
      fileName,
      type,
      data: doc,
    });
    return;
  }
  if (depth < 2) {
    Object.values(doc).forEach((item) => collect(item, out, depth + 1));
  }
}

/**
 * Reads every template out of pasted text: one document, an array, several documents one after
 * another, or an object wrapping them. Mongo types (`ObjectId(..)`, `ISODate(..)`) are tolerated.
 */
export function parsePastedTemplates(raw: string): PasteResult {
  const source = cleanMongo(raw.trim());
  if (!source) {
    return { templates: [], error: null };
  }
  const attempts = [source, `[${source.replace(/}\s*\n\s*{/g, '},\n{')}]`];
  let firstError: { line: number; column: number } | null = null;
  for (const attempt of attempts) {
    try {
      const templates: PastedTemplate[] = [];
      collect(parseLooseJson(attempt), templates);
      return { templates, error: null };
    } catch (error) {
      if (!firstError && error instanceof LooseJsonError) {
        firstError = { line: error.line, column: error.column };
      }
    }
  }
  return { templates: [], error: firstError ?? { line: 1, column: 1 } };
}

const ORDER = ['pdfName', 'name', 'fileName', 'type'] as const;

function keyOf(template: PastedTemplate, field: (typeof ORDER)[number]): string | null {
  const value = template[field];
  if (!value) {
    return null;
  }
  return field === 'type' ? value.toLowerCase().replace(/_/g, '-') : pairingKey(value);
}

/**
 * Finds the template for a PDF: by `pdfName` first, then `name`, `fileName` and `type`.
 * Templates already `taken` are skipped; a later one wins when the same PDF appears twice.
 */
export function matchTemplate(
  pdfFileName: string,
  templates: readonly PastedTemplate[],
  taken: ReadonlySet<PastedTemplate>,
): PastedTemplate | null {
  const key = pairingKey(pdfFileName);
  for (const field of ORDER) {
    for (let i = templates.length - 1; i >= 0; i--) {
      if (!taken.has(templates[i]) && keyOf(templates[i], field) === key) {
        return templates[i];
      }
    }
  }
  return null;
}
