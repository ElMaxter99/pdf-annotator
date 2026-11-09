import { Component, input } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';

const STEPS = ['lot', 'template', 'newPdf', 'compare', 'export'] as const;

/** Progress chips of the batch flow (1 Lote … 5 Exportar). Purely informative. */
@Component({
  selector: 'app-batch-steps',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <ol class="steps" [attr.aria-label]="'batch.steps.label' | t">
      @for (step of steps; track step; let i = $index) {
        <li class="step" [class.is-active]="i + 1 === active()" [class.is-done]="i + 1 < active()"
          [attr.aria-current]="i + 1 === active() ? 'step' : null">
          {{ i + 1 < active() ? '✓' : i + 1 }} {{ 'batch.steps.' + step | t }}
        </li>
      }
    </ol>
  `,
  styles: [
    `
      .steps { display: flex; gap: 8px; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; }
      .step { border-radius: 999px; padding: 6px 14px; font-size: 13px; font-weight: 600; color: var(--muted); background: color-mix(in srgb, var(--text) 8%, transparent); transition: background .2s ease-out; }
      .step.is-done { color: var(--text); }
      .step.is-active { color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, transparent); }
      @media (prefers-reduced-motion: reduce) { .step { transition: none; } }
    `,
  ],
})
export class BatchStepsComponent {
  readonly active = input.required<number>();
  readonly steps = STEPS;
}
