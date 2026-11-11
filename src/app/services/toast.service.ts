import { Injectable, signal } from '@angular/core';

export type ToastKind = 'error' | 'warning' | 'info' | 'success';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
  /** Informative notices can be shown again from the bell once they are closed. */
  readonly recoverable?: boolean;
}

const DEFAULT_DURATION_MS = 6000;

/** Non-blocking notifications that replace `alert()`. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<readonly Toast[]>([]);
  /** Recoverable notices that were closed (by the user or by timeout), newest last. */
  readonly closed = signal<readonly Toast[]>([]);
  private nextId = 1;

  show(
    message: string,
    kind: ToastKind = 'info',
    durationMs = DEFAULT_DURATION_MS,
    recoverable = false,
  ): number {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message, recoverable }]);
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

  /** Informative notice that stays reachable from the bell after it closes. */
  notice(message: string, kind: ToastKind = 'info', durationMs = 10000): number {
    return this.show(message, kind, durationMs, true);
  }

  dismiss(id: number): void {
    const toast = this.toasts().find((item) => item.id === id);
    if (!toast) return;
    this.toasts.update((list) => list.filter((item) => item.id !== id));
    if (toast.recoverable) {
      this.closed.update((list) => [
        ...list.filter((item) => item.message !== toast.message),
        toast,
      ].slice(-20));
    }
  }

  /** Shows a closed notice again; it leaves the bell list. */
  reopen(id: number): void {
    const toast = this.closed().find((item) => item.id === id);
    if (!toast) return;
    this.closed.update((list) => list.filter((item) => item.id !== id));
    this.notice(toast.message, toast.kind);
  }

  reopenAll(): void {
    for (const toast of [...this.closed()]) {
      this.reopen(toast.id);
    }
  }

  forgetClosed(): void {
    this.closed.set([]);
  }
}
