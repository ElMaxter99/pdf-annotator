import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_NAME } from '../../app-version';
import { VersionChipComponent } from '../../components/version-chip/version-chip.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import type { ProjectErrorCode, ProjectLockInfo, ProjectSummary } from '../../models/project.model';
import { AppMetadataService } from '../../services/app-metadata.service';
import { BatchStoreService } from '../../services/batch-store.service';
import { getDesktopBridge } from '../../services/desktop-update.service';
import { ProjectStoreService } from '../../services/project-store.service';
import { ProjectSyncService } from '../../services/project-sync.service';
import {
  ProjectTransferService,
  type TransferDialog,
} from '../../services/project-transfer.service';
import { ToastService } from '../../services/toast.service';
import { exportEstimate, formatBytes, projectSize } from '../../utils/project.utils';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';

type Dialog =
  | { kind: 'new' }
  | { kind: 'takeover'; project: ProjectSummary }
  | { kind: 'forget'; project: ProjectSummary }
  | null;

/** «Proyectos» (solo escritorio): un cliente o trabajo = una carpeta del disco con su lote de PDFs. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-projects-page',
  standalone: true,
  imports: [RouterLink, TranslationPipe, VersionChipComponent, FocusTrapDirective],
  templateUrl: './projects.page.html',
  styleUrls: ['./projects.page.scss'],
})
export class ProjectsPageComponent implements OnInit, OnDestroy {
  readonly store = inject(ProjectStoreService);
  readonly transfer = inject(ProjectTransferService);
  readonly sync = inject(ProjectSyncService);
  private readonly batch = inject(BatchStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  readonly appName = APP_NAME;
  readonly query = signal('');
  readonly dialog = signal<Dialog>(null);
  readonly busy = signal<string | null>(null);
  readonly formError = signal<ProjectErrorCode | null>(null);
  readonly newName = signal('');
  readonly newSub = signal('');
  /** `ref` of the card whose ⋯ menu is open. */
  readonly menuFor = signal<string | null>(null);
  readonly orphanCount = computed(() => (this.store.active() ? 0 : this.batch.items().length));

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.store
      .projects()
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q));
  });
  readonly skeletons = [0, 1];

  ngOnInit(): void {
    this.metadata.applyDefaultMetadata();
    if (!this.store.available()) {
      void this.router.navigate(['/landing']);
      return;
    }
    void this.store.refresh();
    void this.batch.load();
    this.sync.start();
  }

  ngOnDestroy(): void {
    this.sync.stop();
  }

  t(key: string, params?: Record<string, unknown>): string {
    return this.i18n.translate(key, params);
  }

  size(project: ProjectSummary): string {
    return formatBytes(project.bytes);
  }

  fill(project: ProjectSummary): 'ok' | 'warn' | 'full' {
    return projectSize(project, this.store.limits());
  }

  percent(project: ProjectSummary): number {
    return project.pdfs ? Math.round((100 * project.done) / project.pdfs) : 0;
  }

  when(ms: number): string {
    return new Date(ms).toLocaleString(this.i18n.getCurrentLanguage(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }

  clock(ms: number | undefined): string {
    return ms
      ? new Date(ms).toLocaleTimeString(this.i18n.getCurrentLanguage(), { timeStyle: 'short' })
      : '';
  }

  inUseByOther(lock: ProjectLockInfo): boolean {
    return lock.state === 'other';
  }

  openNew(): void {
    this.newName.set('');
    this.newSub.set('');
    this.formError.set(null);
    this.dialog.set({ kind: 'new' });
  }

  closeDialog(): void {
    this.dialog.set(null);
  }

  async create(): Promise<void> {
    const name = this.newName().trim();
    if (!name) {
      this.formError.set('bad-name');
      return;
    }
    this.busy.set('create');
    const result = await this.store.create(name, this.newSub().trim());
    this.busy.set(null);
    if (typeof result === 'string') {
      this.formError.set(result);
      return;
    }
    this.dialog.set(null);
    this.toast.show(this.t('projects.created', { name: result.name }), 'success');
  }

  async open(
    project: ProjectSummary,
    options: { force?: boolean; readOnly?: boolean } = {},
  ): Promise<void> {
    this.busy.set(project.ref);
    const result = await this.store.open(project.ref, options);
    this.busy.set(null);
    if (result.ok) {
      this.dialog.set(null);
      await this.router.navigate(['/lote']);
    } else if ('error' in result) {
      this.toast.error(this.t(`projects.error.${result.error}`));
    } else {
      await this.store.refresh();
      await this.sync.refresh();
    }
  }

  /** Quién lo tiene abierto: este equipo no, otro equipo (bloqueo local) o a través de la carpeta enlazada. */
  holderOf(project: ProjectSummary): ProjectLockInfo | null {
    if (project.lock.state === 'other') {
      return project.lock;
    }
    const status = this.sync.statusOf(project.ref);
    return status.state === 'other' && status.holder ? status.holder : null;
  }

  syncMeta(project: ProjectSummary): string {
    const status = this.sync.statusOf(project.ref);
    switch (status.state) {
      case 'pend':
        return this.t('projects.sync.meta.pend');
      case 'pull':
        return this.t('projects.sync.meta.pull', {
          rev: status.remoteRev ?? 0,
          by: status.by ?? '',
        });
      case 'sync':
        return status.lastSync
          ? this.t('projects.sync.meta.synced', {
              rev: status.rev ?? 0,
              when: this.when(status.lastSync),
            })
          : '';
      default:
        return '';
    }
  }

  syncFromMenu(project: ProjectSummary): void {
    this.closeMenu();
    void this.sync.syncProject(project.ref, project.name);
  }

  pauseFromMenu(project: ProjectSummary, paused: boolean): void {
    this.closeMenu();
    void this.sync.setPaused(project.ref, paused);
  }

  stopFromMenu(project: ProjectSummary): void {
    this.closeMenu();
    this.sync.askStop(project);
  }

  syncNow(): void {
    void this.sync.syncAll('sync');
  }

  askTakeover(project: ProjectSummary): void {
    this.dialog.set({ kind: 'takeover', project });
  }

  askForget(project: ProjectSummary): void {
    this.dialog.set({ kind: 'forget', project });
  }

  async forget(project: ProjectSummary): Promise<void> {
    this.busy.set(project.ref);
    const ok = await this.store.forget(project.ref);
    this.busy.set(null);
    this.dialog.set(null);
    this.toast.show(
      this.t(ok ? 'projects.forgotten' : 'projects.error.io', { name: project.name }),
      ok ? 'info' : 'error',
    );
  }

  /** The batch in browser storage has no project: save it as «Sin título» (explicit, nothing is written silently). */
  async adopt(): Promise<void> {
    this.busy.set('adopt');
    const result = await this.store.saveBatchAsProject(
      this.t('projects.untitled'),
      this.batch.items(),
    );
    this.busy.set(null);
    if (typeof result === 'string') {
      this.toast.error(this.t(`projects.error.${result}`));
      return;
    }
    this.toast.show(this.t('projects.created', { name: result.name }), 'success');
    await this.store.close();
    // The batch now lives in the project folder: drop the browser copy so it is not offered again.
    await this.batch.clear();
    await this.store.refresh();
  }

  async chooseRoot(): Promise<void> {
    await this.store.chooseRoot();
  }

  // ---- ⋯ menu, export and import (phase 2)

  toggleMenu(ref: string, event: Event): void {
    event.stopPropagation();
    this.menuFor.update((current) => (current === ref ? null : ref));
  }

  closeMenu(): void {
    this.menuFor.set(null);
  }

  exportProject(project: ProjectSummary): void {
    this.closeMenu();
    void this.transfer.startExport(project);
  }

  forgetFromMenu(project: ProjectSummary): void {
    this.closeMenu();
    this.askForget(project);
  }

  openFromMenu(project: ProjectSummary): void {
    this.closeMenu();
    void this.open(project);
  }

  openImported(): void {
    const notice = this.transfer.notice();
    if (notice?.kind === 'imported') {
      this.transfer.dismissNotice();
      void this.open(notice.project);
    }
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) {
      return;
    }
    // Without this the window would navigate to the dropped file.
    event.preventDefault();
    if (!this.transfer.busy()) {
      this.transfer.dragging.set(true);
    }
  }

  onDragLeave(event: DragEvent): void {
    if (event.relatedTarget === null) {
      this.transfer.dragging.set(false);
    }
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.transfer.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && this.store.available() && !this.transfer.dialog()) {
      void this.transfer.dropFile(file);
    }
  }

  exportSize(d: Extract<TransferDialog, { kind: 'export' }>): string {
    return formatBytes(exportEstimate(d.info, this.transfer.includeB()));
  }

  bytes(value: number): string {
    return formatBytes(value);
  }

  get maxPdfMb(): number {
    return Math.round(this.store.limits().maxPdfBytes / (1024 * 1024));
  }

  importErrorTitleKey(code: string): string {
    switch (code) {
      case 'corrupt':
        return 'projects.transfer.err.corruptTitle';
      case 'unsafe':
        return 'projects.transfer.err.unsafeTitle';
      case 'newer-format':
        return 'projects.transfer.err.newerTitle';
      case 'too-big':
      case 'too-many-pdfs':
        return 'projects.transfer.err.tooBigTitle';
      case 'disk-full':
        return 'projects.transfer.err.diskFullTitle';
      default:
        return 'projects.transfer.err.notArchiveTitle';
    }
  }

  importErrorText(d: Extract<TransferDialog, { kind: 'import-error' }>): string {
    const detail = d.detail;
    const text = typeof detail === 'string' ? detail : '';
    switch (d.code) {
      case 'not-an-archive':
        return this.t('projects.transfer.err.notArchiveText', { name: text || d.fileName || '' });
      case 'corrupt':
        return text
          ? this.t('projects.transfer.err.corruptText', { file: text })
          : this.t('projects.transfer.err.corruptGeneric');
      case 'unsafe':
        return this.t('projects.transfer.err.unsafeText', { file: text });
      case 'newer-format':
        return this.t('projects.transfer.err.newerText', { format: text, supported: 1 });
      case 'too-big':
      case 'too-many-pdfs': {
        const info = (detail ?? {}) as { pdfs?: number; bytes?: number };
        const limits = this.store.limits();
        return this.t('projects.transfer.err.tooBigText', {
          pdfs: info.pdfs ?? 0,
          size: formatBytes(info.bytes ?? 0),
          maxPdfs: limits.maxPdfs,
          maxSize: formatBytes(limits.maxBytes),
        });
      }
      case 'disk-full':
        return this.t('projects.transfer.err.diskFullText');
      default:
        return this.t(`projects.error.${d.code}`);
    }
  }

  checkUpdates(): void {
    this.transfer.closeDialog();
    void getDesktopBridge()?.checkForUpdates();
  }

  oversizeNames(rows: { name: string }[]): string {
    return rows
      .slice(0, 3)
      .map((row) => `«${row.name}»`)
      .join(', ');
  }

  whichLabel(which: 'a' | 'b'): string {
    return this.t(which === 'a' ? 'projects.transfer.whichA' : 'projects.transfer.whichB');
  }

  exportedAt(ms: number): string {
    return ms ? this.when(ms) : '—';
  }
}
