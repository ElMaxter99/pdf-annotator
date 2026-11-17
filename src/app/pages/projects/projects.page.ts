import {
  ChangeDetectionStrategy,
  Component,
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
import { ProjectStoreService } from '../../services/project-store.service';
import { ToastService } from '../../services/toast.service';
import { formatBytes, projectSize } from '../../utils/project.utils';

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
  imports: [RouterLink, TranslationPipe, VersionChipComponent],
  templateUrl: './projects.page.html',
  styleUrls: ['./projects.page.scss'],
})
export class ProjectsPageComponent implements OnInit {
  readonly store = inject(ProjectStoreService);
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
    }
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
    await this.store.refresh();
  }

  async chooseRoot(): Promise<void> {
    await this.store.chooseRoot();
  }
}
