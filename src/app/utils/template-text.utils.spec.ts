import { parseTemplateText } from './template-text.utils';

describe('parseTemplateText', () => {
  it('reads plain JSON', () => {
    const result = parseTemplateText('{ "pages": [ { "num": 1, "fields": [] } ] }');
    expect(result.ok).toBeTrue();
  });

  it('reads a Mongo-style script and ignores everything but the first object', () => {
    const script = `db.templates.drop();\nvar pdfTemplate = {\n  _id: ObjectId('x'),\n  name: 'a } b',\n  pages: [ { num: 1, fields: [ { x: 1, y: 2, mapField: 'a' } ] } ]\n};\ndb.templates.insert(pdfTemplate);`;
    const result = parseTemplateText(script);
    expect(result.ok).toBeTrue();
  });

  it('reports empty text and text without an object', () => {
    expect(parseTemplateText('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseTemplateText('hola')).toEqual({ ok: false, reason: 'no-object' });
  });

  it('reports an object without pages', () => {
    expect(parseTemplateText('var t = { name: "x" };')).toEqual({ ok: false, reason: 'no-pages' });
  });

  it('reports the line and column of a syntax error in the original text', () => {
    const result = parseTemplateText('var t = {\n  pages: [ { num: 1, fields: [ { x: 1, y: , mapField: "a" } ] } ]\n};');
    expect(result.ok).toBeFalse();
    if (!result.ok) {
      expect(result.reason).toBe('syntax');
      expect(result.line).toBe(2);
    }
  });

  it('never evaluates code', () => {
    const result = parseTemplateText('var t = { pages: [], x: (() => { window.__templateEvalProbe = true })() };');
    expect(result.ok).toBeFalse();
    expect((window as unknown as { __templateEvalProbe?: boolean }).__templateEvalProbe).toBeUndefined();
  });
});
