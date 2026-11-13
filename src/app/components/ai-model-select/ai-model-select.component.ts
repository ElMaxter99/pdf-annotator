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
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { AiHelperService, type AiModel, type AiProvider } from '../../services/ai-helper.service';

type Row =
  | { kind: 'group'; label: string }
  | { kind: 'option'; id: string; name: string; description: string; auto: boolean };

/** Model picker fed with the list the CLI itself offers (its /model): nothing is typed by hand. */
@Component({
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

  readonly rows = computed<Row[]>(() => {
    const rows: Row[] = [];
    if (this.isCopilot()) {
      rows.push({
        kind: 'option',
        id: '',
        name: this.i18n.translate('ai.models.auto'),
        description: this.i18n.translate('ai.models.autoHint'),
        auto: true,
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
      });
    }
    return rows;
  });

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
    if (this.open()) {
      queueMicrotask(
        () =>
          this.options()
            .find((b) => b.getAttribute('aria-selected') === 'true')
            ?.focus() ?? this.options()[0]?.focus(),
      );
    }
  }

  close(): void {
    if (this.open()) {
      this.open.set(false);
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
    const i = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next =
        event.key === 'ArrowDown' ? Math.min(i + 1, options.length - 1) : Math.max(i - 1, 0);
      options[next]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      options[event.key === 'Home' ? 0 : options.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      this.open.set(false);
    }
  }
}
