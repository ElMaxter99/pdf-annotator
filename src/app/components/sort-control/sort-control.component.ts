import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { flipDir, type SortDir } from '../../utils/batch-sort.utils';

/** «Ordenar» (P-178 a P-180): criterio + flecha de sentido. Lo usan el panel del lote, «Actualizar plantillas» y el paso 2. */
@Component({
  selector: 'app-sort-control',
  standalone: true,
  imports: [TranslationPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="sort-control__label">
      <span>{{ 'batch.sort.label' | t }}</span>
      <select [value]="sortKey()" (change)="keyChange.emit($any($event.target).value)" [attr.data-testid]="testId()">
        @for (option of options(); track option) {
          <option [value]="option" [selected]="sortKey() === option">{{ 'batch.sort.' + option | t }}</option>
        }
      </select>
    </label>
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
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .sort-control__label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 0.85rem;
      }
      select {
        font: inherit;
        color: var(--text);
        background: var(--panel);
        border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
        border-radius: 999px;
        padding: 6px 12px;
        min-height: 34px;
      }
      .sort-control__dir {
        font: inherit;
        width: 34px;
        height: 34px;
        border-radius: 999px;
        color: var(--text);
        background: transparent;
        border: 1px solid color-mix(in srgb, var(--text) 20%, transparent);
        cursor: pointer;
      }
      .sort-control__dir:hover:not(:disabled) {
        border-color: var(--accent);
      }
      .sort-control__dir:disabled {
        opacity: 0.45;
        cursor: default;
      }
      select:focus-visible,
      .sort-control__dir:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
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
}
