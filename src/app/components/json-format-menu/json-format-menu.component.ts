import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { JsonCopyFormatService } from '../../services/json-copy-format.service';
import { ToastService } from '../../services/toast.service';
import { TranslationService } from '../../i18n/translation.service';
import {
  CopyIndent,
  CopyKeys,
  CopyQuote,
  JSON_COPY_STRICT,
  JsonCopyFormat,
  formatJsonForCopy,
  isStrictJsonFormat,
} from '../../utils/json-copy-format.utils';

const SAMPLE = JSON.stringify({
  pages: [{ num: 1, fields: [{ x: 72, y: 710, mapField: 'nombre', type: 'text' }] }],
});

/**
 * «Personalizar» (P-175 a P-177): botón que abre un modal con el «Formato de los JSON». Es el mismo formato
 * en el editor, «Copiar JSON», «Descargar JSON» y la descarga del lote (servicio compartido). Los cambios
 * se preparan en el modal y solo se guardan con «Aplicar».
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-json-format-menu',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <button
      type="button"
      class="btn btn--ghost jfm__chev"
      [disabled]="disabled()"
      [attr.aria-haspopup]="'dialog'"
      [attr.title]="(titleKey() === 'batch.format.title' ? 'batch.format.open' : titleKey()) | t"
      [attr.aria-label]="
        (titleKey() === 'batch.format.title' ? 'batch.format.open' : titleKey()) | t
      "
      (click)="openModal()"
      data-testid="json-format-open"
    >
      @if (labelKey()) {
        {{ labelKey() | t }}
      } @else {
        ▾
      }
    </button>
    <dialog
      #dlg
      class="jfm__dlg"
      [attr.aria-labelledby]="uid + '-title'"
      (cancel)="onCancel($event)"
      (click)="onDialogClick($event)"
      (close)="open.set(false)"
      data-testid="json-format-pop"
    >
      @if (open()) {
        <form class="jfm__box" method="dialog" (submit)="apply($event)">
          <div class="jfm__head">
            <h2 class="jfm__title" [id]="uid + '-title'">{{ titleKey() | t }}</h2>
            <button
              type="button"
              class="jfm__x"
              [attr.aria-label]="'batch.format.close' | t"
              (click)="close()"
              data-testid="json-format-close"
            >
              ✕
            </button>
          </div>
          <p class="jfm__hint">{{ 'batch.format.hint' | t }}</p>
          <div class="jfm__row">
            <span class="jfm__label">{{ 'sidebar.copyFormat.keys' | t }}</span>
            <div class="jfm__seg" role="group" [attr.aria-label]="'sidebar.copyFormat.keys' | t">
              <button
                type="button"
                [attr.aria-pressed]="fmt().keys === 'quoted'"
                (click)="patch({ keys: 'quoted' })"
                data-testid="json-format-keys-quoted"
              >
                {{ 'sidebar.copyFormat.keysQuoted' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().keys === 'bare'"
                (click)="patch({ keys: 'bare' })"
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
                (click)="patch({ quote: 'double' })"
              >
                {{ 'sidebar.copyFormat.quoteDouble' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().quote === 'single'"
                (click)="patch({ quote: 'single' })"
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
                (click)="patch({ indent: '2' })"
              >
                2
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === '4'"
                (click)="patch({ indent: '4' })"
              >
                4
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === 'tab'"
                (click)="patch({ indent: 'tab' })"
              >
                {{ 'sidebar.copyFormat.indentTab' | t }}
              </button>
              <button
                type="button"
                [attr.aria-pressed]="fmt().indent === '0'"
                (click)="patch({ indent: '0' })"
              >
                {{ 'sidebar.copyFormat.indentCompact' | t }}
              </button>
            </div>
          </div>
          <label class="jfm__check">
            <input
              type="checkbox"
              [checked]="fmt().trailingComma"
              (change)="patch({ trailingComma: $any($event.target).checked })"
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
            <button
              type="button"
              class="btn btn--ghost"
              (click)="reset()"
              data-testid="json-format-reset"
            >
              {{ 'batch.format.reset' | t }}
            </button>
          </div>
          <div class="jfm__actions">
            <button
              type="button"
              class="btn btn--ghost"
              (click)="close()"
              data-testid="json-format-cancel"
            >
              {{ 'batch.format.cancel' | t }}
            </button>
            <button type="submit" class="btn btn--primary" data-testid="json-format-apply">
              {{ 'batch.format.apply' | t }}
            </button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .jfm__chev {
      padding-inline: 12px;
    }
    .jfm__dlg {
      padding: 0;
      width: min(520px, calc(100vw - 32px));
      max-height: calc(100vh - 32px);
      overflow: auto;
      text-align: left;
      background: var(--panel);
      color: var(--text);
      border: 1px solid var(--input-border, rgba(128, 128, 128, 0.35));
      border-radius: 20px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    }
    .jfm__dlg::backdrop {
      background: rgba(0, 0, 0, 0.55);
    }
    .jfm__box {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 24px;
    }
    .jfm__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .jfm__title {
      margin: 0;
      font-size: 19px;
    }
    .jfm__x {
      font: inherit;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      border: 1px solid var(--input-border, rgba(128, 128, 128, 0.35));
      background: transparent;
      color: var(--text);
      cursor: pointer;
    }
    .jfm__x:focus-visible,
    .jfm__seg button:focus-visible,
    .jfm__check input:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }
    .jfm__hint {
      margin: 0;
      color: var(--muted);
      font-size: 13px;
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
      max-height: 170px;
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
    .jfm__actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 16px;
      border-top: 1px solid var(--input-border, rgba(128, 128, 128, 0.35));
    }
  `,
})
export class JsonFormatMenuComponent {
  private static nextId = 0;
  private readonly formats = inject(JsonCopyFormatService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  readonly uid = `jfm-${JsonFormatMenuComponent.nextId++}`;
  readonly disabled = input(false);
  /** Texto del botón (clave i18n); sin él solo lleva la flecha. */
  readonly labelKey = input('');
  readonly titleKey = input('batch.format.title');
  readonly open = signal(false);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  /** Borrador del modal: no cambia nada hasta pulsar «Aplicar». */
  readonly fmt = signal<JsonCopyFormat>({ ...JSON_COPY_STRICT });
  readonly strict = computed(() => isStrictJsonFormat(this.fmt()));
  readonly preview = computed(() => formatJsonForCopy(SAMPLE, this.fmt()) ?? '');

  openModal(): void {
    this.fmt.set({ ...this.formats.format() });
    this.open.set(true);
    const dialog = this.dlg().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  close(): void {
    const dialog = this.dlg().nativeElement;
    if (dialog.open) dialog.close();
    this.open.set(false);
  }

  /** Esc cierra el modal sin guardar. */
  onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** Un clic en el fondo atenuado (fuera de la caja) cierra el modal. */
  onDialogClick(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.close();
  }

  patch(change: Partial<JsonCopyFormat>): void {
    this.fmt.update((current) => ({ ...current, ...change }));
  }

  reset(): void {
    this.fmt.set({ ...JSON_COPY_STRICT });
  }

  apply(event: Event): void {
    event.preventDefault();
    const chosen = this.fmt();
    this.formats.set(chosen);
    this.close();
    if (!isStrictJsonFormat(chosen))
      this.toast.show(this.i18n.translate('toast.jsonFormatApplied'), 'info');
  }
}
