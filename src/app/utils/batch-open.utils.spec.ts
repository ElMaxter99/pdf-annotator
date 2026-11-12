import { batchItemOpening } from './batch-open.utils';

describe('batchItemOpening', () => {
  const page = { num: 1, fields: [{ x: 1, y: 2, mapField: 'a' }] } as never;
  const base = {
    name: 'a.pdf',
    aPdf: new Blob(['%PDF-A']),
    aPages: [page],
    bPdf: null,
    bName: null,
    bPages: null,
  };

  it('opens A with its template when there is no new version', () => {
    const { file, coords } = batchItemOpening(base);
    expect(file.name).toBe('a.pdf');
    expect(file.type).toBe('application/pdf');
    expect(coords).toEqual([page]);
  });

  it('opens B without annotations until it has been saved', () => {
    const { file, coords } = batchItemOpening({ ...base, bPdf: new Blob(['%PDF-B']), bName: 'b.pdf' });
    expect(file.name).toBe('b.pdf');
    expect(coords).toBeNull();
  });

  it('opens B with its own annotations once saved', () => {
    const { coords } = batchItemOpening({
      ...base,
      bPdf: new Blob(['%PDF-B']),
      bName: 'b.pdf',
      bPages: [],
    });
    expect(coords).toEqual([]);
  });
});
