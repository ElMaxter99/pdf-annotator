import { Component, HostListener, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { ToastService } from '../../services/toast.service';

/** Bell with the informative notices the user closed (or that expired), to show them again. */
@Component({
  selector: 'app-toast-bell',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <div class="migration-menu migration-bell">
      <button
        type="button"
        class="btn btn--ghost migration-bell__btn"
        aria-haspopup="true"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="'toast.bell.label' | t: { count: toasts.closed().length }"
        [attr.title]="'toast.bell.label' | t: { count: toasts.closed().length }"
        data-testid="toast-bell"
        (click)="toggle($event)"
      >
        🔔
        @if (toasts.closed().length) {
          <span class="migration-bell__count" aria-hidden="true" data-testid="toast-bell-count">{{
            toasts.closed().length
          }}</span>
        }
      </button>
      @if (open()) {
        <div
          class="migration-menu__panel migration-bell__panel"
          role="dialog"
          [attr.aria-label]="'toast.bell.title' | t"
          data-testid="toast-bell-panel"
          (click)="$event.stopPropagation()"
        >
          <div class="migration-bell__head">
            <strong>{{ 'toast.bell.title' | t }}</strong>
            @if (toasts.closed().length > 1) {
              <button type="button" class="btn btn--ghost" (click)="toasts.reopenAll()" data-testid="toast-bell-all">
                {{ 'toast.bell.showAll' | t }}
              </button>
            }
          </div>
          @for (toast of toasts.closed(); track toast.id) {
            <div class="migration-bell__row">
              <span>{{ toast.message }}</span>
              <div class="migration-bell__acts">
                <button type="button" class="btn btn--ghost" (click)="toasts.reopen(toast.id)">
                  {{ 'toast.bell.show' | t }}
                </button>
              </div>
            </div>
          } @empty {
            <div class="migration-bell__empty">
              <strong>{{ 'toast.bell.emptyTitle' | t }}</strong>
              <small>{{ 'toast.bell.emptyHint' | t }}</small>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ToastBellComponent {
  readonly toasts = inject(ToastService);
  readonly open = signal(false);

  toggle(event: Event): void {
    event.stopPropagation();
    this.open.update((value) => !value);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  close(): void {
    this.open.set(false);
  }
}
