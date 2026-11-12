import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import type { BatchItem } from '../models/batch.model';
import { BatchStoreService } from '../services/batch-store.service';
import { PendingFileService } from '../services/pending-file.service';
import { SavedSession, SessionStoreService } from '../services/session-store.service';
import { workspaceGuard } from './workspace.guard';

describe('workspaceGuard', () => {
  let pending: PendingFileService;
  let router: Router;
  let sessions: jasmine.SpyObj<SessionStoreService>;
  let batch: BatchStoreService;

  const pdf = () => new File(['%PDF-1.4'], 'a.pdf', { type: 'application/pdf' });
  const run = (query: Record<string, string> = {}) =>
    TestBed.runInInjectionContext(() =>
      workspaceGuard({ queryParamMap: convertToParamMap(query) } as ActivatedRouteSnapshot, {} as never),
    ) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    sessions = jasmine.createSpyObj<SessionStoreService>('SessionStoreService', ['load']);
    sessions.load.and.resolveTo(null);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: SessionStoreService, useValue: sessions }],
    });
    pending = TestBed.inject(PendingFileService);
    router = TestBed.inject(Router);
    batch = TestBed.inject(BatchStoreService);
    spyOn(batch, 'load').and.resolveTo();
  });

  it('redirects to the landing page when there is nothing to reopen', async () => {
    const result = (await run()) as UrlTree;
    expect(result instanceof UrlTree).toBeTrue();
    expect(router.serializeUrl(result)).toBe('/landing');
  });

  it('lets the workspace open while a PDF is pending, without consuming it', async () => {
    pending.setPendingFile(pdf());
    expect(await run()).toBeTrue();
    expect(pending.hasPendingFile()).toBeTrue();
    expect(sessions.load).not.toHaveBeenCalled();
  });

  it('reopens the PDF left in this visit (history «Forward»)', async () => {
    const restore = { coords: [], pageIndex: 3, scale: 1.25 };
    pending.rememberLastOpened(pdf(), restore);
    expect(await run()).toBeTrue();
    expect(pending.consumePendingFile()?.name).toBe('a.pdf');
    expect(pending.consumePendingRestore()).toEqual(restore);
  });

  it('reopens the saved session after a reload', async () => {
    const session: SavedSession = {
      name: 'saved.pdf',
      pdf: new Blob(['%PDF-1.4']),
      coords: [{ num: 1, fields: [] }],
      pageIndex: 2,
      scale: 1,
      savedAt: 1,
    };
    sessions.load.and.resolveTo(session);
    expect(await run()).toBeTrue();
    expect(pending.consumePendingFile()?.name).toBe('saved.pdf');
    expect(pending.consumePendingRestore()?.pageIndex).toBe(2);
  });

  it('reopens the batch PDF named in the URL', async () => {
    const item = {
      id: 'x1',
      name: 'a.pdf',
      aPdf: new Blob(['%PDF-A']),
      aPages: [{ num: 1, fields: [{ x: 1, y: 1, mapField: 'f' }] }],
      bPdf: null,
      bName: null,
      bPages: null,
    } as unknown as BatchItem;
    batch.items.set([item]);
    expect(await run({ lote: 'x1' })).toBeTrue();
    expect(batch.activeId()).toBe('x1');
    expect(pending.consumePendingFile()?.name).toBe('a.pdf');
    expect(pending.consumePendingRestore()?.coords.length).toBe(1);
  });

  it('goes back to the batch panel when the batch PDF no longer exists', async () => {
    const result = (await run({ lote: 'gone' })) as UrlTree;
    expect(router.serializeUrl(result)).toBe('/lote');
    expect(sessions.load).not.toHaveBeenCalled();
  });
});
