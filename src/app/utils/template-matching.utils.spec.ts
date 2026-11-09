import {
  FILE_KEY,
  availableKeyFields,
  detectKeyField,
  matchAll,
  matchPdfToTemplates,
  nameSimilarity,
  normalizeMatchName,
  suggestTemplates,
} from './template-matching.utils';

const tpl = (id: string, keys: Record<string, string>) => ({ id, keys });

describe('template matching', () => {
  it('normalises names', () => {
    expect(normalizeMatchName('Álbarán_0331.PDF')).toBe('albaran-0331');
    expect(normalizeMatchName('  a  b.pdf ')).toBe('a-b');
  });

  it('pairs by exact pdfName, then by similar name', () => {
    const templates = [tpl('a', { pdfName: 'albaran-0331.pdf' }), tpl('b', { pdfName: 'Contraste-0107' })];
    expect(matchPdfToTemplates('albaran-0331.pdf', templates, 'pdfName')).toEqual({
      kind: 'exact',
      templateId: 'a',
      candidates: ['a'],
    });
    expect(matchPdfToTemplates('contraste-0107.pdf', templates, 'pdfName').kind).toBe('similar');
    expect(matchPdfToTemplates('otro.pdf', templates, 'pdfName')).toEqual({ kind: 'none', candidates: [] });
  });

  it('never picks one of several candidates on its own', () => {
    const templates = [tpl('a', { pdfName: 'x.pdf' }), tpl('b', { pdfName: 'x.pdf' })];
    const outcome = matchPdfToTemplates('x.pdf', templates, 'pdfName');
    expect(outcome.kind).toBe('choose');
    expect(outcome.candidates).toEqual(['a', 'b']);
    expect(outcome.templateId).toBeUndefined();
  });

  it('does not give one template to two PDFs', () => {
    const templates = [tpl('a', { pdfName: 'x.pdf' })];
    const outcomes = matchAll(
      [
        { id: '1', name: 'x.pdf' },
        { id: '2', name: 'X.PDF' },
      ],
      templates,
      'pdfName'
    );
    expect(outcomes.get('1')?.kind).toBe('exact');
    expect(outcomes.get('2')?.kind).toBe('choose');
  });

  it('ranks suggestions by similarity', () => {
    const templates = [tpl('far', { pdfName: 'recibo-204.pdf' }), tpl('near', { pdfName: 'contraste-0108-v2.pdf' })];
    const [first] = suggestTemplates('contraste-0108.pdf', templates, 'pdfName');
    expect(first.templateId).toBe('near');
    expect(nameSimilarity('abc', 'abc')).toBe(100);
  });

  it('detects the key field, preferring pdfName', () => {
    const templates = [tpl('a', { pdfName: 'a.pdf', name: 'A' }), tpl('b', { pdfName: 'b.pdf', name: 'B' })];
    expect(detectKeyField(templates)).toBe('pdfName');
    expect(detectKeyField([tpl('a', { name: 'a' })])).toBe('name');
    expect(detectKeyField([tpl('a', { [FILE_KEY]: 'a.json' })])).toBe(FILE_KEY);
    expect(detectKeyField([])).toBe('pdfName');
    expect(availableKeyFields(templates).map((o) => o.field)).toEqual(['pdfName', 'name']);
  });
});
