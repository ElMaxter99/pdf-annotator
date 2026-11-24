import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { JsonCopyFormatService } from '../../services/json-copy-format.service';
import {
  CopyIndent,
  CopyKeys,
  CopyQuote,
  formatJsonForCopy,
  isStrictJsonFormat,
} from '../../utils/json-copy-format.utils';

const SAMPLE = JSON.stringify({
  pages: [{ num: 1, fields: [{ x: 72, y: 710, mapField: 'nombre', type: 'text' }] }],
});

/**
 * ▾ junto a «Descargar JSON» del lote (P-160 a P-162): abre «Formato de los JSON». Es el mismo formato que
 * «Copiar JSON» del editor (servicio compartido); se aplica solo al descargar.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-json-format-menu',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <span class="jfm" (keydown.escape)="open.set(false)">
      <button
        type="button"
        class="btn btn--ghost jfm__chev"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'batch.format.open' | t"
        [attr.title]="'batch.format.open' | t"
        (click)="open.update((v) => !v)"
        data-testid="json-format-open"
      >
        ▾
      </button>
      @if (open()) {
        <div
          class="jfm__pop"
          role="dialog"
          [attr.aria-label]="'batch.format.title' | t"
          data-testid="json-format-pop"
        >
          <b class="jfm__title">{{ 'batch.format.title' | t }}</b>
          <div class="jfm__row">
            <span class="jfm__label">{{ 'sidebar.copyFormat.keys' | t }}</span>
            <div class="jfm__seg" role="group" [attr.aria-label]="'sidebar.copyFormat.keys' | t">
              <button
                type="button"
                [attr.aria-pressed]="fmt().keys === 'quoted'"
                (click)="setKeys('quoted')"
                data-testid="json-format-keys-quoted"
              >
                {{ 'sidebar.copyFormat.keysQuoted' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().keys === 'bare'"
                (click)="setKeys('bare')"
                data-testid="json-format-keys-bare"
              >
                {{ 'sidebar.copyFormat.keysBare' | t }}
              </button>
            </div>
          </div>
          <div class="jfm__row">
            <span class="jfm__label">{{ 'sidebar.copyFormat.quote' | t }}</span>
            <div class="jfm__seg" role="group" [attr.aria-label]="'sidebar.copyFormat.quote' | t">
              <button
                type="button"
                [attr.aria-pressed]="fmt().quote === 'double'"
                (click)="setQuote('double')"
              >
                {{ 'sidebar.copyFormat.quoteDouble' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().quote === 'single'"
                (click)="setQuote('single')"
              >
                {{ 'sidebar.copyFormat.quoteSingle' | t }}
              </button>
            </div>
          </div>
          <div class="jfm__row">
            <span class="jfm__label">{{ 'sidebar.copyFormat.indent' | t }}</span>
            <div class="jfm__seg" role="group" [attr.aria-label]="'sidebar.copyFormat.indent' | t">
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === '2'"
                (click)="setIndent('2')"
              >
                2
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === '4'"
                (click)="setIndent('4')"
              >
                4
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === 'tab'"
                (click)="setIndent('tab')"
              >
                {{ 'sidebar.copyFormat.indentTab' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === '0'"
                (click)="setIndent('0')"
              >
                {{ 'sidebar.copyFormat.indentCompact' | t }}
              </button>
            </div>
          </div>
          <label class="jfm__check">
            <input
              type="checkbox"
              [checked]="fmt().trailingComma"
              (change)="setComma($any($event.target).checked)"
            />
            <span>{{ 'sidebar.copyFormat.trailingComma' | t }}</span>
          </label>
          <pre class="jfm__preview" data-testid="json-format-preview">{{ preview() }}</pre>
          <div class="jfm__foot">
            <span
              class="jfm__chip"
              [class.jfm__chip--ok]="strict()"
              data-testid="json-format-chip"
              >{{
                (strict() ? 'sidebar.copyFormat.valid' : 'sidebar.copyFormat.notJson') | t
              }}</span
            >
            <span class="jfm__hint">{{ 'batch.format.hint' | t }}</span>
          </div>
        </div>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .jfm {
      position: relative;
      display: inline-flex;
    }
    .jfm__chev {
      padding-inline: 12px;
    }
    .jfm__pop {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 60;
      width: 400px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
      text-align: left;
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--input-border, rgba(128, 128, 128, 0.35));
      border-radius: 16px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
      animation: jfm-in 150ms ease-out;
    }
    @keyframes jfm-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .jfm__pop {
        animation: none;
      }
    }
    .jfm__title {
      font-size: 15px;
    }
    .jfm__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .jfm__label {
      color: var(--muted);
      font-size: 13px;
    }
    .jfm__seg {
      display: inline-flex;
      padding: 3px;
      border-radius: 999px;
      background: var(--input-bg, rgba(128, 128, 128, 0.15));
    }
    .jfm__seg button {
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      border: 0;
      background: transparent;
      color: var(--muted);
      border-radius: 999px;
      padding: 6px 12px;
      cursor: pointer;
    }
    .jfm__seg button[aria-pressed='true'] {
      background: var(--accent-fill, var(--accent));
      color: var(--on-accent, #fff);
    }
    .jfm__seg button:focus-visible,
    .jfm__check input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .jfm__check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }
    .jfm__preview {
      margin: 0;
      padding: 10px 12px;
      border-radius: 10px;
      font-family: Consolas, monospace;
      font-size: 12px;
      line-height: 1.5;
      background: var(--input-bg, rgba(128, 128, 128, 0.15));
      overflow: auto;
      max-height: 150px;
    }
    .jfm__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .jfm__chip {
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      color: var(--warning-text, var(--muted));
      background: rgba(128, 128, 128, 0.18);
    }
    .jfm__chip--ok {
      color: var(--accent-text, var(--accent));
    }
    .jfm__hint {
      color: var(--muted);
      font-size: 12px;
      text-align: right;
    }
  `,
})
export class JsonFormatMenuComponent {
  private readonly formats = inject(JsonCopyFormatService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly open = signal(false);
  readonly fmt = this.formats.format;
  readonly strict = computed(() => isStrictJsonFormat(this.fmt()));
  readonly preview = computed(() => formatJsonForCopy(SAMPLE, this.fmt()) ?? '');

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node))
      this.open.set(false);
  }

  setKeys(keys: CopyKeys): void {
    this.formats.set({ keys });
  }
  setQuote(quote: CopyQuote): void {
    this.formats.set({ quote });
  }
  setIndent(indent: CopyIndent): void {
    this.formats.set({ indent });
  }
  setComma(trailingComma: boolean): void {
    this.formats.set({ trailingComma });
  }
}
