import {
  JSON_COPY_STRICT,
  JsonCopyFormat,
  formatJsonForCopy,
  jsonCopyPreset,
} from './json-copy-format.utils';
import type { PageAnnotations, PageField } from '../models/annotation.model';

export interface JsonExportPayload {
  pages: Array<{ num: number; fields: Array<Record<string, unknown>> }>;
}

/** Builds the `{ pages: [...] }` object that the JSON panel shows and exports. */
export function buildJsonExportPayload(
  pages: readonly PageAnnotations[],
  serializeField: (field: PageField) => Record<string, unknown>,
): JsonExportPayload {
  return {
    pages: pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field) => serializeField(field)),
    })),
  };
}

export function jsonExportText(
  payload: JsonExportPayload,
  format: JsonCopyFormat = JSON_COPY_STRICT,
): string {
  const strict = JSON.stringify(payload, null, 2);
  if (sameAsStrict(format)) return strict;
  return formatJsonForCopy(strict, format) ?? strict;
}

function sameAsStrict(format: JsonCopyFormat): boolean {
  return jsonCopyPreset(format) === 'json';
}
