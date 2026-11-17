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
  SyncInfo,
  SyncPicked,
  SyncPlan,
  SyncResolution,
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
  | { kind: 'offline' }
  | { kind: 'stop'; project: ProjectSummary }
  | { kind: 'unlink' }
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

  readonly linked = computed(() => this.info()?.linked === true);
  readonly folder = computed(() => {
    const info = this.info();
    return info?.linked ? info.folder : '';
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
    return p ? percentOf(p.done, p.total) : 0;
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

  async refresh(): Promise<void> {
    const bridge = this.bridge();
    if (!bridge?.syncStatus) {
      return;
    }
    try {
      const result = await bridge.syncStatus();
      this.info.set('error' in result ? null : result);
    } catch {
      this.info.set(null);
    }
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
    this.dialog.set({ kind: 'link', picked: null, error: null });
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
    await this.refresh();
    if (!this.reachable()) {
      this.dialog.set({ kind: 'offline' });
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

  private fail(code: ProjectErrorCode, detail?: unknown): void {
    if (code === 'folder-missing') {
      this.dialog.set({ kind: 'offline' });
      return;
    }
    this.dialog.set({ kind: 'error', code, detail });
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
    this.dialog.set({ kind: 'unlink' });
  }

  async unlink(): Promise<void> {
    this.dialog.set(null);
    await this.bridge()?.syncUnlink();
    await this.refresh();
    this.toast.show(this.t('projects.sync.done.unlinked'), 'info');
  }

  changeFolder(): void {
    this.startLink();
    void this.pickFolder();
  }

  showDuplicates(ref: string): void {
    const files = this.statusOf(ref).duplicates ?? [];
    this.dialog.set({ kind: 'duplicates', ref, files });
  }

  reveal(ref: string): void {
    void this.bridge()?.syncReveal({ ref });
  }

  async retryOffline(): Promise<void> {
    this.dialog.set(null);
    await this.refresh();
    if (!this.reachable()) {
      this.dialog.set({ kind: 'offline' });
    } else {
      await this.syncAll('sync');
    }
  }

  size(bytes: number): string {
    return formatBytes(bytes);
  }
}
