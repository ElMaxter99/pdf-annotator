import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { StorageRow, StorageService, formatBytes } from '../../services/storage.service';

/**
 * Panel «Almacenamiento» de la app de escritorio (mesas P-125 y P-126): qué guarda la app, dónde y cuánto ocupa,
 * en tres grupos. Solo se vacían las cachés, con confirmación. Sin puente de escritorio (web) no existe.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-storage-panel',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (storage.available && storage.panelOpen()) {
      <div class="update-panel__veil" (click)="storage.close()"></div>
      <div
        #dialog
        class="storage-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="storage-title"
        data-testid="storage-panel"
        (keydown)="onKeydown($event)"
      >
        <div class="storage-panel__head">
          <h2 id="storage-title">{{ 'storage.title' | t }}</h2>
          <button #closeBtn type="button" class="update-card__close" (click)="storage.close()" [attr.aria-label]="'storage.close' | t">✕</button>
        </div>

        <p class="storage-panel__summary" role="status" aria-live="polite" data-testid="storage-summary">
          @if (storage.loadError()) {
            {{ 'storage.loadError' | t }}
            <button type="button" class="btn btn--ghost" (click)="storage.load()" data-testid="storage-retry-load">{{ 'storage.retry' | t }}</button>
          } @else if (storage.measuring()) {
            {{ 'storage.calculating' | t }}
          } @else {
            {{ 'storage.summary' | t: { total: size(storage.total()), work: size(storage.workBytes()) } }}
          }
        </p>

        @if (storage.lastFreed() !== null) {
          <p class="storage-panel__banner storage-panel__banner--ok" role="status" data-testid="storage-freed">
            ✓ {{ 'storage.freed' | t: { size: size(storage.lastFreed() ?? 0) } }}
          </p>
        }
        @if (storage.clearError(); as failed) {
          <p class="storage-panel__banner storage-panel__banner--error" role="alert" data-testid="storage-error">
            {{ 'storage.clearFailed' | t: { name: rowName(failed) } }}
            <button type="button" class="btn btn--ghost" (click)="storage.askClear(failed)">{{ 'storage.retry' | t }}</button>
          </p>
        }

        @for (g of storage.groups(); track g.group) {
          @if (g.rows.length) {
            <section class="storage-group" [attr.data-testid]="'storage-group-' + g.group">
              <h3>{{ 'storage.groups.' + g.group | t }}</h3>
              @for (row of g.rows; track row.id) {
                <div class="storage-row" [attr.data-testid]="'storage-row-' + row.id">
                  <span class="storage-row__name">{{ 'storage.rows.' + row.id | t }}</span>
                  <span class="storage-row__size" [attr.data-testid]="'storage-size-' + row.id" [class.is-muted]="row.state !== 'ready'">{{ sizeText(row) }}</span>
                  <code class="storage-row__path">{{ row.path }}</code>
                  <span class="storage-row__actions">
                    @if (row.canOpen && row.group !== 'clearable') {
                      <button type="button" class="btn btn--small" (click)="storage.reveal(row.id)" [attr.data-testid]="'storage-open-' + row.id">{{ 'storage.openFolder' | t }}</button>
                    }
                    @if (row.group === 'work') {
                      <button type="button" class="btn btn--small" (click)="storage.copyPath(row)" [attr.data-testid]="'storage-copy-' + row.id">{{ 'storage.copyPath' | t }}</button>
                    }
                    @if (row.clearable) {
                      <button
                        type="button"
                        class="btn btn--small btn--danger-outline"
                        [disabled]="row.clearing || row.state === 'calculating' || row.state === 'missing' || (row.state === 'ready' && row.bytes === 0)"
                        (click)="storage.askClear(row.id)"
                        [attr.data-testid]="'storage-clear-' + row.id"
                      >{{ 'storage.clear' | t }}</button>
                    }
                  </span>
                </div>
              }
              @if (g.group === 'clearable' && storage.clearableRows().length) {
                <div>
                  <button type="button" class="btn btn--primary" (click)="storage.askClear('all')" data-testid="storage-clear-all">
                    {{ 'storage.clearAll' | t: { size: size(storage.clearableBytes()) } }}
                  </button>
                </div>
              }
            </section>
          }
        }
        <p class="storage-panel__note">{{ 'storage.note' | t }}</p>

        @if (storage.confirming()) {
          <div class="storage-confirm__veil"></div>
          <div class="storage-confirm" role="alertdialog" aria-modal="true" aria-labelledby="storage-confirm-title" data-testid="storage-confirm" (keydown)="onConfirmKeydown($event)">
            <h3 id="storage-confirm-title">
              @if (storage.confirming() === 'all') { {{ 'storage.confirm.titleAll' | t }} }
              @else { {{ 'storage.confirm.title' | t: { name: rowName(storage.confirming() ?? '') } }} }
            </h3>
            <p>{{ (storage.confirming() === 'all' ? 'storage.confirm.textAll' : 'storage.confirm.text') | t: { size: size(storage.confirmBytes()) } }}</p>
            <div class="storage-confirm__buttons">
              <button #cancelBtn type="button" class="btn" (click)="storage.cancelClear()" data-testid="storage-confirm-cancel">{{ 'storage.confirm.cancel' | t }}</button>
              <button type="button" class="btn btn--primary" (click)="storage.confirmClear()" data-testid="storage-confirm-ok">{{ 'storage.confirm.ok' | t: { size: size(storage.confirmBytes()) } }}</button>
            </div>
          </div>
        }
      </div>
    }
  `,
})
export class StoragePanelComponent {
  readonly storage = inject(StorageService);
  private readonly i18n = inject(TranslationService);
  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('cancelBtn') private cancelBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  private opener: HTMLElement | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.onDocumentEscape, true);
      inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', this.onDocumentEscape, true));
    }
    effect(() => {
      const open = this.storage.panelOpen();
      if (typeof document === 'undefined') return;
      if (open) {
        this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setTimeout(() => this.closeBtn?.nativeElement.focus());
      } else if (this.opener) {
        this.opener.focus?.();
        this.opener = null;
      }
    });
    effect(() => {
      // Foco inicial de la confirmación en «Cancelar» (la acción destructiva no es la predeterminada).
      if (this.storage.confirming()) setTimeout(() => this.cancelBtn?.nativeElement.focus());
    });
  }

  size(bytes: number): string {
    return formatBytes(bytes);
  }

  rowName(id: string): string {
    return this.i18n.translate(`storage.rows.${id}`);
  }

  sizeText(row: StorageRow): string {
    switch (row.state) {
      case 'calculating':
        return this.i18n.translate('storage.calculatingRow');
      case 'missing':
        return this.i18n.translate('storage.missing');
      case 'error':
        return this.i18n.translate('storage.error');
      default:
        return row.partial ? this.i18n.translate('storage.partial', { size: formatBytes(row.bytes) }) : formatBytes(row.bytes);
    }
  }

  /**
   * Escape se atiende en la fase de captura del documento: cierra aunque el foco aún no haya entrado en el panel (justo
   * tras abrirlo) y no llega a los demás manejadores de Escape de la página (p. ej. el que cancela la IA del lote).
   */
  private readonly onDocumentEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.storage.panelOpen()) return;
    event.stopPropagation();
    event.preventDefault();
    if (this.storage.confirming()) this.storage.cancelClear();
    else this.storage.close();
  };

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.storage.confirming()) this.storage.cancelClear();
      else this.storage.close();
      return;
    }
    if (event.key !== 'Tab' || !this.dialog || this.storage.confirming()) return;
    this.trap(event, this.dialog.nativeElement);
  }

  onConfirmKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    this.trap(event, event.currentTarget as HTMLElement);
  }

  private trap(event: KeyboardEvent, root: HTMLElement): void {
    const items = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled])'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
