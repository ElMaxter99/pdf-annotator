import { ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';

/**
 * Ayuda bajo demanda: un icono ⓘ que enseña el texto al pasar el ratón o al enfocarlo con el teclado.
 * Sustituye a los párrafos fijos bajo botones y casillas.
 */
@Component({
  selector: 'app-info-tip',
  standalone: true,
  imports: [TranslationPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="info-tip__btn" [attr.aria-label]="'hint.label' | t" [attr.aria-describedby]="id">
      <span aria-hidden="true">i</span>
    </button>
    <span class="info-tip__bubble" role="tooltip" [id]="id" [style.left.px]="x()" [style.top.px]="y()">{{ text }}</span>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-flex;
        vertical-align: middle;
        flex: none;
      }
      .info-tip__btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        padding: 0;
        border: 1px solid var(--muted);
        border-radius: 50%;
        background: transparent;
        color: var(--muted);
        font: 700 11px/1 'Segoe UI', sans-serif;
        cursor: help;
      }
      .info-tip__btn:hover,
      .info-tip__btn:focus-visible {
        color: var(--accent);
        border-color: var(--accent);
      }
      .info-tip__btn:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }
      .info-tip__bubble {
        position: fixed;
        z-index: 1200;
        width: max-content;
        max-width: min(280px, 70vw);
        padding: 8px 12px;
        border: 1px solid var(--muted);
        border-radius: 10px;
        background: var(--panel);
        color: var(--text);
        font-size: 0.8rem;
        font-weight: 400;
        line-height: 1.45;
        text-align: left;
        white-space: normal;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        opacity: 0;
        visibility: hidden;
        transform: translateY(-2px);
        transition: opacity 0.15s ease-out, transform 0.15s ease-out, visibility 0s linear 0.15s;
        pointer-events: none;
      }
      :host(:hover) .info-tip__bubble,
      .info-tip__btn:focus-visible + .info-tip__bubble {
        opacity: 1;
        visibility: visible;
        transform: none;
        transition-delay: 0s;
      }
      @media (prefers-reduced-motion: reduce) {
        .info-tip__bubble {
          transition: none;
        }
      }
    `,
  ],
})
export class InfoTipComponent {
  private static next = 0;
  @Input({ required: true }) text = '';
  readonly id = `info-tip-${InfoTipComponent.next++}`;
  readonly x = signal(0);
  readonly y = signal(0);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** El globo es `fixed` para que el scroll del panel no lo recorte; se coloca junto al icono. */
  @HostListener('mouseenter')
  @HostListener('focusin')
  place(): void {
    if (typeof window === 'undefined') return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth * 0.7);
    this.x.set(Math.max(8, Math.min(rect.left - 8, window.innerWidth - width - 16)));
    this.y.set(rect.bottom + 6);
  }
}
