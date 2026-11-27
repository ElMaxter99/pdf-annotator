import { Component, ElementRef, ViewChild, effect, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { DesktopUpdateService } from '../../services/desktop-update.service';
import { TranslationService } from '../../i18n/translation.service';
import { ToastService } from '../../services/toast.service';

/**
 * Diálogo «Instalando la versión X» y aviso «Se actualizó a X» (diseño AC-13 y AC-14). Cubre la ventana mientras se
 * instala (en Linux el sistema pide la contraseña), explica el fallo si lo hay y confirma la actualización al reabrir.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-update-install',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @switch (update.installDialog()) {
      @case ('installing') {
        <div class="update-install__veil"></div>
        <div #dialog class="update-install" role="alertdialog" aria-modal="true" aria-labelledby="update-install-title" aria-describedby="update-install-desc" data-testid="update-installing" tabindex="-1">
          <div class="update-install__head">
            <i class="update-install__spin" aria-hidden="true"></i>
            <strong id="update-install-title">{{ 'update.installing.title' | t: { version: state().version } }}</strong>
          </div>
          <ol class="update-install__steps">
            <li class="is-done"><span aria-hidden="true">✓</span>{{ 'update.installing.stepSaved' | t }}</li>
            <li class="is-now"><i class="update-install__spin" aria-hidden="true"></i>{{ 'update.installing.stepInstall' | t }}</li>
            <li><span aria-hidden="true"></span>{{ 'update.installing.stepReopen' | t }}</li>
          </ol>
          <div class="update-card__bar update-install__bar" aria-hidden="true"><i></i></div>
          <p id="update-install-desc" class="update-install__hint" data-testid="update-installing-hint">
            @if (state().needsPassword) {
              <strong>{{ 'update.installing.password' | t }}</strong> {{ 'update.installing.passwordHelp' | t }}
            } @else {
              <strong>{{ 'update.installing.installer' | t }}</strong> {{ 'update.installing.installerHelp' | t }}
            }
          </p>
          <p class="update-card__text">{{ 'update.installing.safe' | t }}</p>
        </div>
      }
      @case ('error') {
        <div class="update-install__veil"></div>
        <div #dialog class="update-install update-install--error" role="alertdialog" aria-modal="true" aria-labelledby="update-install-title" aria-describedby="update-install-desc" data-testid="update-install-error" tabindex="-1" (keydown.escape)="update.dismissInstallError()">
          <strong id="update-install-title">{{ (state().installError === 'cancelled' ? 'update.installError.cancelledTitle' : state().installError === 'unauthorized' ? 'update.installError.unauthorizedTitle' : state().installError === 'blocked' ? 'update.installError.blockedTitle' : 'update.installError.title') | t }}</strong>
          <p id="update-install-desc" class="update-card__text">
            {{ (state().installError === 'cancelled' ? (state().needsAdmin ? 'update.installError.cancelledTextWindows' : 'update.installError.cancelledText') : state().installError === 'unauthorized' ? 'update.installError.unauthorizedText' : state().installError === 'blocked' ? 'update.installError.blockedText' : 'update.installError.text') | t: { current: state().current } }}
          </p>
          @if (state().installError !== 'cancelled' && state().installDetail) {
            <p class="update-install__hint" data-testid="update-install-detail">{{ 'update.installError.reason' | t }} <strong>{{ state().installDetail }}</strong></p>
          }
          <!-- Un botón por acción: reintentar si tiene sentido, los detalles para depurar y cerrar. -->
          <div class="update-card__actions">
            @if (state().installError === 'cancelled' || state().installError === 'unauthorized') {
              <button type="button" class="btn btn--primary" (click)="update.restartNow()" data-testid="update-install-retry">
                {{ (state().needsAdmin ? 'update.installError.askPermissionAgain' : 'update.installError.askPasswordAgain') | t }}
              </button>
            } @else if (state().installError === 'failed') {
              <button type="button" class="btn btn--primary" (click)="update.restartNow()" data-testid="update-install-retry">{{ 'update.retry' | t }}</button>
              @if (!state().needsPassword) {
                <button type="button" class="btn btn--ghost" (click)="update.openNotes()">{{ 'update.installError.manual' | t }} ↗</button>
              }
            }
            @if (state().installError !== 'cancelled') {
              <button type="button" class="btn btn--ghost" (click)="copyDetails()" data-testid="update-install-copy">{{ 'update.installError.copy' | t }}</button>
            }
            <button type="button" class="btn btn--ghost" (click)="update.dismissInstallError()" data-testid="update-install-dismiss">{{ 'update.installError.notNow' | t }}</button>
          </div>
        </div>
      }
    }
    @if (update.justUpdated(); as done) {
      <div class="update-card" role="status" aria-live="polite" data-testid="update-done">
        <div class="update-card__head">
          <strong>{{ 'update.done.title' | t: { version: done.to } }}</strong>
          <button type="button" class="update-card__close" (click)="update.dismissUpdated()" [attr.aria-label]="'update.close' | t">✕</button>
        </div>
        <p class="update-card__text">{{ 'update.done.text' | t: { from: done.from } }}</p>
        <div class="update-card__actions">
          <button type="button" class="update-card__link" (click)="update.openNotes()">{{ 'update.notes' | t }} ↗</button>
        </div>
      </div>
    }
  `,
})
export class UpdateInstallComponent {
  readonly update = inject(DesktopUpdateService);
  readonly state = this.update.state;
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  private doneTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.update.installDialog()) setTimeout(() => this.dialog?.nativeElement.focus());
    });
    // El aviso de «se actualizó» se cierra solo a los 8 s.
    effect(() => {
      if (this.doneTimer) clearTimeout(this.doneTimer);
      this.doneTimer = this.update.justUpdated() ? setTimeout(() => this.update.dismissUpdated(), 8000) : null;
    });
  }

  copyDetails(): void {
    const s = this.state();
    const text = `PDF Annotator ${s.current} → ${s.version ?? '?'}: ${s.installDetail ?? ''}`;
    void navigator.clipboard?.writeText(text).then(
      () => this.toast.show(this.i18n.translate('update.installError.copied'), 'info'),
      () => undefined,
    );
  }
}
