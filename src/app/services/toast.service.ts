import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

const DEFAULT_DURATION_MS = 6000;

/** Non-blocking notifications that replace `alert()`. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<readonly Toast[]>([]);
  private nextId = 1;

  show(message: string, kind: ToastKind = 'info', durationMs = DEFAULT_DURATION_MS): number {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    if (durationMs > 0 && typeof window !== 'undefined') {
      window.setTimeout(() => this.dismiss(id), durationMs);
    }
    return id;
  }

  warning(message: string): number {
    return this.show(message, 'warning', 10000);
  }

  error(message: string): number {
    return this.show(message, 'error');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }
}
