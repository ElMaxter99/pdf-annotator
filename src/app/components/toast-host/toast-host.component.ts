import { Component, computed, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      @for (toast of visible(); track toast.id) {
        <div class="toast" [class]="'toast toast--' + toast.kind" [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="toast__message">{{ toast.message }}</span>
          <button type="button" class="toast__close" (click)="toasts.dismiss(toast.id)"
            [attr.aria-label]="'toast.close' | t">✕</button>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  readonly toasts = inject(ToastService);
  /** Un solo aviso a la vez: el último error y, si no hay, el último aviso. Los demás esperan su turno. */
  readonly visible = computed(() => {
    const list = this.toasts.toasts();
    const lastError = [...list].reverse().find((toast) => toast.kind === 'error');
    const shown = lastError ?? list[list.length - 1];
    return shown ? [shown] : [];
  });
}
