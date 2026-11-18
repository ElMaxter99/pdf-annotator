import { TestBed } from '@angular/core/testing';
import type { ProjectStoredItem, ProjectSummary, ProjectsBridge } from '../models/project.model';
import { BatchStoreService } from './batch-store.service';
import { ProjectStoreService } from './project-store.service';

function summary(ref: string, lock: ProjectSummary['lock'] = { state: 'free' }): ProjectSummary {
  return {
    ref,
    id: 'p1',
    name: 'Cliente 1',
    createdAt: 1,
    updatedAt: 2,
    pdfs: 1,
    bytes: 10,
    done: 0,
    lock,
  };
}

function stored(id: string): ProjectStoredItem {
  return {
    id,
    meta: {
      name: `${id}.pdf`,
      aPages: [],
      bName: null,
      bPages: null,
      bJson: null,
      links: [],
      dismissed: [],
      status: 'review',
      updatedAt: 5,
    },
    a: new Uint8Array([37, 80, 68, 70]),
    b: null,
  };
}

describe('ProjectStoreService', () => {
  let bridge: jasmine.SpyObj<ProjectsBridge>;
  let store: ProjectStoreService;
  let batch: BatchStoreService;

  beforeEach(() => {
    bridge = jasmine.createSpyObj<ProjectsBridge>('projects', [
      'info',
      'chooseRoot',
      'list',
      'create',
      'open',
      'saveItem',
      'removeItem',
      'renew',
      'release',
      'rename',
      'forget',
      'revealFolder',
    ]);
    (window as unknown as { desktop: unknown }).desktop = { isDesktop: true, projects: bridge };
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(ProjectStoreService);
    batch = TestBed.inject(BatchStoreService);
  });

  afterEach(() => {
    delete (window as unknown as { desktop?: unknown }).desktop;
    sessionStorage.clear();
  });

  it('reveals the folder of a project and reports why it could not', async () => {
    bridge.revealFolder.and.returnValues(
      Promise.resolve({ ok: true }),
      Promise.resolve({ ok: false, error: 'folder-gone' }),
    );
    expect(await store.revealFolder('Uno')).toBeNull();
    expect(bridge.revealFolder).toHaveBeenCalledWith({ ref: 'Uno' });
    expect(await store.revealFolder('Uno')).toBe('folder-gone');
  });

  it('is available only with the desktop bridge', () => {
    expect(store.available()).toBeTrue();
    delete (window as unknown as { desktop?: unknown }).desktop;
    expect(store.available()).toBeFalse();
  });

  it('opens a project into the batch and mirrors changes to its folder', async () => {
    bridge.open.and.resolveTo({
      project: summary('Álvaro/cliente1'),
      readOnly: false,
      items: [stored('a1')],
    });
    bridge.saveItem.and.resolveTo({ ok: true });

    const result = await store.open('Álvaro/cliente1');

    expect(result).toEqual({ ok: true });
    expect(batch.items().map((item) => item.id)).toEqual(['a1']);
    expect(store.active()?.name).toBe('Cliente 1');

    batch.setStatus('a1', 'ready');
    await store.flush();
    expect(bridge.saveItem).toHaveBeenCalledTimes(1);
    const call = bridge.saveItem.calls.mostRecent().args[0];
    expect(call.ref).toBe('Álvaro/cliente1');
    expect(call.a).toBeUndefined(); // PDF already on disk: only the metadata is rewritten
    expect((call.meta as { status: string }).status).toBe('ready');
  });

  it('reports a project that another computer has open', async () => {
    bridge.open.and.resolveTo({ locked: { state: 'other', host: 'PORTATIL-ALVARO', seen: 5 } });

    const result = await store.open('cliente3');

    expect(result.ok).toBeFalse();
    expect('locked' in result && result.locked.host).toBe('PORTATIL-ALVARO');
    expect(store.active()).toBeNull();
  });

  it('does not save anything in read-only mode', async () => {
    bridge.open.and.resolveTo({
      project: summary('cliente3'),
      readOnly: true,
      items: [stored('a1')],
    });

    await store.open('cliente3', { readOnly: true });
    batch.setStatus('a1', 'ready');
    await store.flush();

    expect(bridge.saveItem).not.toHaveBeenCalled();
    expect(store.active()?.readOnly).toBeTrue();
  });

  it('goes read-only when the lock was taken by another computer', async () => {
    bridge.open.and.resolveTo({
      project: summary('cliente1'),
      readOnly: false,
      items: [stored('a1')],
    });
    bridge.saveItem.and.resolveTo({ error: 'not-held' });

    await store.open('cliente1');
    batch.setStatus('a1', 'ready');
    await store.flush();

    expect(store.lockLost()).toBeTrue();
    expect(store.active()?.readOnly).toBeTrue();
    batch.setStatus('a1', 'review');
    await store.flush();
    expect(bridge.saveItem).toHaveBeenCalledTimes(1);
  });

  it('notices on its own that the lock was taken, without waiting for a save', async () => {
    jasmine.clock().install();
    try {
      bridge.open.and.resolveTo({
        project: summary('cliente1'),
        readOnly: false,
        items: [stored('a1')],
      });
      bridge.renew.and.resolveTo({ ok: false });

      await store.open('cliente1');
      jasmine.clock().tick(21_000);
      await Promise.resolve();
      await Promise.resolve();

      expect(bridge.renew).toHaveBeenCalledWith({ ref: 'cliente1' });
      expect(store.lockLost()).toBeTrue();
      expect(store.active()?.readOnly).toBeTrue();
    } finally {
      jasmine.clock().uninstall();
      await store.close();
    }
  });

  it('removes the files of a PDF taken out of the batch and releases the lock on close', async () => {
    bridge.open.and.resolveTo({
      project: summary('cliente1'),
      readOnly: false,
      items: [stored('a1')],
    });
    bridge.removeItem.and.resolveTo({ ok: true });
    bridge.release.and.resolveTo({ ok: true });

    await store.open('cliente1');
    batch.remove('a1');
    expect(bridge.removeItem).toHaveBeenCalledWith({ ref: 'cliente1', id: 'a1' });

    await store.close();
    expect(bridge.release).toHaveBeenCalledWith({ ref: 'cliente1' });
    expect(store.active()).toBeNull();
    expect(batch.items()).toEqual([]);
  });

  it('drops stored items with the wrong shape', async () => {
    bridge.open.and.resolveTo({
      project: summary('cliente1'),
      readOnly: false,
      items: [stored('a1'), { id: 'bad', meta: 'nope', a: new Uint8Array(1), b: null }],
    });

    await store.open('cliente1');

    expect(batch.items().map((item) => item.id)).toEqual(['a1']);
  });
});
