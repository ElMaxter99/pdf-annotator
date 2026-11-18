import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import type {
  ArchiveInfo,
  ArchiveOversize,
  ImportMode,
  ProjectConflict,
  ProjectErrorCode,
  ProjectExportInfo,
  ProjectProgress,
  ProjectSummary,
  ProjectsBridge,
} from '../models/project.model';
import { percentOf } from '../utils/project.utils';
import { getDesktopBridge } from './desktop-update.service';
import { ProjectStoreService } from './project-store.service';
import { ToastService } from './toast.service';

export type TransferDialog =
  | { kind: 'export'; ref: string; info: ProjectExportInfo }
  | { kind: 'export-empty' }
  | { kind: 'export-error'; code: ProjectErrorCode }
  | { kind: 'import'; file: string; fileName: string; info: ArchiveInfo }
  | { kind: 'conflict'; conflict: ProjectConflict }
  | { kind: 'replace'; conflict: ProjectConflict }
  | { kind: 'in-use'; host: string; name: string }
  | { kind: 'oversize'; info: ArchiveInfo }
  | { kind: 'import-error'; code: ProjectErrorCode; detail?: unknown; fileName?: string }
  | { kind: 'skipped'; rows: ArchiveOversize[] }
  | null;

export type TransferNotice =
  | { kind: 'exported'; name: string; bytes: number }
  | { kind: 'imported'; project: ProjectSummary; skipped: ArchiveOversize[] }
  | null;

interface ImportArgs {
  name: string;
  subpath: string;
  mode?: ImportMode;
  skipOversize?: boolean;
}

/**
 * Exportar e importar proyectos (fase 2, solo escritorio). Todo el trabajo pesado (ZIP, revisión, escritura)
 * ocurre en el proceso principal; aquí solo vive el estado de los diálogos y el avance.
 */
@Injectable({ providedIn: 'root' })
export class ProjectTransferService {
  private readonly store = inject(ProjectStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly dialog = signal<TransferDialog>(null);
  readonly notice = signal<TransferNotice>(null);
  readonly progress = signal<ProjectProgress | null>(null);
  readonly canceling = signal(false);
  readonly includeB = signal(true);
  readonly importName = signal('');
  readonly importSub = signal('');
  /** Carpeta que se usaría con el nombre y la subcarpeta escritos (`leftover`: la de siempre tiene archivos ajenos). */
  readonly target = signal<{ ref: string; leftover: boolean; next: string } | null>(null);
  private targetCall = 0;
  private targetPending: Promise<void> | null = null;
  readonly conflictChoice = signal<ImportMode>('copy');
  readonly skipChoice = signal<'skip' | 'cancel'>('skip');
  /** Nombre del proyecto que se está exportando o importando (para el título del avance). */
  readonly subject = signal('');
  readonly dragging = signal(false);
  readonly percent = computed(() => {
    const p = this.progress();
    return p ? percentOf(p.done, p.total) : 0;
  });

  private lastArgs: ImportArgs | null = null;
  private lastFileName = '';

  private bridge(): ProjectsBridge | null {
    return getDesktopBridge()?.projects ?? null;
  }

  private t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  /** `true` mientras se exporta, revisa o importa: nada más puede empezar. */
  readonly busy = computed(() => this.working());
  private readonly working = signal(false);

  private async track<T>(fn: () => Promise<T>): Promise<T> {
    const bridge = this.bridge();
    this.working.set(true);
    this.canceling.set(false);
    const off = bridge?.onProgress?.((p) => this.progress.set(p));
    try {
      return await fn();
    } finally {
      off?.();
      this.working.set(false);
      this.progress.set(null);
    }
  }

  cancel(): void {
    this.canceling.set(true);
    void this.bridge()?.cancel();
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  dismissNotice(): void {
    this.notice.set(null);
  }

  // ---------------------------------------------------------------- exportar

  async startExport(project: ProjectSummary): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || this.busy()) {
      return;
    }
    const info = await bridge.exportInfo({ ref: project.ref });
    if ('error' in info) {
      if (info.error === 'empty') {
        this.dialog.set({ kind: 'export-empty' });
      } else {
        this.toast.error(this.t(`projects.error.${info.error}`));
      }
      return;
    }
    this.subject.set(info.name);
    this.includeB.set(info.pdfsB > 0);
    this.dialog.set({ kind: 'export', ref: project.ref, info });
  }

  async runExport(): Promise<void> {
    const bridge = this.bridge();
    const d = this.dialog();
    if (!bridge || d?.kind !== 'export' || this.busy()) {
      return;
    }
    this.notice.set(null);
    if (this.store.active()?.ref === d.ref) {
      await this.store.flush();
    }
    const result = await this.track(() =>
      bridge.exportProject({ ref: d.ref, includeB: this.includeB() }),
    );
    if ('canceled' in result) {
      // Cancelar el selector de archivos no es un fallo: se vuelve al diálogo sin más.
      if (this.canceling()) {
        this.dialog.set(null);
        this.toast.show(this.t('projects.transfer.exportCanceled'), 'info');
      }
      return;
    }
    if ('error' in result) {
      this.dialog.set(
        result.error === 'disk-full' ? { kind: 'export-error', code: 'disk-full' } : null,
      );
      if (result.error !== 'disk-full') {
        this.toast.error(this.t('projects.transfer.exportFailed'));
      }
      return;
    }
    this.dialog.set(null);
    this.notice.set({ kind: 'exported', name: result.name, bytes: result.bytes });
  }

  async reveal(): Promise<void> {
    await this.bridge()?.reveal();
  }

  // ---------------------------------------------------------------- importar

  /** Suelta de un archivo en la ventana: el puente da su ruta; el proceso principal lo revisa entero. */
  async dropFile(file: File): Promise<void> {
    const path = this.bridge()?.pathForFile(file) ?? '';
    await this.startImport(path || undefined, file.name);
  }

  async startImport(path?: string, droppedName = ''): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || this.busy()) {
      return;
    }
    this.notice.set(null);
    const result = await this.track(() => bridge.importInspect({ path }));
    if ('canceled' in result) {
      if (this.canceling()) {
        this.toast.show(this.t('projects.transfer.importCanceled'), 'info');
      }
      return;
    }
    if ('error' in result) {
      this.dialog.set({
        kind: 'import-error',
        code: result.error,
        detail: result.detail,
        fileName: droppedName,
      });
      return;
    }
    this.lastFileName = result.fileName;
    this.importName.set(result.info.name);
    this.importSub.set(result.info.ref);
    this.target.set(null);
    this.skipChoice.set('skip');
    this.conflictChoice.set('copy');
    this.dialog.set({
      kind: 'import',
      file: result.file,
      fileName: result.fileName,
      info: result.info,
    });
    void this.updateTarget();
  }

  /** Pregunta al proceso principal dónde caería la importación; solo cuenta la última respuesta. */
  updateTarget(): Promise<void> {
    const call = ++this.targetCall;
    const pending = (async () => {
      const result = await this.bridge()?.importTarget({
        name: this.importName().trim(),
        subpath: this.importSub().trim(),
      });
      if (call !== this.targetCall) return;
      this.target.set(result && !('error' in result) ? result : null);
    })();
    this.targetPending = pending;
    void pending.finally(() => {
      if (this.targetPending === pending) this.targetPending = null;
    });
    return pending;
  }

  /**
   * Espera a la última consulta de carpeta. Devuelve `false` si con ella ha aparecido un aviso de carpeta ocupada
   * que la persona aún no había visto: hay que enseñárselo antes de importar.
   */
  private async targetReady(): Promise<boolean> {
    const shown = this.target();
    let pending = this.targetPending;
    if (!pending) return true;
    while (pending) {
      await pending;
      pending = this.targetPending;
    }
    const now = this.target();
    return !now?.leftover || (shown?.leftover === true && shown.next === now.next);
  }

  /** «Abrir carpeta existente»: la que tiene archivos de un proyecto quitado de la lista. */
  async revealTarget(): Promise<void> {
    const ref = this.target()?.ref;
    if (!ref) return;
    const result = await this.bridge()?.revealFolder({ ref });
    if (result && 'error' in result) {
      this.toast.error(this.t(`projects.error.${result.error}`));
    }
  }

  /** «Importar»: si hay PDFs demasiado pesados pregunta antes; si ya existe el proyecto, también. */
  async confirmImport(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'import') {
      return;
    }
    if (!this.importName().trim()) {
      return;
    }
    if (!(await this.targetReady())) {
      return;
    }
    if (d.info.oversize.length) {
      this.dialog.set({ kind: 'oversize', info: d.info });
      return;
    }
    await this.runImport({ name: this.importName().trim(), subpath: this.importSub().trim() });
  }

  async acceptOversize(): Promise<void> {
    if (this.skipChoice() === 'cancel') {
      this.dialog.set(null);
      return;
    }
    await this.runImport({
      name: this.importName().trim(),
      subpath: this.importSub().trim(),
      skipOversize: true,
    });
  }

  async acceptConflict(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'conflict') {
      return;
    }
    if (this.conflictChoice() === 'replace') {
      this.dialog.set({ kind: 'replace', conflict: d.conflict });
      return;
    }
    await this.runImport({ ...this.args(), mode: 'copy' });
  }

  async confirmReplace(): Promise<void> {
    const d = this.dialog();
    if (d?.kind !== 'replace') {
      return;
    }
    // Si ese proyecto está abierto aquí se cierra antes (suelta su bloqueo); la copia de seguridad lo conserva.
    if (this.store.active()?.ref === d.conflict.ref) {
      await this.store.close();
    }
    await this.runImport({ ...this.args(), mode: 'replace' });
  }

  async makeCopyInstead(): Promise<void> {
    await this.runImport({ ...this.args(), mode: 'copy' });
  }

  async retryImport(): Promise<void> {
    if (this.lastArgs) {
      await this.runImport(this.lastArgs);
    }
  }

  private args(): ImportArgs {
    return {
      name: this.importName().trim(),
      subpath: this.importSub().trim(),
      skipOversize: this.lastArgs?.skipOversize,
    };
  }

  private async runImport(args: ImportArgs): Promise<void> {
    const bridge = this.bridge();
    if (!bridge || this.busy()) {
      return;
    }
    this.lastArgs = args;
    this.subject.set(args.name);
    const result = await this.track(() => bridge.importRun(args));
    if ('canceled' in result) {
      this.dialog.set(null);
      this.toast.show(this.t('projects.transfer.importCanceled'), 'info');
      return;
    }
    if ('conflict' in result) {
      this.conflictChoice.set('copy');
      this.dialog.set({ kind: 'conflict', conflict: result.conflict });
      return;
    }
    if ('error' in result) {
      if (result.error === 'in-use') {
        this.dialog.set({
          kind: 'in-use',
          host: typeof result.detail === 'string' ? result.detail : '',
          name: args.name,
        });
      } else {
        this.dialog.set({
          kind: 'import-error',
          code: result.error,
          detail: result.detail,
          fileName: this.lastFileName,
        });
      }
      return;
    }
    this.dialog.set(null);
    this.notice.set({ kind: 'imported', project: result.project, skipped: result.skipped });
    await this.store.refresh();
  }

  showSkipped(): void {
    const n = this.notice();
    if (n?.kind === 'imported' && n.skipped.length) {
      this.dialog.set({ kind: 'skipped', rows: n.skipped });
    }
  }
}
