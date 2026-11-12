import { Component, computed, effect, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { DesktopUpdateService } from '../../services/desktop-update.service';

const MB = 1048576;

/** Tarjeta de actualización de la app de escritorio (diseño AC-01). Solo aparece dentro de Electron. */
@Component({
  selector: 'app-update-card',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (update.cardVisible()) {
      <div class="update-card" [class.update-card--error]="state().status === 'error'" role="status" aria-live="polite" data-testid="update-card">
        @switch (state().status) {
          @case ('available') {
            <div class="update-card__head">
              <strong>{{ 'update.available.title' | t }}</strong>
              <button type="button" class="update-card__close" (click)="update.later()" [attr.aria-label]="'update.later' | t" [attr.title]="'update.later' | t">✕</button>
            </div>
            <p class="update-card__text">
              {{ (state().mode === 'manual' ? 'update.available.manual' : 'update.available.text') | t: { version: state().version, current: state().current } }}
            </p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.download()">
                {{ (state().mode === 'manual' ? 'update.download' : 'update.now') | t: { version: state().version } }}
              </button>
              <button type="button" class="btn btn--ghost" (click)="update.later()">{{ 'update.later' | t }}</button>
              @if (state().mode === 'auto') {
                <button type="button" class="update-card__link" (click)="update.openNotes()">{{ 'update.notes' | t }} ↗</button>
              }
            </div>
          }
          @case ('downloading') {
            <div class="update-card__head"><strong>{{ 'update.downloading' | t: { version: state().version } }}</strong></div>
            <div class="update-card__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="state().percent ?? 0">
              <i [style.width.%]="state().percent ?? 0"></i>
            </div>
            <p class="update-card__text">{{ progressText() }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--ghost" (click)="update.cancel()">{{ 'update.cancel' | t }}</button>
            </div>
          }
          @case ('ready') {
            <div class="update-card__head"><strong>{{ 'update.ready.title' | t: { version: state().version } }}</strong></div>
            <p class="update-card__text">{{ 'update.ready.text' | t }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.restartNow()">{{ 'update.restartNow' | t }}</button>
              <button type="button" class="btn btn--ghost" (click)="update.restartOnQuit()">{{ 'update.onQuit' | t }}</button>
            </div>
          }
          @case ('error') {
            <div class="update-card__head">
              <strong>{{ 'update.error.title' | t }}</strong>
              <button type="button" class="update-card__close" (click)="update.dismissError()" [attr.aria-label]="'update.close' | t">✕</button>
            </div>
            <p class="update-card__text">{{ 'update.error.text' | t: { current: state().current } }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--primary" (click)="update.retry()">{{ 'update.retry' | t }}</button>
              <button type="button" class="btn btn--ghost" (click)="update.dismissError()">{{ 'update.close' | t }}</button>
            </div>
          }
        }
      </div>
    }
  `,
})
export class UpdateCardComponent {
  readonly update = inject(DesktopUpdateService);
  readonly state = this.update.state;
  readonly progressText = computed(() => {
    const s = this.state();
    const total = Math.round((s.total ?? 0) / MB);
    return total ? `${s.percent ?? 0} % · ${Math.round((s.transferred ?? 0) / MB)} / ${total} MB` : `${s.percent ?? 0} %`;
  });

  constructor() {
    effect(() => {
      if (typeof document !== 'undefined') document.body.classList.toggle('has-update-card', this.update.cardVisible());
    });
  }
}
