import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import {
  effectiveShift,
  formatShift,
  isFieldMoved,
  type AdjustField,
} from '../../../../utils/adjust-session.utils';
import type { ShiftConfidence } from '../../../../utils/text-anchors.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

/** «Copiar y ajustar por textos»: a notice under the bar with the proposal, never over the PDF. */
@Component({
  selector: 'app-adjust-review',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './adjust-review.component.html',
})
export class AdjustReviewComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  /** ✕ on the notice: it goes to the bell and the proposal stays. */
  @Output() readonly closeRequested = new EventEmitter<void>();

  moved(field: AdjustField): boolean {
    return isFieldMoved(field);
  }

  offset(field: AdjustField): string {
    const { dx, dy } = effectiveShift(field);
    return formatShift(dx, dy);
  }

  offsetOf(dx: number, dy: number): string {
    return formatShift(dx, dy);
  }

  counts(): { near: number; estimated: number } {
    const fields = this.vm.adjust()?.fields ?? [];
    const estimated = fields.filter((f) => f.shift?.confidence === 'estimated').length;
    return { near: fields.filter((f) => f.shift && f.shift.confidence !== 'estimated').length, estimated };
  }

  badge(field: AdjustField): { key: string; cls: string } {
    if (field.manual) {
      return { key: 'manual', cls: 'adjust-badge--manual' };
    }
    if (!field.shift) {
      return { key: 'none', cls: '' };
    }
    const confidence: ShiftConfidence = field.shift.confidence;
    const cls: Record<ShiftConfidence, string> = {
      high: 'adjust-badge--high',
      medium: 'adjust-badge--medium',
      low: 'adjust-badge--low',
      estimated: 'adjust-badge--estimated',
    };
    return { key: confidence, cls: cls[confidence] };
  }

  /** Texts that decided the shift of a field, e.g. «Nº», «FACTURA». */
  anchorTexts(field: AdjustField): string {
    const ids = new Set(field.shift?.anchorIds ?? []);
    return (this.vm.adjust()?.anchors ?? [])
      .filter((row) => row.page === field.page && ids.has(row.anchor.id))
      .map((row) => `«${row.anchor.text}»`)
      .join(', ');
  }

  cardStyle(card: { x: number; y: number }): Record<string, string> {
    const width = 250;
    const height = 280;
    const left = Math.max(8, Math.min(card.x + 14, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(card.y + 14, window.innerHeight - height - 8));
    return { left: `${left}px`, top: `${top}px` };
  }

  applyManual(key: string, dx: string, dy: string): void {
    this.vm.setAdjustManual(key, Number(dx), Number(dy));
  }

  shiftOf(field: AdjustField): { dx: number; dy: number } {
    const { dx, dy } = effectiveShift(field);
    return { dx: Math.round(dx * 10) / 10, dy: Math.round(dy * 10) / 10 };
  }
}
