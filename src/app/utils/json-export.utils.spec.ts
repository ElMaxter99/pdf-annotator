import { PageAnnotations, PageField } from '../models/annotation.model';
import { buildJsonExportPayload, jsonExportText } from './json-export.utils';

describe('json-export.utils', () => {
  const field = { x: 1, y: 2, mapField: 'a' } as PageField;
  const pages = [{ num: 3, fields: [field] }] as PageAnnotations[];

  it('keeps page numbers and serialises each field with the given function', () => {
    const payload = buildJsonExportPayload(pages, (f) => ({ x: f.x }));
    expect(payload).toEqual({ pages: [{ num: 3, fields: [{ x: 1 }] }] });
  });

  it('gives an empty pages list for no annotations', () => {
    expect(buildJsonExportPayload([], () => ({}))).toEqual({ pages: [] });
  });

  it('formats with two spaces of indentation', () => {
    expect(jsonExportText({ pages: [] })).toBe('{\n  "pages": []\n}');
  });
});
