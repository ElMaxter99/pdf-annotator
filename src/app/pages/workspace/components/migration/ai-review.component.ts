import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { TranslationService } from '../../../../i18n/translation.service';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import {
  confidenceLevel,
  isRowSelected,
  rowChangesPage,
  rowNeedsReview,
  sortAiRows,
  type AiRow,
} from '../../../../utils/ai-proposal.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

/** «Copiar y adaptar con IA»: the strip under the bar with progress, errors and the proposal to review. */
@Component({
  selector: 'app-ai-review',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './ai-review.component.html',
})
export class AiReviewComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  @Output() readonly closeRequested = new EventEmitter<void>();

  private readonly i18n = inject(TranslationService);

  /** «9 de 10 campos colocados · 1 cambia de página · 1 sin encontrar.» */
  stripText(): string {
    const sum = this.vm.aiSummary();
    const parts = [this.i18n.translate('ai.review.strip', { placed: sum.placed, total: sum.total })];
    if (sum.changePage > 0) {
      parts.push(this.i18n.translate('ai.review.changePage', { count: sum.changePage }));
    }
    if (sum.notFound > 0) {
      parts.push(this.i18n.translate('ai.review.notFound', { count: sum.notFound }));
    }
    return parts.join(' · ') + '.';
  }

  sorted(): AiRow[] {
    return sortAiRows(this.vm.ai()?.rows ?? []);
  }

  selected(row: AiRow): boolean {
    return isRowSelected(row, this.vm.aiOverrides());
  }

  level(row: AiRow): string {
    return row.ok ? confidenceLevel(row.confidence) : 'none';
  }

  needsReview(row: AiRow): boolean {
    return rowNeedsReview(row);
  }

  changesPage(row: AiRow): boolean {
    return rowChangesPage(row);
  }

  providerName(): string {
    const provider = this.vm.ai()?.provider;
    return provider === 'copilot' ? 'Copilot' : provider === 'fake' ? 'Simulado' : 'Claude';
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
