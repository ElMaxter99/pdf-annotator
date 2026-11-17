import { TestBed } from '@angular/core/testing';
import type {
  ArchiveInfo,
  ProjectConflict,
  ProjectExportInfo,
  ProjectSummary,
  ProjectsBridge,
} from '../models/project.model';
import { ProjectStoreService } from './project-store.service';
import { ProjectTransferService } from './project-transfer.service';

const summary: ProjectSummary = {
  ref: 'Cliente 1',
  id: 'p1',
  name: 'Cliente 1',
  createdAt: 1,
  updatedAt: 2,
  pdfs: 2,
  bytes: 10,
  done: 1,
  lock: { state: 'free' },
};
const exportInfo: ProjectExportInfo = {
  name: 'Cliente 1',
  lock: { state: 'free' },
  pdfsA: 2,
  pdfsB: 1,
  bytesA: 100,
  bytesB: 40,
  bytesMeta: 5,
};
const archive: ArchiveInfo = {
  formatVersion: 1,
  appVersion: '1.0.0',
  exportedAt: 1000,
  name: 'Cliente 1',
  ref: 'Álvaro/cliente1',
  createdAt: 1,
  pdfsA: 2,
  pdfsB: 1,
  bytes: 145,
  oversize: [],
};
const conflict: ProjectConflict = { ...summary, onlyHere: 3, changedAfter: 0 };

describe('ProjectTransferService', () => {
  let bridge: jasmine.SpyObj<ProjectsBridge>;
  let transfer: ProjectTransferService;
  let store: ProjectStoreService;

  beforeEach(() => {
    bridge = jasmine.createSpyObj<ProjectsBridge>('projects', [
      'exportInfo',
      'exportProject',
      'reveal',
      'importInspect',
      'importRun',
      'cancel',
      'pathForFile',
      'onProgress',
      'info',
      'list',
    ]);
    bridge.onProgress.and.returnValue(() => undefined);
    bridge.cancel.and.resolveTo({ ok: true });
    bridge.info.and.resolveTo({
      root: '/r',
      host: 'h',
      limits: {
        maxPdfs: 200,
        maxBytes: 2 ** 31,
        warnPdfs: 100,
        warnBytes: 2 ** 30,
        maxPdfBytes: 40 * 2 ** 20,
      },
    });
    bridge.list.and.resolveTo({ projects: [] });
    (window as unknown as { desktop: unknown }).desktop = { isDesktop: true, projects: bridge };
    TestBed.configureTestingModule({});
    transfer = TestBed.inject(ProjectTransferService);
    store = TestBed.inject(ProjectStoreService);
  });

  afterEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop;
  });

  it('opens the export dialog with B included only when the project has new versions', async () => {
    bridge.exportInfo.and.resolveTo(exportInfo);
    await transfer.startExport(summary);
    expect(transfer.dialog()?.kind).toBe('export');
    expect(transfer.includeB()).toBeTrue();

    bridge.exportInfo.and.resolveTo({ ...exportInfo, pdfsB: 0 });
    await transfer.startExport(summary);
    expect(transfer.includeB()).toBeFalse();
  });

  it('shows «nothing to export» for an empty project', async () => {
    bridge.exportInfo.and.resolveTo({ error: 'empty' });
    await transfer.startExport(summary);
    expect(transfer.dialog()?.kind).toBe('export-empty');
  });

  it('exports and leaves a notice with the file name and size', async () => {
    bridge.exportInfo.and.resolveTo(exportInfo);
    bridge.exportProject.and.resolveTo({
      name: 'Cliente 1.pdfannotator',
      path: '/x/Cliente 1.pdfannotator',
      bytes: 145,
      pdfs: 3,
    });
    await transfer.startExport(summary);
    transfer.includeB.set(false);
    await transfer.runExport();
    expect(bridge.exportProject).toHaveBeenCalledWith({ ref: 'Cliente 1', includeB: false });
    expect(transfer.dialog()).toBeNull();
    expect(transfer.notice()).toEqual({
      kind: 'exported',
      name: 'Cliente 1.pdfannotator',
      bytes: 145,
    });
    expect(transfer.busy()).toBeFalse();
  });

  it('keeps the dialog open when the save picker is dismissed, and reports a canceled export', async () => {
    bridge.exportInfo.and.resolveTo(exportInfo);
    bridge.exportProject.and.resolveTo({ canceled: true });
    await transfer.startExport(summary);
    await transfer.runExport();
    expect(transfer.dialog()?.kind).toBe('export');

    bridge.exportProject.and.callFake(async () => {
      transfer.cancel();
      return { canceled: true as const };
    });
    await transfer.runExport();
    expect(transfer.dialog()).toBeNull();
  });

  it('flushes the open project before exporting it', async () => {
    bridge.exportInfo.and.resolveTo(exportInfo);
    bridge.exportProject.and.resolveTo({ canceled: true });
    spyOn(store, 'flush').and.resolveTo();
    store.active.set({ ref: 'Cliente 1', name: 'Cliente 1', readOnly: false });
    await transfer.startExport(summary);
    await transfer.runExport();
    expect(store.flush).toHaveBeenCalled();
  });

  it('reviews a file, then asks about an existing project and imports a copy', async () => {
    bridge.importInspect.and.resolveTo({
      file: '/d/c.pdfannotator',
      fileName: 'c.pdfannotator',
      info: archive,
    });
    await transfer.startImport();
    expect(transfer.importName()).toBe('Cliente 1');
    expect(transfer.importSub()).toBe('Álvaro/cliente1');

    bridge.importRun.and.resolveTo({ conflict });
    await transfer.confirmImport();
    expect(bridge.importRun).toHaveBeenCalledWith({
      name: 'Cliente 1',
      subpath: 'Álvaro/cliente1',
    });
    expect(transfer.dialog()?.kind).toBe('conflict');
    expect(transfer.conflictChoice()).toBe('copy');

    bridge.importRun.and.resolveTo({
      project: { ...summary, ref: 'Álvaro/cliente1-2', name: 'Cliente 1 (2)' },
      skipped: [],
      backup: null,
    });
    await transfer.acceptConflict();
    expect(bridge.importRun.calls.mostRecent().args[0].mode).toBe('copy');
    expect(transfer.dialog()).toBeNull();
    expect(transfer.notice()?.kind).toBe('imported');
  });

  it('replacing asks for confirmation, closes the open project and keeps the safety copy', async () => {
    bridge.importInspect.and.resolveTo({
      file: '/d/c.pdfannotator',
      fileName: 'c.pdfannotator',
      info: archive,
    });
    await transfer.startImport();
    bridge.importRun.and.resolveTo({ conflict });
    await transfer.confirmImport();
    transfer.conflictChoice.set('replace');
    await transfer.acceptConflict();
    expect(transfer.dialog()?.kind).toBe('replace');

    store.active.set({ ref: 'Cliente 1', name: 'Cliente 1', readOnly: false });
    spyOn(store, 'close').and.resolveTo();
    bridge.importRun.and.resolveTo({
      project: summary,
      skipped: [],
      backup: 'Cliente 1-antes-de-importar',
    });
    await transfer.confirmReplace();
    expect(store.close).toHaveBeenCalled();
    expect(bridge.importRun.calls.mostRecent().args[0].mode).toBe('replace');
  });

  it('asks before leaving out oversized PDFs and can be canceled from there', async () => {
    const big = {
      ...archive,
      oversize: [{ id: 'g', name: 'contrato.pdf', which: 'a' as const, bytes: 58e6 }],
    };
    bridge.importInspect.and.resolveTo({
      file: '/d/c.pdfannotator',
      fileName: 'c.pdfannotator',
      info: big,
    });
    await transfer.startImport();
    await transfer.confirmImport();
    expect(transfer.dialog()?.kind).toBe('oversize');
    expect(bridge.importRun).not.toHaveBeenCalled();

    transfer.skipChoice.set('cancel');
    await transfer.acceptOversize();
    expect(transfer.dialog()).toBeNull();

    transfer.skipChoice.set('skip');
    await transfer.startImport();
    await transfer.confirmImport();
    bridge.importRun.and.resolveTo({ project: summary, skipped: big.oversize, backup: null });
    await transfer.acceptOversize();
    expect(bridge.importRun.calls.mostRecent().args[0].skipOversize).toBeTrue();
  });

  it('turns main-process refusals into dialogs the person can act on', async () => {
    bridge.importInspect.and.resolveTo({ error: 'not-an-archive', detail: 'factura.pdf' });
    await transfer.startImport('/d/factura.pdf', 'factura.pdf');
    expect(transfer.dialog()).toEqual({
      kind: 'import-error',
      code: 'not-an-archive',
      detail: 'factura.pdf',
      fileName: 'factura.pdf',
    });

    bridge.importInspect.and.resolveTo({
      file: '/d/c.pdfannotator',
      fileName: 'c.pdfannotator',
      info: archive,
    });
    await transfer.startImport();
    bridge.importRun.and.resolveTo({ error: 'in-use', detail: 'PORTATIL-ALVARO' });
    await transfer.confirmImport();
    expect(transfer.dialog()).toEqual({
      kind: 'in-use',
      host: 'PORTATIL-ALVARO',
      name: 'Cliente 1',
    });

    bridge.importRun.and.resolveTo({ error: 'disk-full' });
    await transfer.makeCopyInstead();
    expect(transfer.dialog()?.kind).toBe('import-error');
    bridge.importRun.and.resolveTo({ canceled: true });
    await transfer.retryImport();
    expect(transfer.dialog()).toBeNull();
  });

  it('does not start a second operation while one is running', async () => {
    let release!: () => void;
    bridge.importInspect.and.returnValue(
      new Promise((resolve) => {
        release = () => resolve({ canceled: true });
      }),
    );
    const first = transfer.startImport();
    expect(transfer.busy()).toBeTrue();
    await transfer.startImport();
    expect(bridge.importInspect).toHaveBeenCalledTimes(1);
    release();
    await first;
    expect(transfer.busy()).toBeFalse();
  });

  it('shows progress while working and clears it afterwards', async () => {
    let push: (p: {
      op: 'export' | 'inspect' | 'import';
      done: number;
      total: number;
    }) => void = () => undefined;
    bridge.onProgress.and.callFake((cb) => {
      push = cb;
      return () => undefined;
    });
    bridge.importInspect.and.callFake(async () => {
      push({ op: 'inspect', done: 1, total: 4 });
      expect(transfer.percent()).toBe(25);
      return { canceled: true as const };
    });
    await transfer.startImport();
    expect(transfer.progress()).toBeNull();
  });
});
