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

  it('keeps the word «undefined» and Mongo-like text inside quoted strings', () => {
    const raw =
      '{"pdfName":"a.pdf","pages":[{"num":1,"fields":[{"mapField":"data.undefined","value":"ObjectId(x) undefined"}]}]}';
    const { templates, error } = parsePastedTemplates(raw);
    expect(error).toBeNull();
    const field = (templates[0].data as any).pages[0].fields[0];
    expect(field.mapField).toBe('data.undefined');
    expect(field.value).toBe('ObjectId(x) undefined');
  });

  it('still reduces Mongo values outside strings', () => {
    const raw = '{"_id": ObjectId("65a"), "pdfName": "b.pdf", "x": undefined, "pages": []}';
    const { templates } = parsePastedTemplates(raw);
    expect((templates[0].data as any)._id).toBe('65a');
    expect((templates[0].data as any).x).toBeNull();
  });

  it('reads mongosh-style documents (unquoted keys, single quotes, NumberInt)', () => {
    const raw = `[
  {
    _id: ObjectId('65a1b2c3d4e5f6a7b8c9d0e1'),
    pdfName: 'factura-0412.pdf',
    fontSize: 12,
    createdAt: ISODate('2024-01-02T03:04:05.000Z'),
    pages: [
      { num: NumberInt(1), fields: [ { x: 10.5, y: NumberInt(20), mapField: "L'adresse", type: 'text' } ] }
    ]
  },
  {
    _id: ObjectId('65a1b2c3d4e5f6a7b8c9d0e2'),
    pdfName: 'factura-0413.pdf',
    pages: [ { num: 1, fields: [ { x: 1, y: 2, mapField: 'a' } ] } ]
  }
]`;
    const { templates, error } = parsePastedTemplates(raw);
    expect(error).toBeNull();
    expect(templates.length).toBe(2);
    const first = templates[0].data as any;
    expect(first.pages[0].num).toBe(1);
    expect(first.pages[0].fields[0].mapField).toBe("L'adresse");
  });
});
