import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, Input, Output, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationService } from '../../../../i18n/translation.service';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import {
  confidenceLevel,
  type AiRow,
} from '../../../../utils/ai-proposal.utils';
import { AiDetailsComponent } from './ai-details.component';
import type { WorkspacePageComponent } from '../../workspace.page';

/** «Copiar y adaptar con IA»: the review bar docked under the viewer (progress, errors and the proposal to apply). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-review',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiDetailsComponent],
  templateUrl: './ai-review.component.html',
})
export class AiReviewComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  @Output() readonly closeRequested = new EventEmitter<void>();

  private readonly i18n = inject(TranslationService);

  readonly menuOpen = signal(false);
  readonly confirming = signal(false);

  /** Placed fields that are not high confidence: what is worth a look before applying. */
  reviewCount(): number {
    return (this.vm.ai()?.rows ?? []).filter((row: AiRow) => row.ok && confidenceLevel(row.confidence) !== 'high').length;
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  openDetails(): void {
    this.menuOpen.set(false);
    this.vm.setAiDetailsOpen(true);
  }

  askDiscard(): void {
    this.menuOpen.set(false);
    this.confirming.set(true);
  }

  /** ✕: a saved proposal stays in the batch (it can be reopened); a fresh one asks first. */
  onClose(): void {
    if (this.vm.ai()?.saved) {
      this.vm.cancelAi();
    } else {
      this.confirming.set(true);
    }
  }

  confirmDiscard(): void {
    this.confirming.set(false);
    if (this.vm.ai()?.saved) {
      this.vm.discardAi();
    } else {
      this.vm.cancelAi();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.menuOpen() && !(event.target as HTMLElement | null)?.closest?.('.ai-dock__more')) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
    } else if (this.confirming()) {
      this.confirming.set(false);
    }
  }

  providerName(): string {
    const provider = this.vm.ai()?.provider;
    return provider === 'adjust'
      ? this.i18n.translate('ai.review.adjustProvider')
      : provider === 'copilot'
        ? 'Copilot'
        : provider === 'fake'
          ? 'Simulado'
          : 'Claude';
  }

  seconds(): number {
    const start = this.vm.ai()?.startedAt ?? Date.now();
    return Math.max(0, Math.round((Date.now() - start) / 1000));
  }

  otherProvider(): 'claude' | 'copilot' | null {
    const other = this.vm.ai()?.provider === 'copilot' ? 'claude' : 'copilot';
    return this.vm.aiHelper.found()[other] ? other : null;
  }

  otherName(): string {
    return this.otherProvider() === 'copilot' ? 'Copilot' : 'Claude';
  }
}
