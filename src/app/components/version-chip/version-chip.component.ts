import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { APP_VERSION } from '../../app-version';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { DesktopUpdateService, isPrereleaseVersion } from '../../services/desktop-update.service';

/**
 * Chip de versión (diseño AC-10/AC-12). En la app de escritorio es un botón que abre el panel «Versión y
 * actualizaciones» desde cualquier pantalla y lleva un punto cuando hay novedad; en la web es solo texto.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-version-chip',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (update.isDesktop) {
      <button
        type="button"
        class="version-chip"
        [class.version-chip--open]="update.panelOpen()"
        aria-haspopup="dialog"
        [attr.aria-label]="'update.panel.chipLabel' | t: { version: 'v' + shown() }"
        [attr.title]="'update.panel.title' | t"
        (click)="update.openPanel()"
        data-testid="version-chip"
      >
        @if (update.chipDot(); as dot) {
          <i
            [class]="'version-chip__dot version-chip__dot--' + dot"
            aria-hidden="true"
            data-testid="version-chip-dot"
          ></i>
        }
        v{{ shown() }}
        @if (isRc()) {
          <span class="update-tag version-chip__tag">{{ 'update.tag' | t }}</span>
        }
      </button>
    } @else {
      <span class="version-chip version-chip--plain">v{{ shown() }}</span>
    }
  `,
})
export class VersionChipComponent {
  readonly update = inject(DesktopUpdateService);
  /** Versión a mostrar en la web; en escritorio manda la que informa el proceso principal. */
  @Input() version: string = APP_VERSION;

  shown(): string {
    return (this.update.isDesktop && this.update.state().current) || this.version;
  }
  isRc(): boolean {
    return isPrereleaseVersion(this.shown());
  }
}
