import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { highlight, matchesQuery, type TextSegment } from '../../utils/model-search.utils';
import { naturalCompare, suggestOptions, type SearchOption } from '../../utils/search-select.utils';

interface Row {
  id: string;
  index: number;
  segs: TextSegment[];
}
interface Section {
  title: 'suggested' | 'all' | null;
  rows: Row[];
}

let nextId = 0;

/** Picker with a search box for long lists (dozens of PDFs): filter while typing, keyboard first. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-search-select',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './search-select.component.html',
  styleUrl: './search-select.component.scss',
})
export class SearchSelectComponent implements OnDestroy {
  readonly options = input.required<SearchOption[]>();
  /** Name of the file being assigned: options with a similar name come first, as suggestions. */
  readonly suggestFor = input('');
  /** Text of the closed button. */
  readonly placeholder = input.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly searchLabel = input.required<string>();
  /** Shown (and the button disabled) when there is nothing left to choose. */
  readonly emptyText = input('');
  readonly testId = input('search-select');
  readonly picked = output<string>();

  readonly uid = `ss-${nextId++}`;
  readonly open = signal(false);
  readonly query = signal('');
  readonly active = signal(0);
  /** Fixed position of the popup, so no scrolling ancestor clips it. */
  readonly pos = signal<{ top: number | null; bottom: number | null; right: number }>({
    top: 0,
    bottom: null,
    right: 0,
  });
  private readonly reposition = (event?: Event): void => {
    const target = event?.target as Node | undefined;
    if (target && this.listbox?.nativeElement.contains(target)) {
      return;
    }
    this.place();
  };
  @ViewChild('toggle') toggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('search') search?: ElementRef<HTMLInputElement>;
  @ViewChild('listbox') listbox?: ElementRef<HTMLElement>;

  readonly total = computed(() => this.options().length);

  readonly sections = computed<Section[]>(() => {
    const q = this.query().trim();
    const sorted = [...this.options()].sort((a, b) => naturalCompare(a.label, b.label));
    let index = 0;
    const make = (list: SearchOption[]): Row[] =>
      list.map((o) => ({ id: o.id, index: index++, segs: highlight(o.label, q) }));
    if (q) {
      const rows = make(sorted.filter((o) => matchesQuery(o.label, q)));
      return rows.length ? [{ title: null, rows }] : [];
    }
    const suggested = suggestOptions(this.suggestFor(), sorted);
    if (!suggested.length) {
      return [{ title: null, rows: make(sorted) }];
    }
    const ids = new Set(suggested.map((o) => o.id));
    return [
      { title: 'suggested', rows: make(suggested) },
      { title: 'all', rows: make(sorted.filter((o) => !ids.has(o.id))) },
    ];
  });
  readonly shown = computed(() => this.sections().reduce((n, s) => n + s.rows.length, 0));
  private readonly flat = computed(() => this.sections().flatMap((s) => s.rows));
  readonly activeId = computed(() =>
    this.open() && this.flat()[this.active()] ? `${this.uid}-o${this.active()}` : null,
  );

  optionId(row: Row): string {
    return `${this.uid}-o${row.index}`;
  }

  toggleOpen(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.query.set('');
    this.active.set(0);
    this.place();
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    this.open.set(true);
    setTimeout(() => this.search?.nativeElement.focus());
  }

  close(restoreFocus = true): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.unlisten();
    this.query.set('');
    if (restoreFocus) {
      queueMicrotask(() => this.toggle?.nativeElement.focus());
    }
  }

  private place(): void {
    const rect = this.toggle?.nativeElement.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const right = Math.max(8, window.innerWidth - rect.right);
    const below = window.innerHeight - rect.bottom;
    // The popup is ~380 px tall at most: open upwards when it does not fit below.
    this.pos.set(
      below < 390 && rect.top > below
        ? { top: null, bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, bottom: null, right },
    );
  }

  private unlisten(): void {
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
  }

  ngOnDestroy(): void {
    this.unlisten();
  }

  setQuery(value: string): void {
    this.query.set(value);
    this.active.set(0);
  }

  clearQuery(): void {
    this.setQuery('');
    this.search?.nativeElement.focus();
  }

  pick(id: string): void {
    this.close(false);
    this.picked.emit(id);
  }

  onToggleKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.toggleOpen();
      }
    }
  }

  onKey(event: KeyboardEvent): void {
    const rows = this.flat();
    const last = rows.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      if (last < 0) {
        return;
      }
      const next = Math.max(0, Math.min(last, to));
      this.active.set(next);
      queueMicrotask(() =>
        document.getElementById(`${this.uid}-o${next}`)?.scrollIntoView({ block: 'nearest' }),
      );
    };
    switch (event.key) {
      case 'ArrowDown':
        move(this.active() + 1);
        break;
      case 'ArrowUp':
        move(this.active() - 1);
        break;
      case 'PageDown':
        move(this.active() + 7);
        break;
      case 'PageUp':
        move(this.active() - 7);
        break;
      case 'Home':
        if (event.ctrlKey) {
          move(0);
        }
        break;
      case 'End':
        if (event.ctrlKey) {
          move(last);
        }
        break;
      case 'Enter': {
        event.preventDefault();
        const row = rows[this.active()];
        if (row) {
          this.pick(row.id);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        if (this.query()) {
          this.clearQuery();
        } else {
          this.close();
        }
        break;
      case 'Tab':
        this.close(false);
        break;
    }
  }

  onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && (event.currentTarget as HTMLElement).contains(next)) {
      return;
    }
    this.close(false);
  }
}
