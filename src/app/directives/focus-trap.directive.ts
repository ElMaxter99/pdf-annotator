import { Directive, ElementRef, HostListener, OnDestroy, inject } from '@angular/core';

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Lists the visible, enabled elements of `root` that Tab can reach, in DOM order. */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && !el.hidden && el.getClientRects().length > 0,
  );
}

/**
 * Keeps Tab / Shift+Tab inside a modal dialog, moves the focus into it when it opens
 * and gives it back to the element that opened it when it closes.
 */
@Directive({ selector: '[appFocusTrap]', standalone: true })
export class FocusTrapDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly opener: Element | null =
    typeof document === 'undefined' ? null : document.activeElement;

  constructor() {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => {
        if (!this.host.contains(document.activeElement)) {
          (focusableIn(this.host)[0] ?? this.host).focus();
        }
      });
    }
    if (!this.host.hasAttribute('tabindex')) {
      this.host.setAttribute('tabindex', '-1');
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }
    const items = focusableIn(this.host);
    if (!items.length) {
      event.preventDefault();
      this.host.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.host)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === this.host)) {
      event.preventDefault();
      first.focus();
    }
  }

  ngOnDestroy(): void {
    const opener = this.opener as HTMLElement | null;
    if (opener && opener !== document.body && opener.isConnected) {
      opener.focus?.();
    }
  }
}
