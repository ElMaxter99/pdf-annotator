import { TestBed } from '@angular/core/testing';
import { BatchStoreService } from './batch-store.service';

const pdf = (name: string) => new File([new Uint8Array([37, 80, 68, 70])], name);

describe('BatchStoreService · reemplazar A (P-190)', () => {
  let store: BatchStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(BatchStoreService);
    store.items.set([]);
  });

  it('cambia el PDF de A, conserva plantilla y B y descarta lo derivado', () => {
    const a = pdf('a.pdf');
    const item = store.add({
      name: 'a.pdf',
      aPdf: a,
      aPages: [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'x' } as never] }],
    });
    store.setB(item.id, pdf('b.pdf'));
    store.setPageMap(item.id, { pairs: [0], origins: ['manual'] });
    store.setFitA(item.id, true);
    store.setStatus(item.id, 'ready');

    const next = pdf('a2.pdf');
    const previous = store.replaceA(item.id, next);
    const after = store.find(item.id)!;

    expect(previous?.aPdf).toBe(a);
    expect(after.aPdf).toBe(next);
    expect(after.name).toBe('a2.pdf');
    expect(after.aPages.length).toBe(1);
    expect(after.bPdf?.size).toBeGreaterThan(0);
    expect(after.pageMap).toBeUndefined();
    expect(after.fitA).toBeUndefined();
    expect(after.aiProposal).toBeUndefined();
    expect(after.status).toBe('review');
  });

  it('restoreA devuelve la fila a como estaba', () => {
    const a = pdf('a.pdf');
    const item = store.add({ name: 'a.pdf', aPdf: a, aPages: [] });
    store.setB(item.id, pdf('b.pdf'));
    store.setPageMap(item.id, { pairs: [0], origins: ['manual'] });
    store.setStatus(item.id, 'ready');
    const previous = store.replaceA(item.id, pdf('a2.pdf'))!;

    store.restoreA(previous);
    const after = store.find(item.id)!;
    expect(after.aPdf).toBe(a);
    expect(after.name).toBe('a.pdf');
    expect(after.pageMap).toBeDefined();
    expect(after.status).toBe('ready');
  });

  it('con una fila inexistente no hace nada', () => {
    expect(store.replaceA('nope', pdf('x.pdf'))).toBeNull();
  });
});
