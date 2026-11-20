import { Component, ElementRef, ViewChild, computed, effect, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { TranslationService } from '../../i18n/translation.service';
import { DesktopUpdateService } from '../../services/desktop-update.service';
import { UpdateChannelComponent } from '../update-channel/update-channel.component';

const MB = 1048576;

/**
 * Panel «Versión y actualizaciones» (diseño AC-10 a AC-12): estado, «Buscar ahora», canal y notas, accesible
 * desde el chip de versión de cualquier pantalla y desde el menú Ayuda. Solo existe dentro de Electron.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-update-panel',
  standalone: true,
  imports: [TranslationPipe, UpdateChannelComponent],
  template: `
    @if (update.isDesktop && update.panelOpen()) {
      <div class="update-panel__veil" (click)="update.closePanel()"></div>
      <div
        #dialog
        class="update-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-panel-title"
        data-testid="update-panel"
        (keydown)="onKeydown($event)"
      >
        <div class="update-panel__head">
          <div>
            <div id="update-panel-title" class="update-panel__sub">{{ 'update.panel.title' | t }}</div>
            <div class="update-panel__ver" data-testid="panel-version">
              v{{ state().current }}
              @if (update.currentIsPrerelease()) {
                <span class="update-tag">{{ 'update.tag' | t }}</span>
              }
            </div>
          </div>
          <button #closeBtn type="button" class="update-card__close" (click)="update.closePanel()" [attr.aria-label]="'update.close' | t">✕</button>
        </div>

        <div [class]="'update-panel__status update-panel__status--' + tone()" role="status" aria-live="polite" data-testid="panel-status">
          @if (state().checking) {
            <i class="update-panel__spin" aria-hidden="true"></i>
          } @else if (tone() === 'warn' || tone() === 'danger') {
            <i class="update-panel__dot" aria-hidden="true"></i>
          }
          {{ statusText() }}
        </div>

        @switch (state().status) {
          @case ('available') {
            <p class="update-panel__text">{{ (state().mode === 'manual' ? 'update.panel.manualText' : 'update.available.text') | t: { version: state().version, current: state().current } }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.download()" data-testid="panel-download">
                {{ (state().mode === 'manual' ? 'update.download' : 'update.now') | t: { version: state().version } }}
              </button>
              <button type="button" class="btn btn--ghost" (click)="later()">{{ 'update.later' | t }}</button>
              <button type="button" class="update-card__link" (click)="update.openNotes()">{{ (state().prerelease ? 'update.notesRc' : 'update.notes') | t }} ↗</button>
            </div>
          }
          @case ('downloading') {
            <div class="update-card__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="state().percent ?? 0"><i [style.width.%]="state().percent ?? 0"></i></div>
            <p class="update-panel__text">{{ progressText() }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--ghost" (click)="update.cancel()">{{ 'update.cancel' | t }}</button>
            </div>
          }
          @case ('ready') {
            <p class="update-panel__text">{{ (update.installOnQuitChosen() ? 'update.panel.onQuitText' : 'update.panel.readyText') | t }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.restartNow()" data-testid="panel-restart">{{ 'update.restartNow' | t }}</button>
              @if (!update.installOnQuitChosen()) {
                <button type="button" class="btn btn--ghost" (click)="update.restartOnQuit()">{{ 'update.onQuit' | t }}</button>
              }
            </div>
          }
          @case ('error') {
            <p class="update-panel__text">{{ 'update.error.text' | t: { current: state().current } }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.retry()">{{ 'update.retry' | t }}</button>
            </div>
          }
        }

        <hr class="update-panel__hr" />
        <app-update-channel class="update-panel__channel"></app-update-channel>
        <hr class="update-panel__hr" />

        <div class="update-panel__row">
          <span class="update-panel__text" data-testid="panel-last-checked">{{ lastCheckedText() }}</span>
          <button type="button" class="btn btn--ghost" (click)="update.checkNow()" [disabled]="state().checking || state().status === 'downloading'" data-testid="panel-check">
            {{ 'update.panel.checkNow' | t }}
          </button>
        </div>
      </div>
    }
  `,
})
export class UpdatePanelComponent {
  readonly update = inject(DesktopUpdateService);
  readonly state = this.update.state;
  private readonly i18n = inject(TranslationService);
  @ViewChild('closeBtn') private closeBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  private opener: HTMLElement | null = null;

  readonly tone = computed<'ok' | 'idle' | 'busy' | 'warn' | 'danger'>(() => {
    const s = this.state();
    if (s.checking) return 'busy';
    if (s.status === 'error') return 'danger';
    if (s.status === 'available' || s.status === 'ready') return 'warn';
    if (s.status === 'downloading' || s.status === 'installing') return 'busy';
    return s.lastChecked ? 'ok' : 'idle';
  });

  readonly progressText = computed(() => {
    const s = this.state();
    const total = Math.round((s.total ?? 0) / MB);
    return total
      ? `${s.percent ?? 0} % · ${Math.round((s.transferred ?? 0) / MB)} / ${total} MB`
      : `${s.percent ?? 0} %`;
  });

  constructor() {
    effect(() => {
      const open = this.update.panelOpen();
      if (typeof document === 'undefined') return;
      if (open) {
        this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setTimeout(() => this.closeBtn?.nativeElement.focus());
      } else if (this.opener) {
        this.opener.focus?.();
        this.opener = null;
      }
    });
  }

  statusText(): string {
    const s = this.state();
    const v = { version: s.version, current: s.current };
    if (s.checking) return this.i18n.translate('update.panel.status.checking', v);
    switch (s.status) {
      case 'available':
        return this.i18n.translate(
          s.prerelease ? 'update.panel.status.availableRc' : 'update.panel.status.available',
          v,
        );
      case 'downloading':
        return this.i18n.translate('update.panel.status.downloading', v);
      case 'installing':
        return this.i18n.translate('update.panel.status.installing', v);
      case 'ready':
        return this.i18n.translate('update.panel.status.ready', v);
      case 'error':
        return this.i18n.translate('update.panel.status.error', v);
      default:
        return this.i18n.translate(
          s.lastChecked ? 'update.panel.status.upToDate' : 'update.panel.status.never',
          v,
        );
    }
  }

  lastCheckedText(): string {
    const at = this.state().lastChecked;
    if (!at) return this.i18n.translate('update.panel.never');
    const min = Math.max(0, Math.round((Date.now() - at) / 60000));
    const when =
      min < 1
        ? this.i18n.translate('update.panel.ago.now')
        : min < 60
          ? this.i18n.translate('update.panel.ago.min', { n: min })
          : min < 1440
            ? this.i18n.translate('update.panel.ago.hour', { n: Math.round(min / 60) })
            : this.i18n.translate('update.panel.ago.day', { n: Math.round(min / 1440) });
    return this.i18n.translate('update.panel.lastChecked', { when });
  }

  later(): void {
    this.update.later();
    this.update.closePanel();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      // Con un diálogo de confirmación del canal abierto, Escape solo cierra ese.
      if (!document.querySelector('[data-testid="channel-dialog"]')) this.update.closePanel();
      return;
    }
    if (event.key !== 'Tab' || !this.dialog) return;
    const items = Array.from(
      this.dialog.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'),
    ).filter((el) => !el.closest('[data-testid="channel-dialog"]'));
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
