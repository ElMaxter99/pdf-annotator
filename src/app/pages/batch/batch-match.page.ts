import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ModeSwitchComponent } from '../../components/mode-switch/mode-switch.component';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { AppMetadataService } from '../../services/app-metadata.service';
import { BatchItem, BatchStoreService, BatchTemplate, MatchState } from '../../services/batch-store.service';
import { ToastService } from '../../services/toast.service';
import { FILE_KEY, availableKeyFields, nameSimilarity } from '../../utils/template-matching.utils';
import { BatchStepsComponent } from './components/batch-steps.component';

type MatchFilter = 'all' | 'ready' | 'choose' | 'none' | 'error';
const FILTERS: readonly MatchFilter[] = ['all', 'ready', 'choose', 'none', 'error'];

interface Row {
  readonly item: BatchItem;
  readonly state: MatchState;
  readonly template: BatchTemplate | undefined;
}

/** Step 2: every PDF with the template it was paired with, and what still needs a decision. */
@Component({
  selector: 'app-batch-match-page',
  standalone: true,
  imports: [RouterLink, TranslationPipe, BatchStepsComponent, ModeSwitchComponent],
  templateUrl: './batch-match.page.html',
  styleUrls: ['./batch.page.scss', './batch-flow.scss'],
})
export class BatchMatchPageComponent implements OnInit {
  readonly store = inject(BatchStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly metadata = inject(AppMetadataService);

  readonly filters = FILTERS;
  readonly filter = signal<MatchFilter>('all');
  readonly dropTarget = signal<string | null>(null);

  readonly dialogItemId = signal<string | null>(null);
  readonly query = signal('');
  readonly chosenId = signal<string | null>(null);

  readonly rows = computed<Row[]>(() => {
    const states = this.store.matchStates();
    const templates = new Map(this.store.templates().map((t) => [t.id, t]));
    return this.store.items().map((item) => {
      const state = states.get(item.id) ?? { kind: 'none' as const, candidates: [] };
      return { item, state, template: state.templateId ? templates.get(state.templateId) : undefined };
    });
  });

  readonly counts = computed(() => {
    const counts = { exact: 0, similar: 0, manual: 0, paste: 0, choose: 0, none: 0, error: 0 };
    for (const row of this.rows()) counts[row.state.kind] += 1;
    return { ...counts, ready: counts.exact + counts.similar + counts.manual + counts.paste };
  });

  readonly visible = computed(() => {
    const filter = this.filter();
    return this.rows().filter((row) => {
      switch (filter) {
        case 'ready': return ['exact', 'similar', 'manual', 'paste'].includes(row.state.kind);
        case 'all': return true;
        default: return row.state.kind === filter;
      }
    });
  });

  readonly filterCount = (filter: MatchFilter) =>
    filter === 'all' ? this.rows().length : this.counts()[filter];

  readonly keyOptions = computed(() => {
    const options = availableKeyFields(this.store.templates());
    const current = this.store.keyField();
    return options.some((o) => o.field === current) || !this.store.templates().length
      ? options
      : [...options, { field: current, count: 0 }];
  });
  readonly keyCoverage = computed(
    () => this.store.templates().filter((t) => !!t.keys[this.store.keyField()]?.trim()).length
  );

  /** Dialog data */
  readonly dialogRow = computed(() => this.rows().find((row) => row.item.id === this.dialogItemId()));
  readonly dialogList = computed(() => {
    const row = this.dialogRow();
    if (!row) return [];
    const query = this.query().trim().toLowerCase();
    const used = new Set(this.store.items().filter((i) => i.id !== row.item.id).map((i) => i.templateId));
    return this.store
      .templates()
      .map((template) => {
        const label = this.store.templateLabelOf(template);
        return { template, label, score: nameSimilarity(row.item.name, label), inUse: used.has(template.id) };
      })
      .filter((entry) => !query || entry.label.toLowerCase().includes(query))
      .sort((a, b) => b.score - a.score);
  });
  readonly dialogChosen = computed(() => this.store.templates().find((t) => t.id === this.chosenId()));

  constructor() {
    this.metadata.applyDefaultMetadata();
  }

  ngOnInit() {
    if (typeof window === 'undefined') return;
    void this.store.load();
  }

  labelOf = (template: BatchTemplate | undefined) => (template ? this.store.templateLabelOf(template) : '');
  fieldLabel(field: string): string {
    return field === FILE_KEY ? this.i18n.translate('batch.match.side.fileName') : field;
  }

  actionKey(kind: MatchState['kind']): string {
    switch (kind) {
      case 'choose': return 'choose';
      case 'none': return 'assign';
      case 'error': return 'fix';
      default: return 'change';
    }
  }

  act(row: Row) {
    if (row.state.kind === 'error') {
      void this.router.navigate(['/batch', row.item.id]);
      return;
    }
    this.openDialog(row);
  }

  onKeyField(event: Event) {
    this.store.setKeyField((event.target as HTMLSelectElement).value);
  }

  continue() {
    void this.router.navigate(['/batch']);
  }

  // ---- drag a template onto a PDF -------------------------------------------------------------------

  onTemplateDragStart(event: DragEvent, id: string) {
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  onRowDragOver(event: DragEvent, itemId: string) {
    event.preventDefault();
    this.dropTarget.set(itemId);
  }

  onRowDrop(event: DragEvent, row: Row) {
    event.preventDefault();
    this.dropTarget.set(null);
    const id = event.dataTransfer?.getData('text/plain');
    if (id && this.store.templates().some((t) => t.id === id)) this.assign(row.item, id);
  }

  // ---- manual assignment dialog (R-07) ---------------------------------------------------------------

  openDialog(row: Row) {
    this.query.set('');
    this.dialogItemId.set(row.item.id);
    const first = row.state.templateId ?? row.state.candidates[0];
    this.chosenId.set(first ?? null);
    if (!first) {
      const best = this.dialogList().find((entry) => !entry.inUse && entry.score >= 40);
      this.chosenId.set(best ? best.template.id : null);
    }
  }

  closeDialog() {
    this.dialogItemId.set(null);
  }

  onQuery(event: Event) {
    this.query.set((event.target as HTMLInputElement).value);
  }

  confirmDialog() {
    const row = this.dialogRow();
    const id = this.chosenId();
    if (row && id) this.assign(row.item, id);
    this.closeDialog();
  }

  releaseDialog() {
    const row = this.dialogRow();
    if (row) this.store.assignTemplate(row.item.id, null);
    this.closeDialog();
  }

  pasteInstead() {
    const row = this.dialogRow();
    if (row) void this.router.navigate(['/batch', row.item.id]);
  }

  private assign(item: BatchItem, templateId: string) {
    this.store.assignTemplate(item.id, templateId);
    const template = this.store.templates().find((t) => t.id === templateId);
    this.toast.show(
      this.i18n.translate('batch.match.assign.doneText', { name: item.name, count: template?.fieldCount ?? 0 }),
      'success'
    );
  }
}
