import { TestBed } from '@angular/core/testing';
import { BatchItem, BatchStoreService, batchStatusOf, countFields } from './batch-store.service';

const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

const base = (overrides: Partial<BatchItem> = {}): BatchItem => ({
  id: 'a',
  name: 'a.pdf',
  pdf,
  pageCount: 1,
  pageSize: { width: 595, height: 842 },
  addedAt: 1,
  template: null,
  layout: null,
  relaid: false,
  exported: false,
  ...overrides,
});

describe('batchStatusOf', () => {
  const pages = [{ num: 1, fields: [{ x: 1, y: 1, mapField: 'a', fontSize: 12, color: '#000000', type: 'text' as const }] }];

  it('walks through the states of an item', () => {
    expect(batchStatusOf(base())).toBe('noTemplate');
    expect(batchStatusOf(base({ templateIssue: { reason: 'syntax' } }))).toBe('templateError');
    expect(batchStatusOf(base({ template: pages }))).toBe('missingNew');
    expect(batchStatusOf(base({ template: pages, newPdf: pdf }))).toBe('ready');
    expect(batchStatusOf(base({ template: pages, newPdf: pdf, relaid: true }))).toBe('relaid');
    expect(batchStatusOf(base({ template: pages, newPdf: pdf, relaid: true, exported: true }))).toBe('exported');
  });

  it('counts fields', () => {
    expect(countFields(pages)).toBe(1);
    expect(countFields(null)).toBe(0);
  });
});

describe('BatchStoreService templates', () => {
  let store: BatchStoreService;

  beforeEach(async () => {
    store = TestBed.inject(BatchStoreService);
    await store.clear();
  });
  afterEach(async () => store.clear());

  it('stores a parsed template and flags a broken one', () => {
    store.items.set([base(), base({ id: 'b', name: 'b.pdf' })]);
    expect(store.setTemplateText('a', 'var t = { pages: [ { num: 1, fields: [ { x: 1, y: 2, mapField: "k" } ] } ] };').ok).toBeTrue();
    expect(store.get('a')?.template?.[0].fields[0].mapField).toBe('k');
    expect(store.setTemplateText('b', 'var t = { pages: [ { num: 1, fields: [ { x: 1, y: , } ] } ] };').ok).toBeFalse();
    expect(batchStatusOf(store.get('b') as BatchItem)).toBe('templateError');
  });

  it('finds the next pending item after the given one, wrapping around', () => {
    store.items.set([base({ id: 'a' }), base({ id: 'b', template: [{ num: 1, fields: [] }], newPdf: pdf, relaid: true, exported: true }), base({ id: 'c' })]);
    expect(store.nextPendingId('a')).toBe('c');
    expect(store.nextPendingId('c')).toBe('a');
  });
});

describe('BatchStoreService bulk templates', () => {
  let store: BatchStoreService;
  const doc = (name: string, x = 10) =>
    `{"_id":{"$oid":"6650a1f3c2b4e8a1d4f00031"},"pdfName":"${name}","pages":[{"num":1,"fields":[{"x":${x},"y":20,"mapField":"k"}]}]}`;

  beforeEach(async () => {
    store = TestBed.inject(BatchStoreService);
    await store.load();
    await store.clear();
    store.items.set([
      base({ id: 'a', name: 'albaran-0331.pdf' }),
      base({ id: 'b', name: 'contraste-0107.pdf' }),
      base({ id: 'c', name: 'otro.pdf' }),
    ]);
  });
  afterEach(async () => store.clear());

  it('pairs templates by pdfName, exact first and similar names second', async () => {
    const report = await store.addTemplateText([doc('albaran-0331.pdf'), doc('Contraste-0107'), doc('sobra.pdf')].join('\n'));
    expect(report.added).toBe(3);
    expect(store.keyField()).toBe('pdfName');
    expect(store.get('a')?.matchKind).toBe('exact');
    expect(store.get('b')?.matchKind).toBe('similar');
    expect(store.get('a')?.template?.[0].fields.length).toBe(1);
    expect(store.get('c')?.template).toBeNull();
    expect(store.matchStates().get('c')?.kind).toBe('none');
    expect(store.unusedTemplates().length).toBe(1);
  });

  it('never pairs an ambiguous template on its own', async () => {
    await store.addTemplateText([doc('otro.pdf'), doc('otro.pdf', 50)].join('\n'));
    expect(store.get('c')?.template).toBeNull();
    const state = store.matchStates().get('c');
    expect(state?.kind).toBe('choose');
    expect(state?.candidates.length).toBe(2);
  });

  it('lets the user assign by hand and keeps that choice when matching again', async () => {
    await store.addTemplateText([doc('albaran-0331.pdf'), doc('sobra.pdf', 77)].join('\n'));
    const spare = store.templates().find((t) => t.keys['pdfName'] === 'sobra.pdf');
    store.assignTemplate('c', spare!.id);
    expect(store.get('c')?.matchKind).toBe('manual');
    store.rematch();
    expect(store.get('c')?.templateId).toBe(spare!.id);
    store.assignTemplate('c', null);
    expect(store.get('c')?.template).toBeNull();
  });

  it('keeps a broken template from a file so its PDF shows the error', async () => {
    const text = `${doc('albaran-0331.pdf')}\n{"pdfName":"otro.pdf","pages":[ {"num":1, fields: `;
    const report = await store.addTemplateText(text, 'export.jsonl');
    expect(report.added).toBe(1);
    expect(report.failed.length).toBe(1);
    expect(batchStatusOf(store.get('c') as BatchItem)).toBe('templateError');
  });

  it('keeps broken pasted templates out of the pool', async () => {
    const report = await store.addTemplateText('{"pdfName":"otro.pdf","pages":[ {"num":1, fields: ');
    expect(report.added).toBe(0);
    expect(store.templates().length).toBe(0);
  });

  it('pairs again when the key field changes', async () => {
    await store.addTemplateText('{"name":"otro.pdf","pdfName":"x","pages":[{"num":1,"fields":[]}]}');
    expect(store.get('c')?.template).toBeNull();
    store.setKeyField('name');
    expect(store.get('c')?.matchKind).toBe('exact');
    store.setKeyField('pdfName');
    expect(store.get('c')?.template).toBeNull();
  });
});
