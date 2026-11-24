import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { flipDir, type SortDir } from '../../utils/batch-sort.utils';

/** «Ordenar» (P-178 a P-180): criterio + flecha de sentido. Lo usan el panel del lote, «Actualizar plantillas» y el paso 2. */
@Component({
  selector: 'app-sort-control',
  standalone: true,
  imports: [TranslationPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="sort-control__btn"
      aria-haspopup="menu"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
      [attr.data-testid]="testId()"
      [attr.data-value]="sortKey()"
    >
      <span class="sort-control__lab">{{ 'batch.sort.label' | t }}:</span>
      {{ 'batch.sort.' + sortKey() | t }}
      <span aria-hidden="true">▾</span>
    </button>
    <button
      type="button"
      class="sort-control__dir"
      [disabled]="!directional()"
      [attr.aria-label]="'batch.sort.' + (dir() === 'asc' ? 'dirAsc' : 'dirDesc') | t"
      [attr.title]="'batch.sort.' + (dir() === 'asc' ? 'dirAsc' : 'dirDesc') | t"
      (click)="dirChange.emit(flip(dir()))"
      [attr.data-testid]="testId() + '-dir'"
    >
      <span aria-hidden="true">{{ dir() === 'asc' ? '↑' : '↓' }}</span>
    </button>
    @if (open()) {
      <div class="sort-control__menu" role="menu" [attr.aria-label]="'batch.sort.label' | t" (keydown)="onMenuKey($event)">
        @for (option of options(); track option) {
          <button
            type="button"
            role="menuitemradio"
            class="sort-control__item"
            [class.sort-control__item--on]="sortKey() === option"
            [attr.aria-checked]="sortKey() === option"
            [attr.data-testid]="testId() + '-' + option"
            (click)="pick(option)"
          >
            <span>{{ 'batch.sort.' + option | t }}</span>
            @if (sortKey() === option) {
              <span aria-hidden="true">✓{{ directional() ? (dir() === 'asc' ? ' ↑' : ' ↓') : '' }}</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .sort-control__btn,
      .sort-control__dir {
        font: inherit;
        font-size: 0.85rem;
        color: var(--text);
        background: var(--panel);
        border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
        border-radius: 999px;
        min-height: 34px;
        cursor: pointer;
      }
      .sort-control__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
      }
      .sort-control__lab {
        color: var(--muted);
      }
      .sort-control__dir {
        width: 34px;
        padding: 0;
      }
      .sort-control__btn:hover,
      .sort-control__dir:hover:not(:disabled) {
        border-color: var(--accent);
      }
      .sort-control__dir:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .sort-control__btn:focus-visible,
      .sort-control__dir:focus-visible,
      .sort-control__item:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .sort-control__menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: 30;
        min-width: 240px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px;
        background: var(--panel);
        border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
      }
      .sort-control__item {
        font: inherit;
        font-size: 0.9rem;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 10px;
        border: 0;
        border-radius: 8px;
        color: var(--text);
        background: transparent;
        cursor: pointer;
        text-align: left;
      }
      .sort-control__item:hover,
      .sort-control__item--on {
        background: color-mix(in srgb, var(--accent) 16%, transparent);
      }
    `,
  ],
})
export class SortControlComponent {
  readonly options = input.required<readonly string[]>();
  readonly sortKey = input.required<string>();
  readonly dir = input.required<SortDir>();
  /** `false` for «Estado»: it has no direction. */
  readonly directional = input(true);
  readonly testId = input('sort-select');
  readonly keyChange = output<string>();
  readonly dirChange = output<SortDir>();
  readonly flip = flipDir;
  readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @HostListener('document:mousedown', ['$event'])
  closeOnOutside(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  toggle(): void {
    this.open.update((value) => !value);
    if (this.open()) {
      setTimeout(() => this.items()[Math.max(0, this.options().indexOf(this.sortKey()))]?.focus());
    }
  }

  pick(option: string): void {
    if (option === this.sortKey() && this.directional()) {
      this.dirChange.emit(flipDir(this.dir()));
    } else {
      this.keyChange.emit(option);
    }
    this.close();
  }

  onTriggerKey(event: KeyboardEvent): void {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !this.open()) {
      event.preventDefault();
      this.toggle();
    }
  }

  onMenuKey(event: KeyboardEvent): void {
    const items = this.items();
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      this.open.set(false);
    }
  }

  private close(): void {
    this.open.set(false);
    (this.host.nativeElement.querySelector('.sort-control__btn') as HTMLElement | null)?.focus();
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('.sort-control__item'));
  }
}
