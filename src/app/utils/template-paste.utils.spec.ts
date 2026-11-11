import { matchTemplate, parsePastedTemplates } from './template-paste.utils';

describe('parsePastedTemplates', () => {
  it('reads an array of Mongo documents and ignores ObjectId and ISODate', () => {
    const text = `[
      { _id: ObjectId("65f1c0aa"), pdfName: 'a.pdf', type: 'T_A', createdAt: ISODate("2026-01-01"),
        pages: [{ num: 1, fields: [] }] },
      { _id: { $oid: "65f1c0ab" }, pdfName: 'b.pdf', pages: [] }
    ]`;
    const result = parsePastedTemplates(text);
    expect(result.error).toBeNull();
    expect(result.templates.map((t) => t.label)).toEqual(['a.pdf', 'b.pdf']);
  });

  it('reads several documents one after another and a single document', () => {
    expect(
      parsePastedTemplates('{ pdfName: "a.pdf", pages: [] }\n{ pdfName: "b.pdf", pages: [] }')
        .templates.length,
    ).toBe(2);
    expect(parsePastedTemplates('{ "pages": [] }').templates.length).toBe(1);
  });

  it('finds documents wrapped in another object and ignores values without pages', () => {
    const result = parsePastedTemplates(
      '{ "result": [ { "name": "x", "pages": [] }, { "a": 1 } ] }',
    );
    expect(result.templates.map((t) => t.label)).toEqual(['x']);
  });

  it('reports the position of a syntax error', () => {
    const result = parsePastedTemplates('[\n  { "pdfName": "a.pdf" "pages": [] }\n]');
    expect(result.templates).toEqual([]);
    expect(result.error?.line).toBe(2);
  });
});

describe('matchTemplate', () => {
  const docs = parsePastedTemplates(
    '[{ pdfName: "asesoramiento-10-pj.pdf", type: "CASER_ADVISED", pages: [] }, { name: "otro", pages: [] }, { type: "CONTRATO_X", pages: [] }]',
  ).templates;

  it('matches by pdfName, then name and finally type', () => {
    expect(matchTemplate('Asesoramiento-10-PJ.pdf', docs, new Set())?.label).toBe(
      'asesoramiento-10-pj.pdf',
    );
    expect(matchTemplate('otro.pdf', docs, new Set())?.label).toBe('otro');
    expect(matchTemplate('contrato-x.pdf', docs, new Set())?.label).toBe('CONTRATO_X');
    expect(matchTemplate('nada.pdf', docs, new Set())).toBeNull();
  });

  it('does not reuse a template already taken', () => {
    expect(matchTemplate('otro.pdf', docs, new Set([docs[1]]))).toBeNull();
  });
});
