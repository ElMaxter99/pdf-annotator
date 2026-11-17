import { TestBed } from '@angular/core/testing';
import type {
  ProjectSummary,
  ProjectsBridge,
  SyncConflictInfo,
  SyncInfo,
  SyncPicked,
} from '../models/project.model';
import { ProjectSyncService } from './project-sync.service';
import { ToastService } from './toast.service';

const picked: SyncPicked = { folder: '/nube', free: 5e9, local: 2, remote: 1, bytes: 1000 };
const linked: SyncInfo = {
  linked: true,
  kind: 'folder',
  folder: '/nube',
  label: '/nube',
  reachable: true,
  statuses: { c1: { state: 'pend' }, c2: { state: 'sync' }, c3: { state: 'pull' } },
  available: [],
};
const project: ProjectSummary = {
  ref: 'c1',
  id: 'p',
  name: 'Cliente 1',
  createdAt: 1,
  updatedAt: 2,
  pdfs: 1,
  bytes: 1,
  done: 0,
  lock: { state: 'free' },
};
const conflict: SyncConflictInfo = {
  kind: 'both',
  remoteRev: 8,
  by: 'PC-B',
  at: 1,
  mine: 2,
  theirs: 1,
  both: 1,
};

describe('ProjectSyncService', () => {
  let bridge: jasmine.SpyObj<ProjectsBridge>;
  let sync: ProjectSyncService;
  let toast: ToastService;

  beforeEach(() => {
    bridge = jasmine.createSpyObj<ProjectsBridge>('projects', [
      'syncStatus',
      'syncChoose',
      'syncLink',
      'syncUnlink',
      'syncAll',
      'syncProject',
      'syncReveal',
      'syncSftpChooseKey',
      'syncSftpInspect',
      'syncSftpTrust',
      'syncSftpTest',
      'syncSftpCredential',
      'syncSftpForget',
      'onSyncEvent',
      'onProgress',
      'cancel',
      'list',
      'info',
    ]);
    bridge.syncStatus.and.resolveTo({ linked: false });
    bridge.onSyncEvent.and.returnValue(() => undefined);
    bridge.onProgress.and.returnValue(() => undefined);
    bridge.list.and.resolveTo({ projects: [] });
    bridge.cancel.and.resolveTo({ ok: true });
    (window as unknown as { desktop: unknown }).desktop = { isDesktop: true, projects: bridge };
    TestBed.configureTestingModule({});
    sync = TestBed.inject(ProjectSyncService);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => {
    sync.stop();
    delete (window as unknown as { desktop?: unknown }).desktop;
  });

  it('sin carpeta enlazada todo es «none» y no hay disponibles', async () => {
    await sync.refresh();
    expect(sync.linked()).toBeFalse();
    expect(sync.statusOf('c1').state).toBe('none');
    expect(sync.available()).toEqual([]);
  });

  it('con carpeta enlazada expone estados y cuenta lo pendiente', async () => {
    bridge.syncStatus.and.resolveTo(linked);
    await sync.refresh();
    expect(sync.linked()).toBeTrue();
    expect(sync.statusOf('c1').state).toBe('pend');
    expect(sync.pendingCount()).toBe(2);
    expect(sync.folder()).toBe('/nube');
  });

  it('vincular exige elegir carpeta y aceptar el aviso', async () => {
    bridge.syncChoose.and.resolveTo(picked);
    sync.startLink();
    await sync.pickFolder();
    expect(sync.dialog()).toEqual({ kind: 'link', picked, error: null });
    await sync.confirmLink();
    expect(bridge.syncLink).not.toHaveBeenCalled();
    sync.accepted.set(true);
    bridge.syncLink.and.resolveTo({ folder: '/nube' });
    await sync.confirmLink();
    expect(bridge.syncLink).toHaveBeenCalledWith({ accepted: true });
    expect(sync.dialog()?.kind).toBe('plan');
    expect(sync.plan()).toBe('both');
  });

  it('sin nada que subir ni bajar se vincula sin preguntar el plan', async () => {
    bridge.syncChoose.and.resolveTo({ ...picked, local: 0, remote: 0 });
    bridge.syncLink.and.resolveTo({ folder: '/nube' });
    sync.startLink();
    await sync.pickFolder();
    sync.accepted.set(true);
    await sync.confirmLink();
    expect(sync.dialog()).toBeNull();
  });

  it('una carpeta rechazada enseña el error en el propio diálogo', async () => {
    bridge.syncChoose.and.resolveTo({ error: 'folder-overlaps' });
    sync.startLink();
    await sync.pickFolder();
    expect(sync.dialog()).toEqual({ kind: 'link', picked: null, error: 'folder-overlaps' });
  });

  it('el plan elegido se manda a sincronizar y avisa del resultado', async () => {
    bridge.syncAll.and.resolveTo({ synced: 3, failed: [], conflicts: [] });
    sync.plan.set('down');
    sync.dialog.set({ kind: 'plan', picked });
    await sync.runPlan();
    expect(bridge.syncAll).toHaveBeenCalledWith({ mode: 'down' });
    expect(sync.dialog()).toBeNull();
    expect(toast.toasts().some((t) => t.kind === 'success')).toBeTrue();
  });

  it('un conflicto abre el diálogo y «theirs» es lo recomendado', async () => {
    bridge.syncProject.and.resolveTo({ conflict });
    await sync.syncProject('c1', 'Cliente 1');
    const d = sync.dialog();
    expect(d?.kind).toBe('conflict');
    expect(sync.conflictChoice()).toBe('theirs');
    bridge.syncProject.and.resolveTo({ action: 'pull', rev: 8, copy: 'c1-conflicto-2026-11-17' });
    await sync.confirmConflict();
    expect(bridge.syncProject.calls.mostRecent().args[0]).toEqual({
      ref: 'c1',
      action: 'sync',
      resolution: 'theirs',
    });
  });

  it('«decidir más tarde» no toca nada', async () => {
    sync.dialog.set({ kind: 'conflict', ref: 'c1', name: 'Cliente 1', conflict });
    sync.conflictChoice.set('later');
    await sync.confirmConflict();
    expect(bridge.syncProject).not.toHaveBeenCalled();
    expect(sync.dialog()).toBeNull();
  });

  it('carpeta no encontrada abre el aviso de sin conexión; otros errores, el diálogo de error', async () => {
    bridge.syncProject.and.resolveTo({ error: 'folder-missing' });
    await sync.syncProject('c1', 'Cliente 1');
    expect(sync.dialog()?.kind).toBe('offline');
    bridge.syncProject.and.resolveTo({ error: 'cloud-pending', detail: 'a.pdf' });
    await sync.syncProject('c1', 'Cliente 1');
    expect(sync.dialog()).toEqual({ kind: 'error', code: 'cloud-pending', detail: 'a.pdf' });
    expect(sync.errorText('cloud-pending', 'a.pdf')).toContain('a.pdf');
  });

  it('sincronizar todo con la carpeta desconectada abre el aviso sin llamar al motor', async () => {
    bridge.syncStatus.and.resolveTo({ ...linked, reachable: false } as SyncInfo);
    await sync.syncAll('sync');
    expect(sync.dialog()?.kind).toBe('offline');
    expect(bridge.syncAll).not.toHaveBeenCalled();
  });

  it('dejar de sincronizar y desvincular llaman al puente', async () => {
    bridge.syncProject.and.resolveTo({ ok: true });
    bridge.syncUnlink.and.resolveTo({ ok: true });
    sync.askStop(project);
    await sync.confirmStop();
    expect(bridge.syncProject).toHaveBeenCalledWith({ ref: 'c1', action: 'stop' });
    await sync.unlink();
    expect(bridge.syncUnlink).toHaveBeenCalled();
  });

  it('el avance solo se muestra mientras se sincroniza', async () => {
    let emit: (p: { op: 'sync'; done: number; total: number }) => void = () => undefined;
    bridge.onProgress.and.callFake((cb) => {
      emit = cb as typeof emit;
      return () => undefined;
    });
    sync.start();
    emit({ op: 'sync', done: 1, total: 4 });
    expect(sync.progress()).toBeNull();
    let release: () => void = () => undefined;
    bridge.syncProject.and.returnValue(
      new Promise((resolve) => (release = () => resolve({ action: 'none' }))),
    );
    const run = sync.syncProject('c1', 'Cliente 1');
    emit({ op: 'sync', done: 1, total: 4 });
    expect(sync.percent()).toBe(25);
    release();
    await run;
    expect(sync.progress()).toBeNull();
  });

  describe('servidor SFTP', () => {
    const okTest = {
      ok: true,
      steps: [
        { id: 'login' as const, ok: true },
        { id: 'folder' as const, ok: true },
        { id: 'write' as const, ok: true },
      ],
      free: 5e9,
      folder: 'ana@nas:/pdf',
      local: 1,
      remote: 0,
      bytes: 10,
      secureStore: false,
    };
    const fill = () => {
      sync.startLink();
      sync.setTab('sftp');
      sync.patchForm({ host: 'nas', username: 'ana' });
      sync.password.set('secreto');
    };

    it('la primera vez pide confirmar la huella y solo entonces prueba la conexión', async () => {
      bridge.syncSftpInspect.and.resolveTo({
        fingerprint: 'SHA256:abc',
        type: 'ssh-ed25519',
        changed: false,
      });
      bridge.syncSftpTest.and.resolveTo(okTest);
      fill();
      await sync.testSftp();
      expect(sync.dialog()?.kind).toBe('hostkey');
      expect(bridge.syncSftpTest).not.toHaveBeenCalled();
      await sync.trustHostKey();
      expect(bridge.syncSftpTest).toHaveBeenCalledTimes(1);
      expect(sync.dialog()).toEqual(jasmine.objectContaining({ kind: 'sftp-test', state: 'ok' }));
      expect(sync.sftpOk()).toEqual(okTest);
    });

    it('sin almacén seguro se explica antes de vincular y se puede pedir cada vez', async () => {
      bridge.syncSftpInspect.and.resolveTo({
        fingerprint: 'SHA256:abc',
        type: 'ssh-ed25519',
        changed: false,
      });
      bridge.syncSftpTest.and.resolveTo(okTest);
      bridge.syncLink.and.resolveTo({ folder: 'ana@nas:/pdf', credentialSaved: false });
      fill();
      await sync.testSftp();
      await sync.trustHostKey();
      sync.accepted.set(true);
      await sync.confirmLinkSftp();
      expect(sync.dialog()?.kind).toBe('nostore');
      expect(bridge.syncLink).not.toHaveBeenCalled();
      await sync.chooseNoStore(true);
      expect(bridge.syncLink).toHaveBeenCalledWith({ accepted: true, remember: false });
      expect(sync.password()).toBe('');
      expect(sync.dialog()?.kind).toBe('plan');
    });

    it('no se puede probar con la contraseña vacía ni sin archivo de clave', () => {
      sync.startLink();
      sync.patchForm({ host: 'nas', username: 'ana' });
      expect(sync.formReady()).toBeFalse();
      sync.password.set('x');
      expect(sync.formReady()).toBeTrue();
      sync.patchForm({ authMode: 'key' });
      expect(sync.formReady()).toBeFalse();
      sync.keyFile.set('/home/ana/.ssh/id');
      expect(sync.formReady()).toBeTrue();
    });

    it('cada fallo abre la pantalla que ayuda a resolverlo', async () => {
      bridge.syncStatus.and.resolveTo({
        ...linked,
        kind: 'sftp',
        label: 'ana@nas:/pdf',
        server: {
          host: 'nas',
          port: 22,
          username: 'ana',
          path: '/pdf',
          authMode: 'password',
          keyFile: '',
          fingerprint: 'SHA256:abc',
          hostKeyType: 'ssh-ed25519',
          credentialSaved: true,
          credentialInSession: false,
          secureStore: true,
        },
      } as SyncInfo);
      await sync.refresh();
      bridge.syncAll.and.resolveTo({ error: 'auth-failed' });
      await sync.syncAll('sync');
      expect(sync.dialog()).toEqual({ kind: 'credential', reason: 'auth' });
      bridge.syncAll.and.resolveTo({ error: 'host-not-found' });
      await sync.syncAll('sync');
      expect(sync.dialog()).toEqual({ kind: 'offline', reason: 'host-not-found' });
      bridge.syncSftpInspect.and.resolveTo({
        fingerprint: 'SHA256:nueva',
        type: 'ssh-ed25519',
        changed: true,
        previous: 'SHA256:abc',
      });
      bridge.syncAll.and.resolveTo({ error: 'host-key-changed' });
      await sync.syncAll('sync');
      await Promise.resolve();
      expect(sync.dialog()).toEqual(
        jasmine.objectContaining({ kind: 'hostkey', purpose: 'manage' }),
      );
    });

    it('el avance con datos muestra velocidad y tiempo restante', async () => {
      let emit: (p: unknown) => void = () => undefined;
      bridge.onProgress.and.callFake((cb) => {
        emit = cb as typeof emit;
        return () => undefined;
      });
      sync.start();
      let release: () => void = () => undefined;
      bridge.syncProject.and.returnValue(
        new Promise((resolve) => (release = () => resolve({ action: 'none' }))),
      );
      const run = sync.syncProject('c1', 'Cliente 1');
      emit({
        op: 'sync',
        done: 1,
        total: 4,
        bytes: 1_000_000,
        bytesTotal: 5_000_000,
        speed: 1_000_000,
      });
      expect(sync.percent()).toBe(20);
      expect(sync.transferInfo()?.eta).toBeTruthy();
      release();
      await run;
    });
  });
});
