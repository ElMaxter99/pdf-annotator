import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { DesktopUpdateService, UpdateChannel } from '../../services/desktop-update.service';

/**
 * Canal de actualizaciones de la app de escritorio (diseño RC-01 y RC-02): «Estable» o «Pruebas» (también
 * versiones de prueba RC). Pasar a Pruebas pide confirmación; volver a Estable estando en una prueba explica
 * que no se baja de versión (se espera a la siguiente final). Solo existe dentro de Electron.
 */
@Component({
  selector: 'app-update-channel',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (update.isDesktop) {
      <div class="update-channel" data-testid="update-channel">
        <div class="update-channel__row">
          <span id="update-channel-label" class="update-channel__label">{{
            'update.channel.label' | t
          }}</span>
          <span
            class="update-channel__seg"
            role="group"
            aria-labelledby="update-channel-label"
            [attr.title]="
              (update.channel() === 'beta'
                ? 'update.channel.hintBeta'
                : 'update.channel.hintStable'
              ) | t
            "
          >
            <button
              type="button"
              [attr.aria-pressed]="update.channel() === 'stable'"
              (click)="choose('stable')"
              data-testid="channel-stable"
            >
              {{ 'update.channel.stable' | t }}
            </button>
            <button
              type="button"
              [attr.aria-pressed]="update.channel() === 'beta'"
              (click)="choose('beta')"
              data-testid="channel-beta"
            >
              {{ 'update.channel.beta' | t }}
            </button>
          </span>
          @if (update.currentIsPrerelease()) {
            <span class="update-tag update-channel__tag" data-testid="current-test-tag">{{
              'update.tag' | t
            }}</span>
          }
        </div>
        <p class="update-channel__hint">
          {{
            (update.channel() === 'beta' ? 'update.channel.hintBeta' : 'update.channel.hintStable')
              | t
          }}
        </p>
      </div>
      @if (asking(); as ask) {
        <div class="update-channel__veil" (click)="close()"></div>
        <div
          class="update-channel__dialog"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="'update-channel-title'"
          data-testid="channel-dialog"
        >
          @if (ask === 'beta') {
            <strong id="update-channel-title">{{ 'update.channel.confirm.title' | t }}</strong>
            <p>{{ 'update.channel.confirm.text' | t }}</p>
            <p>{{ 'update.channel.confirm.text2' | t }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--ghost" (click)="close()">
                {{ 'update.channel.confirm.cancel' | t }}
              </button>
              <button
                type="button"
                #primary
                class="btn btn--primary"
                (click)="apply('beta')"
                data-testid="channel-confirm"
              >
                {{ 'update.channel.confirm.yes' | t }}
              </button>
            </div>
          } @else {
            <strong id="update-channel-title">{{ 'update.channel.back.title' | t }}</strong>
            <p>{{ 'update.channel.back.text' | t: { current: update.state().current } }}</p>
            <div class="update-card__actions">
              <button type="button" class="btn btn--ghost" (click)="close()">
                {{ 'update.channel.confirm.cancel' | t }}
              </button>
              <button type="button" class="btn btn--ghost" (click)="update.openNotes()">
                {{ 'update.channel.back.github' | t }} ↗
              </button>
              <button
                type="button"
                #primary
                class="btn btn--primary"
                (click)="apply('stable')"
                data-testid="channel-confirm"
              >
                {{ 'update.channel.back.ok' | t }}
              </button>
            </div>
          }
        </div>
      }
    }
  `,
})
export class UpdateChannelComponent {
  readonly update = inject(DesktopUpdateService);
  /** Canal que se está confirmando (null = sin diálogo). */
  readonly asking = signal<UpdateChannel | null>(null);
  readonly isBeta = computed(() => this.update.channel() === 'beta');
  @ViewChild('primary') private primary?: ElementRef<HTMLButtonElement>;

  choose(target: UpdateChannel): void {
    if (target === this.update.channel()) return;
    // A Pruebas siempre confirma; a Estable solo hace falta explicar si ya se está en una prueba.
    if (target === 'beta' || this.update.currentIsPrerelease()) {
      this.asking.set(target);
      setTimeout(() => this.primary?.nativeElement.focus());
      return;
    }
    this.apply(target);
  }

  apply(target: UpdateChannel): void {
    this.asking.set(null);
    this.update.setChannel(target);
  }

  close(): void {
    this.asking.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.asking()) this.close();
  }
}
