import { parseTemplateText, splitTemplateDocuments } from './template-text.utils';

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

describe('splitTemplateDocuments', () => {
  const doc = (name: string, extra = '') =>
    `{"_id":{"$oid":"6650a1f3c2b4e8a1d4f00031"},"pdfName":"${name}","pages":[{"num":1,"fields":[{"x":1,"y":2,"mapField":"a"${extra}}]}]}`;

  it('splits objects pasted one after another', () => {
    const docs = splitTemplateDocuments(`${doc('a.pdf')} ${doc('b.pdf')}`);
    expect(docs.length).toBe(2);
    expect(docs.every((d) => d.result.ok)).toBeTrue();
    expect(docs.map((d) => d.keys['pdfName'])).toEqual(['a.pdf', 'b.pdf']);
  });

  it('reads a mongoexport file with one document per line', () => {
    const docs = splitTemplateDocuments(`${doc('a.pdf')}\n${doc('b.pdf')}\n`);
    expect(docs.map((d) => d.line)).toEqual([1, 2]);
  });

  it('reads an array of templates and a script', () => {
    expect(splitTemplateDocuments(`[ ${doc('a.pdf')}, ${doc('b.pdf')} ]`).length).toBe(2);
    expect(splitTemplateDocuments(`var pdfTemplate = ${doc('a.pdf')};\ndb.t.insert(pdfTemplate);`).length).toBe(1);
  });

  it('unwraps Extended JSON numbers', () => {
    const text = '{"pages":[{"num":{"$numberInt":"1"},"fields":[{"x":{"$numberDouble":"12.5"},"y":2}]}]}';
    const [first] = splitTemplateDocuments(text);
    expect(first.result.ok).toBeTrue();
    if (first.result.ok) {
      const page = (first.result.data as { pages: { num: number; fields: { x: number }[] }[] }).pages[0];
      expect(page.num).toBe(1);
      expect(page.fields[0].x).toBe(12.5);
    }
  });

  it('keeps a broken template apart, with its line and key', () => {
    const broken = '{"pdfName":"c.pdf",\n "pages":[ {"num":1, fields: ';
    const docs = splitTemplateDocuments(`${doc('a.pdf')}\n${broken}`);
    expect(docs.length).toBe(2);
    expect(docs[0].result.ok).toBeTrue();
    expect(docs[1].result.ok).toBeFalse();
    expect(docs[1].keys['pdfName']).toBe('c.pdf');
    expect(docs[1].line).toBe(2);
  });

  it('returns nothing when there is no object', () => {
    expect(splitTemplateDocuments('hola')).toEqual([]);
  });
});
