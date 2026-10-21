import { Component, inject } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      @for (toast of toasts.toasts(); track toast.id) {
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
}
