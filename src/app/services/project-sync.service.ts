import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import type {
  ProjectErrorCode,
  ProjectProgress,
  ProjectSummary,
  ProjectsBridge,
  SyncAvailable,
  SyncConflictInfo,
  SyncEvent,
  SyncHostKey,
  SyncInfo,
  SyncPicked,
  SyncPlan,
  SyncResolution,
  SyncServer,
  SyncSftpForm,
  SyncSftpTest,
  SyncStatus,
} from '../models/project.model';
import { formatBytes, percentOf } from '../utils/project.utils';
import { getDesktopBridge } from './desktop-update.service';
import { ProjectStoreService } from './project-store.service';
import { ToastService } from './toast.service';

export type SyncDialog =
  | { kind: 'link'; picked: SyncPicked | null; error: ProjectErrorCode | null }
  | { kind: 'plan'; picked: SyncPicked }
  | { kind: 'conflict'; ref: string; name: string; conflict: SyncConflictInfo }
  | { kind: 'offline'; reason?: ProjectErrorCode }
  | { kind: 'stop'; project: ProjectSummary }
  | { kind: 'unlink' }
  | { kind: 'server' }
  | {
      kind: 'sftp-test';
      state: 'running' | 'ok' | 'error';
      steps: SyncSftpTest['steps'];
      error?: ProjectErrorCode;
      detail?: unknown;
      host: string;
    }
  | { kind: 'hostkey'; host: string; key: SyncHostKey; purpose: 'link' | 'manage' }
  | { kind: 'credential'; reason: 'auth' | 'passphrase' | 'ask' | 'change' }
  | { kind: 'nostore' }
  | { kind: 'forget' }
  | { kind: 'unlink-sftp'; relink: boolean }
  | { kind: 'duplicates'; ref: string; files: string[] }
  | { kind: 'error'; code: ProjectErrorCode; detail?: unknown }
  | null;

const POLL_MS = 30_000;

/**
 * Sincronizar proyectos con una carpeta enlazada (fase 3, solo escritorio). El trabajo (huellas, copia, bloqueo, revisión)
 * ocurre en el proceso principal; aquí solo viven el estado de las tarjetas, los diálogos y el avance.
 */
@Injectable({ providedIn: 'root' })
export class ProjectSyncService {
  private readonly store = inject(ProjectStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly info = signal<SyncInfo | null>(null);
  readonly dialog = signal<SyncDialog>(null);
  readonly progress = signal<ProjectProgress | null>(null);
  readonly working = signal(false);
  readonly accepted = signal(false);
  readonly plan = signal<SyncPlan>('both');
  readonly conflictChoice = signal<SyncResolution>('theirs');
  /** Nombre del proyecto que se está sincronizando (para el título del avance). */
  readonly subject = signal('');

  // Servidor SFTP (fase 3b). Las credenciales que se escriben viajan una sola vez al proceso principal y se borran aquí.
  readonly linkTab = signal<'folder' | 'sftp'>('folder');
  readonly form = signal<SyncSftpForm>({
    host: '',
    port: 22,
    username: '',
    path: '/pdf-annotator',
    authMode: 'password',
  });
  readonly password = signal('');
  readonly passphrase = signal('');
  readonly keyFile = signal('');
  readonly remember = signal(true);
  readonly sftpOk = signal<SyncSftpTest | null>(null);
  /** Huella que el usuario ya confirmó en este diálogo (para no preguntar dos veces por el mismo servidor). */
  private trusted = '';
  private askedSecret = false;
  private testingSaved = false;

  readonly linked = computed(() => this.info()?.linked === true);
  readonly folder = computed(() => {
    const info = this.info();
    return info?.linked ? (info.folder ?? info.label) : '';
  });
  /** Texto del destino para el pie y los diálogos: la carpeta o «usuario@servidor:/ruta». */
  readonly label = computed(() => {
    const info = this.info();
    return info?.linked ? info.label : '';
  });
  readonly kind = computed<'folder' | 'sftp' | null>(() => {
    const info = this.info();
    return info?.linked ? info.kind : null;
  });
  readonly server = computed<SyncServer | null>(() => {
    const info = this.info();
    return info?.linked ? (info.server ?? null) : null;
  });
  readonly reachable = computed(() => {
    const info = this.info();
    return info?.linked ? info.reachable : true;
  });
  readonly available = computed<SyncAvailable[]>(() => {
    const info = this.info();
    return info?.linked ? info.available : [];
  });
  readonly pendingCount = computed(() => {
    const info = this.info();
    return info?.linked
      ? Object.values(info.statuses).filter((s) => s.state === 'pend' || s.state === 'pull').length
      : 0;
  });
  readonly percent = computed(() => {
    const p = this.progress();
    if (p?.bytesTotal) {
      return Math.min(100, percentOf(p.bytes ?? 0, p.bytesTotal));
    }
    return p ? percentOf(p.done, p.total) : 0;
  });
  /** Bytes, velocidad y tiempo restante (solo si se están moviendo datos). */
  readonly transferInfo = computed(() => {
    const p = this.progress();
    if (!p?.bytesTotal || !p.speed) {
      return null;
    }
    const left = Math.max(0, p.bytesTotal - (p.bytes ?? 0));
    return {
      done: formatBytes(p.bytes ?? 0),
      total: formatBytes(p.bytesTotal),
      speed: formatBytes(p.speed),
      eta: this.duration(Math.ceil(left / p.speed)),
    };
  });

  private timer: ReturnType<typeof setInterval> | null = null;
  private offProgress: (() => void) | null = null;
  private offEvents: (() => void) | null = null;
  private lastNames = new Map<string, string>();

  private bridge(): ProjectsBridge | null {
    return getDesktopBridge()?.projects ?? null;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  statusOf(ref: string): SyncStatus {
    const info = this.info();
    return (info?.linked && info.statuses[ref]) || { state: 'none' };
  }

  /** Empieza a vigilar (la pantalla de proyectos lo llama al entrar y `stop` al salir). */
  start(): void {
    const bridge = this.bridge();
    if (!bridge?.syncStatus || this.timer) {
      return;
    }
    this.offEvents = bridge.onSyncEvent?.((event) => this.onEvent(event)) ?? null;
    this.offProgress =
      bridge.onProgress?.((p) => {
        if (p.op === 'sync' && this.working()) {
          this.progress.set(p);
          if (p.name) {
            this.subject.set(p.name);
          }
        }
      }) ?? null;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.offEvents?.();
    this.offProgress?.();
    this.offEvents = this.offProgress = null;
  }

  async refresh(fresh = false): Promise<void> {
    const bridge = this.bridge();
    if (!bridge?.syncStatus) {
      return;
    }
    try {
      const result = await bridge.syncStatus(fresh ? { fresh: true } : undefined);
      this.info.set('error' in result ? null : result);
    } catch {
      this.info.set(null);
    }
    this.askSecretOnce();
  }

  /** Servidor con contraseña sin guardar: se pide una vez al abrir la app (solo se usa mientras esté abierta). */
  private askSecretOnce(): void {
    const info = this.info();
    if (
      this.askedSecret ||
      this.dialog() ||
      !info?.linked ||
      info.reachable ||
      (info.offlineReason !== 'secret-needed' && info.offlineReason !== 'passphrase-needed')
    ) {
      return;
    }
    this.askedSecret = true;
    this.password.set('');
    this.passphrase.set('');
    this.dialog.set({ kind: 'credential', reason: 'ask' });
  }

  private duration(seconds: number): string {
    return seconds >= 60
      ? this.t('projects.sync.progress.minutes', { m: Math.floor(seconds / 60), s: seconds % 60 })
      : this.t('projects.sync.progress.seconds', { s: seconds });
  }

  private onEvent(event: SyncEvent): void {
    void this.refresh();
    void this.store.refresh();
    if (event.state === 'error') {
      const name = this.nameOf(event.ref);
      this.toast.warning(
        this.t('projects.sync.bgError', {
          name,
          reason: this.errorText(event.error ?? 'io', event.detail),
        }),
      );
    }
  }

  private nameOf(ref: string): string {
    return this.store.projects().find((p) => p.ref === ref)?.name ?? this.lastNames.get(ref) ?? ref;
  }

  errorText(code: ProjectErrorCode, detail?: unknown): string {
    const known: ProjectErrorCode[] = [
      'host-key-changed',
      'host-key-unknown',
      'host-not-found',
      'connect-timeout',
      'connection-refused',
      'connection-lost',
      'auth-failed',
      'bad-passphrase',
      'passphrase-needed',
      'key-unusable',
      'secret-needed',
      'remote-missing',
      'rename-unsupported',
      'lock-expired',
      'already-linked',
      'bad-sftp-config',
      'folder-missing',
      'folder-readonly',
      'folder-overlaps',
      'remote-incomplete',
      'cloud-pending',
      'ref-taken',
      'in-use-local',
      'in-use',
      'disk-full',
      'not-linked',
      'newer-format',
    ];
    const text = typeof detail === 'string' ? detail : '';
    return known.includes(code)
      ? this.t(`projects.sync.err.${code}`, { detail: text })
      : this.t(`projects.error.${code}`);
  }

  closeDialog(): void {
    this.password.set('');
    this.passphrase.set('');
    this.dialog.set(null);
  }

  private async track<T>(subject: string, fn: () => Promise<T>): Promise<T> {
    this.working.set(true);
    this.subject.set(subject);
    this.progress.set({ op: 'sync', done: 0, total: 0 });
    try {
      return await fn();
    } finally {
      this.working.set(false);
      this.progress.set(null);
      await this.refresh();
      await this.store.refresh();
    }
  }

  cancel(): void {
    void this.bridge()?.cancel();
  }

  // ---------------------------------------------------------------- vincular

  startLink(): void {
    this.accepted.set(false);
    this.sftpOk.set(null);
    this.trusted = '';
    this.linkTab.set(this.kind() === 'sftp' ? 'sftp' : 'folder');
    this.dialog.set({ kind: 'link', picked: null, error: null });
  }

  cancelLink(): void {
    this.password.set('');
    this.passphrase.set('');
    this.dialog.set(null);
  }

  async pickFolder(): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      return;
    }
    const result = await bridge.syncChoose();
    if ('canceled' in result) {
      return;
    }
    if ('error' in result) {
      this.dialog.set({ kind: 'link', picked: null, error: result.error });
      return;
    }
    this.dialog.set({ kind: 'link', picked: result, error: null });
  }

  async confirmLink(): Promise<void> {
    const bridge = this.bridge();
    const d = this.dialog();
    if (!bridge || d?.kind !== 'link' || !d.picked || !this.accepted()) {
      return;
    }
    const picked = d.picked;
    const result = await bridge.syncLink({ accepted: true });
    if ('error' in result) {
      this.dialog.set({ kind: 'link', picked, error: result.error });
      return;
    }
    await this.refresh();
    if (picked.local > 0 || picked.remote > 0) {
      this.plan.set(picked.local > 0 ? 'both' : 'down');
      this.dialog.set({ kind: 'plan', picked });
    } else {
      this.dialog.set(null);
      this.toast.show(this.t('projects.sync.done.linked'), 'success');
    }
  }

  async runPlan(): Promise<void> {
    const mode = this.plan();
    this.dialog.set(null);
    await this.syncAll(mode);
    if (mode === 'manual') {
      this.toast.show(this.t('projects.sync.done.linked'), 'success');
    }
  }

  async syncAll(mode: SyncPlan): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || this.working() || mode === 'manual') {
      return;
    }
    await this.refresh(true);
    if (!this.reachable()) {
      this.explainOffline();
      return;
    }
    const result = await this.track(this.t('projects.sync.progress.titleAll'), () =>
      bridge.syncAll({ mode }),
    );
    if ('canceled' in result) {
      this.toast.show(this.t('projects.sync.canceled'), 'info');
    } else if ('error' in result) {
      this.fail(result.error, result.detail);
    } else if (result.failed.length || result.conflicts.length) {
      this.toast.warning(
        this.t('projects.sync.done.allIssues', {
          failed: result.failed.length,
          conflicts: result.conflicts.length,
        }),
      );
    } else {
      this.toast.show(this.t('projects.sync.done.all', { count: result.synced }), 'success');
    }
  }

  /** Cada fallo lleva a la pantalla que ayuda a resolverlo (P-93); lo local sigue funcionando siempre. */
  private fail(code: ProjectErrorCode, detail?: unknown): void {
    if (code === 'folder-missing') {
      this.dialog.set({ kind: 'offline' });
    } else if (
      code === 'host-not-found' ||
      code === 'connect-timeout' ||
      code === 'connection-refused' ||
      code === 'connection-lost'
    ) {
      this.dialog.set({ kind: 'offline', reason: code });
    } else if (code === 'host-key-changed') {
      void this.reviewHostKey();
    } else if (code === 'auth-failed') {
      this.openCredential('auth');
    } else if (code === 'bad-passphrase' || code === 'passphrase-needed') {
      this.openCredential(code === 'bad-passphrase' ? 'passphrase' : 'ask');
    } else if (code === 'secret-needed') {
      this.openCredential('ask');
    } else {
      this.dialog.set({ kind: 'error', code, detail });
    }
  }

  private openCredential(reason: 'auth' | 'passphrase' | 'ask' | 'change'): void {
    this.password.set('');
    this.passphrase.set('');
    this.remember.set(true);
    this.dialog.set({ kind: 'credential', reason });
  }

  // ---------------------------------------------------------------- un proyecto

  async syncProject(ref: string, name: string, resolution?: SyncResolution): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || this.working()) {
      return;
    }
    this.lastNames.set(ref, name);
    const result = await this.track(name, () =>
      bridge.syncProject({ ref, action: 'sync', resolution }),
    );
    if ('canceled' in result) {
      this.toast.show(this.t('projects.sync.canceled'), 'info');
    } else if ('error' in result) {
      this.fail(result.error, result.detail);
    } else if ('conflict' in result) {
      this.conflictChoice.set('theirs');
      this.dialog.set({ kind: 'conflict', ref, name, conflict: result.conflict });
    } else if ('action' in result) {
      this.report(name, result);
    }
  }

  private report(name: string, result: { action: string; rev?: number; copy?: string }): void {
    if (result.action === 'push') {
      this.toast.show(this.t('projects.sync.done.up', { name, rev: result.rev ?? 0 }), 'success');
    } else if (result.action === 'pull') {
      this.toast.show(this.t('projects.sync.done.down', { name, rev: result.rev ?? 0 }), 'success');
      if (result.copy) {
        this.toast.notice(this.t('projects.sync.done.copy', { name: result.copy }));
      }
    } else if (result.action === 'none') {
      this.toast.show(this.t('projects.sync.done.none', { name }), 'info');
    }
  }

  download(project: SyncAvailable): Promise<void> {
    return this.syncProject(project.ref, project.name);
  }

  async confirmConflict(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'conflict') {
      return;
    }
    const choice = this.conflictChoice();
    this.dialog.set(null);
    if (choice === 'later') {
      return;
    }
    await this.syncProject(d.ref, d.name, choice);
  }

  async setPaused(ref: string, paused: boolean): Promise<void> {
    await this.bridge()?.syncProject({ ref, action: paused ? 'pause' : 'resume' });
    await this.refresh();
    this.toast.show(
      this.t(paused ? 'projects.sync.done.paused' : 'projects.sync.done.resumed'),
      'info',
    );
  }

  askStop(project: ProjectSummary): void {
    this.dialog.set({ kind: 'stop', project });
  }

  async confirmStop(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'stop') {
      return;
    }
    this.dialog.set(null);
    await this.bridge()?.syncProject({ ref: d.project.ref, action: 'stop' });
    await this.refresh();
    this.toast.show(this.t('projects.sync.done.stopped', { name: d.project.name }), 'info');
  }

  // ---------------------------------------------------------------- carpeta

  askManage(): void {
    this.dialog.set({ kind: this.kind() === 'sftp' ? 'server' : 'unlink' });
  }

  async unlink(relink = false): Promise<void> {
    this.dialog.set(null);
    await this.bridge()?.syncUnlink();
    await this.refresh();
    this.toast.show(this.t('projects.sync.done.unlinked'), 'info');
    if (relink) {
      this.startLink();
    }
  }

  changeFolder(): void {
    if (this.kind() === 'sftp') {
      this.dialog.set({ kind: 'unlink-sftp', relink: true });
      return;
    }
    this.startLink();
    this.linkTab.set('folder');
    void this.pickFolder();
  }

  // ---------------------------------------------------------------- servidor SFTP

  setTab(tab: 'folder' | 'sftp'): void {
    this.linkTab.set(tab);
    this.sftpOk.set(null);
  }

  patchForm(patch: Partial<SyncSftpForm>): void {
    this.form.update((f) => ({ ...f, ...patch }));
    this.sftpOk.set(null);
    this.accepted.set(false);
  }

  async pickKey(): Promise<void> {
    const result = await this.bridge()?.syncSftpChooseKey();
    if (result && 'keyFile' in result) {
      this.keyFile.set(result.keyFile);
      this.sftpOk.set(null);
    }
  }

  /** ¿Están los datos mínimos para probar? (no se admiten contraseñas vacías ni claves sin archivo). */
  readonly formReady = computed(() => {
    const f = this.form();
    const hasSecret =
      f.authMode === 'password' ? this.password().length > 0 : this.keyFile().length > 0;
    return !!f.host.trim() && !!f.username.trim() && !!f.path.trim() && hasSecret;
  });

  /** «Probar conexión»: primero la huella (se confirma la primera vez) y luego el acceso y la carpeta. */
  async testSftp(create = false): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || !this.formReady()) {
      return;
    }
    this.testingSaved = false;
    const f = this.form();
    const host = f.host.trim();
    this.dialog.set({ kind: 'sftp-test', state: 'running', steps: [], host });
    const seen = await bridge.syncSftpInspect({ ...f, host });
    if ('error' in seen) {
      this.dialog.set({
        kind: 'sftp-test',
        state: 'error',
        steps: [],
        error: seen.error,
        detail: seen.detail,
        host,
      });
      return;
    }
    if (seen.fingerprint !== this.trusted) {
      this.dialog.set({ kind: 'hostkey', host, key: seen, purpose: 'link' });
      return;
    }
    await this.runTest(create);
  }

  /** El usuario confirmó la huella en el diálogo «¿Es este tu servidor?». */
  async trustHostKey(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'hostkey') {
      return;
    }
    if (d.purpose === 'manage') {
      this.dialog.set(null);
      const result = await this.bridge()?.syncSftpTrust({ accepted: true });
      if (result && 'error' in result) {
        this.fail(result.error);
        return;
      }
      await this.refresh();
      this.toast.show(this.t('projects.sync.hostkey.pinned'), 'success');
      return;
    }
    this.trusted = d.key.fingerprint;
    await this.runTest(false);
  }

  private async runTest(create: boolean): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      return;
    }
    const f = this.form();
    const host = f.host.trim();
    this.dialog.set({ kind: 'sftp-test', state: 'running', steps: [], host });
    const result = await bridge.syncSftpTest({
      config: { ...f, host },
      secret: { password: this.password(), passphrase: this.passphrase() },
      create,
      remember: this.remember(),
    });
    if ('error' in result) {
      this.dialog.set({
        kind: 'sftp-test',
        state: 'error',
        steps: [],
        error: result.error,
        detail: result.detail,
        host,
      });
      return;
    }
    if (result.ok) {
      this.sftpOk.set(result);
      this.dialog.set({ kind: 'sftp-test', state: 'ok', steps: result.steps, host });
    } else {
      this.dialog.set({
        kind: 'sftp-test',
        state: 'error',
        steps: result.steps,
        error: result.error,
        detail: result.detail,
        host,
      });
    }
  }

  retryTest(create = false): void {
    if (this.testingSaved) {
      void this.testSaved();
    } else {
      void this.testSftp(create);
    }
  }

  /** Vuelve al diálogo de vincular tras una prueba correcta (o para corregir los datos). */
  backToLink(): void {
    this.dialog.set({ kind: 'link', picked: null, error: null });
  }

  /** «Vincular» con un servidor: si no hay almacén seguro se explica antes de seguir. */
  async confirmLinkSftp(): Promise<void> {
    const ok = this.sftpOk();
    if (!ok || !this.accepted()) {
      return;
    }
    if (this.remember() && !ok.secureStore) {
      this.dialog.set({ kind: 'nostore' });
      return;
    }
    await this.finishLinkSftp(ok);
  }

  async chooseNoStore(askEachTime: boolean): Promise<void> {
    if (askEachTime) {
      this.remember.set(false);
      const ok = this.sftpOk();
      if (ok) {
        await this.finishLinkSftp(ok);
      }
      return;
    }
    // «Instalar un llavero y reintentar»: se vuelve a probar para ver si ya hay almacén seguro.
    this.dialog.set({ kind: 'link', picked: null, error: null });
    await this.testSftp();
  }

  private async finishLinkSftp(ok: SyncSftpTest): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      return;
    }
    const result = await bridge.syncLink({ accepted: true, remember: this.remember() });
    this.password.set('');
    this.passphrase.set('');
    if ('error' in result) {
      this.dialog.set({ kind: 'link', picked: null, error: result.error });
      return;
    }
    await this.refresh();
    const picked: SyncPicked = {
      folder: ok.folder,
      free: ok.free ?? null,
      local: ok.local,
      remote: ok.remote,
      bytes: ok.bytes,
    };
    if (picked.local > 0 || picked.remote > 0) {
      this.plan.set(picked.local > 0 ? 'both' : 'down');
      this.dialog.set({ kind: 'plan', picked });
    } else {
      this.dialog.set(null);
      this.toast.show(this.t('projects.sync.done.linked'), 'success');
    }
  }

  /** «Probar conexión» con el servidor ya enlazado y su credencial guardada. */
  async testSaved(): Promise<void> {
    const bridge = this.bridge();
    const server = this.server();
    if (!bridge || !server) {
      return;
    }
    const host = server.host;
    this.testingSaved = true;
    this.dialog.set({ kind: 'sftp-test', state: 'running', steps: [], host });
    const result = await bridge.syncSftpTest({ useSaved: true });
    if ('error' in result) {
      this.dialog.set({
        kind: 'sftp-test',
        state: 'error',
        steps: [],
        error: result.error,
        detail: result.detail,
        host,
      });
    } else if (result.ok) {
      this.dialog.set({ kind: 'sftp-test', state: 'ok', steps: result.steps, host });
    } else {
      this.dialog.set({
        kind: 'sftp-test',
        state: 'error',
        steps: result.steps,
        error: result.error,
        detail: result.detail,
        host,
      });
    }
    await this.refresh();
  }

  /** Huella cambiada: se vuelve a leer y solo se acepta la nueva a propósito (no hay «aceptar siempre»). */
  async reviewHostKey(): Promise<void> {
    const bridge = this.bridge();
    const server = this.server();
    if (!bridge || !server) {
      return;
    }
    const seen = await bridge.syncSftpInspect({
      host: server.host,
      port: server.port,
      username: server.username,
      path: server.path,
      authMode: server.authMode,
    });
    if ('error' in seen) {
      this.dialog.set({ kind: 'error', code: seen.error });
      return;
    }
    this.dialog.set({ kind: 'hostkey', host: server.host, key: seen, purpose: 'manage' });
  }

  askCredential(): void {
    this.openCredential('change');
  }

  async saveCredential(): Promise<void> {
    const bridge = this.bridge();
    const d = this.dialog();
    const server = this.server();
    if (!bridge || d?.kind !== 'credential' || !server) {
      return;
    }
    const keyMode = server.authMode === 'key';
    const value = keyMode ? this.passphrase() : this.password();
    if (!value) {
      return;
    }
    this.dialog.set(null);
    const result = await bridge.syncSftpCredential({
      ...(keyMode ? { passphrase: value } : { password: value }),
      remember: this.remember(),
    });
    this.password.set('');
    this.passphrase.set('');
    if ('error' in result) {
      this.fail(result.error);
      return;
    }
    await this.refresh();
    if (d.reason === 'change') {
      this.toast.show(this.t('projects.sync.cred.saved'), 'success');
    } else {
      await this.syncAll('sync');
    }
  }

  askForget(): void {
    this.dialog.set({ kind: 'forget' });
  }

  async forgetCredential(): Promise<void> {
    this.dialog.set(null);
    await this.bridge()?.syncSftpForget();
    await this.refresh();
    this.toast.show(this.t('projects.sync.cred.forgotten'), 'info');
  }

  showDuplicates(ref: string): void {
    const files = this.statusOf(ref).duplicates ?? [];
    this.dialog.set({ kind: 'duplicates', ref, files });
  }

  reveal(ref: string): void {
    void this.bridge()?.syncReveal({ ref });
  }

  /** Sin conexión: si se sabe por qué (huella, credencial…) se lleva a la pantalla que lo resuelve. */
  private explainOffline(): void {
    const info = this.info();
    const reason = info?.linked ? info.offlineReason : undefined;
    if (reason) {
      this.fail(reason);
    } else {
      this.dialog.set({ kind: 'offline' });
    }
  }

  async retryOffline(): Promise<void> {
    this.dialog.set(null);
    await this.refresh(true);
    if (!this.reachable()) {
      this.explainOffline();
    } else {
      await this.syncAll('sync');
    }
  }

  size(bytes: number): string {
    return formatBytes(bytes);
  }
}
