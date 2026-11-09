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
