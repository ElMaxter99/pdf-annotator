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

  it('writes unquoted keys and single quotes on request', () => {
    const text = jsonExportText(
      { pages: [{ num: 1, fields: [{ x: 1, mapField: 'a' }] }] },
      { keys: 'bare', quote: 'single', indent: '2', trailingComma: false },
    );
    expect(text).toContain('pages: [');
    expect(text).toContain("mapField: 'a'");
    expect(text).not.toContain('"pages"');
  });
});
