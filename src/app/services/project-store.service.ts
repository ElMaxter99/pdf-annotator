import { Injectable, inject, signal } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import type { BatchItem } from '../models/batch.model';
import type {
  ActiveProject,
  ProjectErrorCode,
  ProjectLimits,
  ProjectLockInfo,
  ProjectStoredItem,
  ProjectSummary,
  ProjectsBridge,
} from '../models/project.model';
import { BatchStoreService, type BatchSink, reviveBatchItem } from './batch-store.service';
import { getDesktopBridge } from './desktop-update.service';
import { ToastService } from './toast.service';

const ACTIVE_KEY = 'pdf-annotator.active-project';
const LAST_KEY = 'pdf-annotator.last-project';
const SAVE_DELAY_MS = 400;
/** How often an open project checks that this computer still holds it (the main process renews the lock every minute). */
const LOCK_CHECK_MS = 20_000;

export const DEFAULT_LIMITS: ProjectLimits = {
  maxPdfs: 200,
  maxBytes: 2 * 1024 * 1024 * 1024,
  warnPdfs: 100,
  warnBytes: 1024 * 1024 * 1024,
  maxPdfBytes: 40 * 1024 * 1024,
};

export type OpenResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly locked: ProjectLockInfo }
  | { readonly ok: false; readonly error: ProjectErrorCode };

/**
 * Local projects of the desktop app. A project is a folder on disk with its batch of PDFs; opening
 * one loads it into `BatchStoreService` and mirrors every change back to the folder. Only one
 * computer edits a project at a time (the main process keeps a lock file alive). In the browser
 * there is no bridge and nothing here does anything.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStoreService {
  private readonly batch = inject(BatchStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly projects = signal<ProjectSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal<ProjectErrorCode | null>(null);
  readonly root = signal('');
  readonly host = signal('');
  readonly limits = signal<ProjectLimits>(DEFAULT_LIMITS);
  readonly active = signal<ActiveProject | null>(null);
  readonly lockLost = signal(false);
  /** Only the desktop app has projects (a plain function: the bridge is not a signal). */
  readonly available = (): boolean => this.bridge() !== null;

  private restoring: Promise<boolean> | null = null;
  private lockTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pending = new Map<string, BatchItem>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly written = new WeakSet<Blob>();

  bridge(): ProjectsBridge | null {
    return getDesktopBridge()?.projects ?? null;
  }

  /** Last project opened here (for «Continuar en…» on the landing). */
  lastProject(): { ref: string; name: string } | null {
    try {
      const raw = JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') as {
        ref?: unknown;
        name?: unknown;
      } | null;
      return raw && typeof raw.ref === 'string' && typeof raw.name === 'string'
        ? { ref: raw.ref.slice(0, 300), name: raw.name.slice(0, 80) }
        : null;
    } catch {
      return null;
    }
  }

  async refresh(): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const info = await bridge.info();
      this.root.set(info.root);
      this.host.set(info.host);
      this.limits.set(info.limits ?? DEFAULT_LIMITS);
      const result = await bridge.list();
      if ('error' in result) {
        this.projects.set([]);
        this.error.set(result.error);
      } else {
        this.projects.set(result.projects);
      }
    } catch {
      this.error.set('io');
    } finally {
      this.loading.set(false);
    }
  }

  async chooseRoot(): Promise<void> {
    const result = await this.bridge()?.chooseRoot();
    if (result && 'root' in result) {
      await this.refresh();
    }
  }

  async create(name: string, subpath: string): Promise<ProjectSummary | ProjectErrorCode> {
    const result = await this.bridge()?.create({ name, subpath });
    if (!result) {
      return 'io';
    }
    if ('error' in result) {
      return result.error;
    }
    await this.refresh();
    return result.project;
  }

  /** Renombra el nombre visible y, si se pide, la carpeta. `locked` = otro equipo lo tiene abierto. */
  async rename(
    ref: string,
    name: string,
    folder: boolean,
  ): Promise<
    { ref: string; folderKept: boolean } | { locked: ProjectLockInfo } | ProjectErrorCode
  > {
    const result = await this.bridge()?.rename({ ref, name, folder });
    if (!result) {
      return 'io';
    }
    if ('error' in result) {
      return result.error;
    }
    await this.refresh();
    return 'locked' in result ? { locked: result.locked } : result;
  }

  /** Opens a project: loads its batch and starts mirroring changes to its folder. */
  async open(
    ref: string,
    options: { force?: boolean; readOnly?: boolean } = {},
  ): Promise<OpenResult> {
    const bridge = this.bridge();
    if (!bridge) {
      return { ok: false, error: 'io' };
    }
    await this.close();
    let result;
    try {
      result = await bridge.open({
        ref,
        force: options.force === true,
        readOnly: options.readOnly === true,
      });
    } catch {
      return { ok: false, error: 'io' };
    }
    if ('error' in result) {
      return { ok: false, error: result.error };
    }
    if ('locked' in result) {
      return { ok: false, locked: result.locked };
    }
    const items = result.items
      .map((stored) => this.revive(stored))
      .filter((item): item is BatchItem => item !== null);
    for (const item of items) {
      this.written.add(item.aPdf);
      if (item.bPdf) {
        this.written.add(item.bPdf);
      }
    }
    const readOnly = result.readOnly;
    this.lockLost.set(false);
    this.batch.attachProject(items, readOnly ? null : this.sinkFor(ref));
    this.active.set({ ref, name: result.project.name, readOnly });
    this.remember(ref, result.project.name, readOnly);
    if (!readOnly) {
      this.watchLock(ref);
    }
    return { ok: true };
  }

  /** Re-enters the project that was open before a reload (the lock is still held by the main process). */
  restore(): Promise<boolean> {
    if (this.active()) {
      return Promise.resolve(true);
    }
    this.restoring ??= this.doRestore().finally(() => (this.restoring = null));
    return this.restoring;
  }

  private async doRestore(): Promise<boolean> {
    const bridge = this.bridge();
    let saved: { ref?: unknown; readOnly?: unknown } | null = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) ?? 'null');
    } catch {
      saved = null;
    }
    if (!bridge || !saved || typeof saved.ref !== 'string') {
      return false;
    }
    const result = await this.open(saved.ref, { readOnly: saved.readOnly === true });
    return result.ok;
  }

  /** Leaves the project; pending changes are written first. */
  async close(): Promise<void> {
    const project = this.active();
    if (!project) {
      return;
    }
    this.stopWatchingLock();
    await this.flush();
    this.batch.detachProject();
    this.active.set(null);
    try {
      sessionStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* sin sessionStorage */
    }
    if (!project.readOnly) {
      await this.bridge()?.release({ ref: project.ref });
    }
  }

  async forget(ref: string): Promise<boolean> {
    if (this.active()?.ref === ref) {
      await this.close();
    }
    const result = await this.bridge()?.forget({ ref });
    if (result && !('error' in result)) {
      await this.refresh();
      return true;
    }
    return false;
  }

  /** Writes the current batch (the one in browser storage) as a project; used to adopt a batch that has no project yet. */
  async saveBatchAsProject(
    name: string,
    items: readonly BatchItem[],
  ): Promise<ProjectSummary | ProjectErrorCode> {
    const created = await this.create(name, '');
    if (typeof created === 'string') {
      return created;
    }
    const opened = await this.open(created.ref);
    if (!opened.ok) {
      return 'locked' in opened ? 'io' : opened.error;
    }
    this.batch.attachProject([...items], this.sinkFor(created.ref));
    for (const item of items) {
      this.queueSave(created.ref, item);
    }
    await this.flush();
    return created;
  }

  async flush(): Promise<void> {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    const jobs = [...this.pending.values()];
    this.pending.clear();
    const ref = this.active()?.ref;
    if (ref) {
      await Promise.all(jobs.map((item) => this.write(ref, item)));
    }
  }

  /** Notices soon (not only on the next save) when another computer takes the project over. */
  private watchLock(ref: string): void {
    this.stopWatchingLock();
    this.lockTimer = setInterval(() => {
      void this.bridge()
        ?.renew({ ref })
        .then((result) => {
          if ('error' in result || !result.ok) {
            this.handle({ error: 'not-held' });
            this.stopWatchingLock();
          }
        })
        .catch(() => undefined);
    }, LOCK_CHECK_MS);
  }

  private stopWatchingLock(): void {
    if (this.lockTimer) {
      clearInterval(this.lockTimer);
      this.lockTimer = null;
    }
  }

  private sinkFor(ref: string): BatchSink {
    return {
      save: (item) => this.queueSave(ref, item),
      remove: (id) => {
        this.pending.delete(id);
        const timer = this.timers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.timers.delete(id);
        }
        void this.bridge()
          ?.removeItem({ ref, id })
          .then((result) => this.handle(result));
      },
    };
  }

  private queueSave(ref: string, item: BatchItem): void {
    this.pending.set(item.id, item);
    const previous = this.timers.get(item.id);
    if (previous) {
      clearTimeout(previous);
    }
    this.timers.set(
      item.id,
      setTimeout(() => {
        this.timers.delete(item.id);
        const latest = this.pending.get(item.id);
        this.pending.delete(item.id);
        if (latest) {
          void this.write(ref, latest);
        }
      }, SAVE_DELAY_MS),
    );
  }

  private async write(ref: string, item: BatchItem): Promise<void> {
    const bridge = this.bridge();
    if (!bridge) {
      return;
    }
    const { aPdf, bPdf, ...rest } = item;
    const payload: {
      ref: string;
      id: string;
      meta: unknown;
      a?: Uint8Array;
      b?: Uint8Array | null;
    } = {
      ref,
      id: item.id,
      meta: rest,
    };
    if (!this.written.has(aPdf)) {
      payload.a = new Uint8Array(await aPdf.arrayBuffer());
    }
    if (!bPdf) {
      payload.b = null;
    } else if (!this.written.has(bPdf)) {
      payload.b = new Uint8Array(await bPdf.arrayBuffer());
    }
    try {
      const result = await bridge.saveItem(payload);
      if (!('error' in result)) {
        this.written.add(aPdf);
        if (bPdf) {
          this.written.add(bPdf);
        }
      }
      this.handle(result);
    } catch {
      this.handle({ error: 'io' });
    }
  }

  private handle(result: { ok: true } | { error: ProjectErrorCode } | undefined): void {
    if (!result || !('error' in result)) {
      return;
    }
    if (result.error === 'not-held') {
      if (!this.lockLost()) {
        this.lockLost.set(true);
        this.batch.dropSink();
        this.active.update((project) => (project ? { ...project, readOnly: true } : project));
        this.toast.error(this.i18n.translate('projects.error.lockLost'));
      }
      return;
    }
    this.toast.error(
      this.i18n.translate(`projects.error.${result.error}`, {
        max: Math.round(this.limits().maxPdfBytes / (1024 * 1024)),
      }),
    );
  }

  private revive(stored: ProjectStoredItem): BatchItem | null {
    const meta = stored.meta;
    if (!meta || typeof meta !== 'object') {
      return null;
    }
    const base = meta as Record<string, unknown>;
    const item = reviveBatchItem({
      ...base,
      id: stored.id,
      aPdf: new Blob([stored.a as BlobPart], { type: 'application/pdf' }),
      bPdf: stored.b ? new Blob([stored.b as BlobPart], { type: 'application/pdf' }) : null,
      bName: stored.b && typeof base['bName'] === 'string' ? base['bName'] : null,
    });
    return item;
  }

  private remember(ref: string, name: string, readOnly: boolean): void {
    try {
      sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ ref, readOnly }));
      localStorage.setItem(LAST_KEY, JSON.stringify({ ref, name }));
    } catch {
      /* sin almacenamiento del navegador */
    }
  }
}
