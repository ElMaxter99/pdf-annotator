import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { AiHelperService, type AiModel, type AiProvider } from '../../services/ai-helper.service';
import { highlight, matchesQuery, type TextSegment } from '../../utils/model-search.utils';

type Row =
  | { kind: 'group'; label: string }
  | {
      kind: 'option';
      id: string;
      name: string;
      description: string;
      auto: boolean;
      group: string;
      nameSegs: TextSegment[];
      descSegs: TextSegment[];
    };

/** Model picker fed with the list the CLI itself offers (its /model): nothing is typed by hand. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-model-select',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './ai-model-select.component.html',
  styleUrl: './ai-model-select.component.scss',
})
export class AiModelSelectComponent {
  readonly helper = inject(AiHelperService);
  private readonly i18n = inject(TranslationService);

  readonly provider = input.required<AiProvider>();
  /** Prefix of the `data-testid`s. */
  readonly testId = input('ai-model');
  readonly labelledBy = input<string | null>(null);

  readonly open = signal(false);
  @ViewChild('toggle') toggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('listbox') listbox?: ElementRef<HTMLElement>;
  @ViewChild('search') search?: ElementRef<HTMLInputElement>;
  readonly query = signal('');

  constructor() {
    effect(() => {
      const provider = this.provider();
      untracked(() => void this.helper.loadModels(provider));
    });
  }

  readonly list = computed(() => this.helper.modelList(this.provider()));
  readonly selected = computed(() => this.helper.models()[this.provider()] ?? '');
  readonly isCopilot = computed(() => this.provider() === 'copilot');
  readonly providerName = computed(() =>
    this.provider() === 'claude'
      ? 'Claude Code'
      : this.provider() === 'copilot'
        ? 'Copilot CLI'
        : 'IA',
  );
  readonly loginCommand = computed(() =>
    this.provider() === 'claude' ? 'claude' : 'copilot login',
  );
  /** Skeleton only while there is nothing to show yet. */
  readonly skeleton = computed(() => this.list().loading && this.list().models.length === 0);
  readonly showError = computed(() => !!this.list().error && this.list().error !== 'offline');
  readonly empty = computed(
    () =>
      !this.list().loading &&
      !this.list().error &&
      this.list().at !== null &&
      this.list().models.length === 0,
  );

  readonly current = computed(() => {
    const id = this.selected();
    if (!id) {
      return this.i18n.translate(this.isCopilot() ? 'ai.models.auto' : 'ai.models.cliDefault');
    }
    return this.list().models.find((m) => m.id === id)?.name ?? id;
  });

  private readonly allRows = computed<Row[]>(() => {
    const rows: Row[] = [];
    if (this.isCopilot()) {
      rows.push({
        kind: 'option',
        id: '',
        name: this.i18n.translate('ai.models.auto'),
        description: this.i18n.translate('ai.models.autoHint'),
        auto: true,
        group: '',
        nameSegs: [],
        descSegs: [],
      });
    }
    let group: string | null = null;
    for (const m of this.sorted(this.list().models)) {
      if (m.group && m.group !== group) {
        rows.push({ kind: 'group', label: m.group });
      }
      group = m.group;
      rows.push({
        kind: 'option',
        id: m.id,
        name: m.name,
        description: m.description || (m.name !== m.id ? m.id : ''),
        auto: false,
        group: m.group,
        nameSegs: [],
        descSegs: [],
      });
    }
    return rows;
  });

  /** Rows matching the search; groups with no match are hidden and matches are highlighted. */
  readonly rows = computed<Row[]>(() => {
    const q = this.query().trim();
    const all = this.allRows();
    if (!q) {
      return all.map((r) =>
        r.kind === 'option'
          ? {
              ...r,
              nameSegs: [{ text: r.name, hit: false }],
              descSegs: r.description ? [{ text: r.description, hit: false }] : [],
            }
          : r,
      );
    }
    const rows: Row[] = [];
    let pending: Row | null = null;
    for (const r of all) {
      if (r.kind === 'group') {
        pending = r;
        continue;
      }
      const hay = `${r.name} ${r.id} ${r.description} ${r.group}`;
      if (!matchesQuery(hay, q)) {
        continue;
      }
      if (pending && r.group) {
        rows.push(pending);
      }
      pending = null;
      rows.push({ ...r, nameSegs: highlight(r.name, q), descSegs: highlight(r.description, q) });
    }
    return rows;
  });
  readonly total = computed(() => this.allRows().filter((r) => r.kind === 'option').length);
  readonly shown = computed(() => this.rows().filter((r) => r.kind === 'option').length);

  readonly stamp = computed(() => {
    const at = this.list().at;
    if (at === null) {
      return '';
    }
    return new Date(at).toLocaleString(this.i18n.language(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  readonly retired = computed(() => {
    const r = this.helper.modelRetired();
    return r && r.provider === this.provider()
      ? { model: r.model, fallback: this.current() }
      : null;
  });

  /** Models of the same group together, keeping the CLI's order otherwise. */
  private sorted(models: AiModel[]): AiModel[] {
    const order: string[] = [];
    for (const m of models) {
      if (!order.includes(m.group)) {
        order.push(m.group);
      }
    }
    return [...models].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }

  setQuery(value: string): void {
    this.query.set(value);
  }

  clearQuery(): void {
    this.query.set('');
    this.search?.nativeElement.focus();
  }

  pick(id: string): void {
    this.helper.setModel(this.provider(), id);
    this.helper.modelRetired.set(null);
    this.close();
  }

  refresh(): void {
    void this.helper.loadModels(this.provider(), true);
  }

  toggleOpen(): void {
    this.open.update((o) => !o);
    this.query.set('');
    if (this.open()) {
      setTimeout(() => this.search?.nativeElement.focus());
    }
  }

  close(): void {
    if (this.open()) {
      this.open.set(false);
      this.query.set('');
      queueMicrotask(() => this.toggle?.nativeElement.focus());
    }
  }

  private options(): HTMLElement[] {
    return Array.from(
      this.listbox?.nativeElement.querySelectorAll<HTMLElement>('[role=option]') ?? [],
    );
  }

  onToggleKey(event: KeyboardEvent): void {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.open()) {
      event.preventDefault();
      this.toggleOpen();
    }
  }

  onListKey(event: KeyboardEvent): void {
    const options = this.options();
    const input = this.search?.nativeElement;
    const active = document.activeElement as HTMLElement;
    const i = options.indexOf(active);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (this.query()) {
        this.clearQuery();
      } else {
        this.close();
      }
    } else if (event.key === 'Enter' && active === input) {
      event.preventDefault();
      options[0]?.click();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (event.key === 'ArrowUp' && i <= 0) {
        input?.focus();
        return;
      }
      const next =
        event.key === 'ArrowDown' ? Math.min(i + 1, options.length - 1) : Math.max(i - 1, 0);
      options[next]?.focus();
    } else if ((event.key === 'Home' || event.key === 'End') && active !== input) {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      this.open.set(false);
      this.query.set('');
    }
  }
}
