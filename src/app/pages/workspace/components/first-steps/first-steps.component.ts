import { CommonModule } from '@angular/common';
import { Component, Input, effect, signal, untracked } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { guideSeen, markGuideSeen } from '../../../../utils/first-run.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

/**
 * Primeros pasos (mesa P-48): una tarjeta de tres pasos mientras el editor está vacío y, al colocar el primer
 * campo, una pista única. Se cierra con ✕ o «No volver a mostrar» y no vuelve (localStorage, con try/catch).
 */
@Component({
  selector: 'app-first-steps',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './first-steps.component.html',
  styleUrl: './first-steps.component.scss',
})
export class FirstStepsComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  private readonly stepsClosed = signal(guideSeen('steps'));
  private readonly hintShown = signal(guideSeen('hint'));
  readonly hintOpen = signal(false);
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private seenEmpty = false;

  /** Empty editor, a loose PDF (a batch PDF has its own guide in the migration bar) and nobody closed it yet. */
  get stepsVisible(): boolean {
    return !this.stepsClosed() && !!this.vm.pdfDoc && !this.vm.batchCtx() && this.vm.annotationCount() === 0;
  }

  constructor() {
    effect(() => {
      const count = this.vm.annotationCount();
      untracked(() => {
        if (count === 0) {
          this.seenEmpty = true;
          return;
        }
        if (!this.seenEmpty || this.vm.batchCtx()) {
          return;
        }
        this.seenEmpty = false;
        // The steps are done as soon as there is something on the page; the hint shows once.
        markGuideSeen('steps');
        this.stepsClosed.set(true);
        if (count === 1 && !this.hintShown()) {
          this.hintShown.set(true);
          markGuideSeen('hint');
          this.hintOpen.set(true);
          this.hintTimer = setTimeout(() => this.hintOpen.set(false), 9000);
        }
      });
    });
  }

  closeSteps(): void {
    markGuideSeen('steps');
    this.stepsClosed.set(true);
  }

  closeHint(): void {
    if (this.hintTimer) {
      clearTimeout(this.hintTimer);
    }
    this.hintOpen.set(false);
  }

  importJson(): void {
    this.vm.triggerImportCoords();
  }
}
