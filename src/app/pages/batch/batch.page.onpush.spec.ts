import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BatchPageComponent } from './batch.page';
import { BatchStoreService } from '../../services/batch-store.service';

/**
 * T4d (1.16): el panel del lote va en OnPush. En reposo no debe reejecutar su plantilla (en Eager lo hacía en
 * cada ciclo de detección) y, cuando cambia el estado (lote, búsqueda, selección, estados), la vista y los
 * hijos que reciben datos de la página siguen refrescándose.
 */
describe('BatchPageComponent (OnPush)', () => {
  let store: BatchStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    store = TestBed.inject(BatchStoreService);
    store.items.set([]);
    store.loaded.set(true);
    store.add({ name: 'uno.pdf', aPdf: new Blob(['a']), aPages: [] });
    store.add({ name: 'dos.pdf', aPdf: new Blob(['b']), aPages: [] });
    store.add({ name: 'tres.pdf', aPdf: new Blob(['c']), aPages: [] });
  });

  afterEach(() => {
    try {
      localStorage.removeItem('pdf-annotator.batch.view');
    } catch {
      /* sin almacenamiento */
    }
  });

  function instrument() {
    const def = (BatchPageComponent as any).ɵcmp;
    const original = def.template;
    const stats = { runs: 0 };
    def.tView = null;
    def.template = function (this: unknown, rf: number, ctx: unknown) {
      if (rf & 2) stats.runs++;
      return original.call(this, rf, ctx);
    };
    const restore = () => {
      def.template = original;
      def.tView = null;
    };
    return { def, stats, restore };
  }

  it('no reejecuta la plantilla en reposo', () => {
    const { def, stats, restore } = instrument();
    try {
      const fixture = TestBed.createComponent(BatchPageComponent);
      fixture.detectChanges();
      const afterFirst = stats.runs;
      for (let i = 0; i < 20; i++) {
        fixture.detectChanges();
      }
      console.log(`batch.page: ${stats.runs - afterFirst} ejecuciones de plantilla en 20 ciclos en reposo`);
      expect(def.onPush).toBeTrue();
      expect(stats.runs - afterFirst).toBe(0);
      fixture.destroy();
    } finally {
      restore();
    }
  });

  it('se refresca al filtrar, seleccionar, cambiar estados y quitar PDFs', () => {
    const fixture = TestBed.createComponent(BatchPageComponent);
    const page = fixture.componentInstance;
    fixture.detectChanges();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(page.step()).toBe('panel');
    expect(page.rows().length).toBe(3);
    expect(el.textContent).toContain('uno.pdf');

    page.query.set('dos');
    fixture.detectChanges();
    expect(el.textContent).toContain('dos.pdf');
    expect(el.textContent).not.toContain('uno.pdf');
    page.clearFilters();
    fixture.detectChanges();
    expect(el.textContent).toContain('uno.pdf');

    page.selectAllVisible();
    fixture.detectChanges();
    expect(page.selectionCount()).toBe(3);
    expect(el.querySelectorAll('input[type="checkbox"]:checked').length).toBeGreaterThan(0);

    const id = store.items()[0].id;
    store.setStatusMany([id], 'ready');
    fixture.detectChanges();
    expect(page.counts().ready).toBe(1);

    page.setView('list');
    fixture.detectChanges();
    expect(el.textContent).toContain('tres.pdf');

    store.remove(id);
    fixture.detectChanges();
    expect(el.textContent).not.toContain('uno.pdf');
    fixture.destroy();
  });
});
