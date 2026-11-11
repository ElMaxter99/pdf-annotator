import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { effectiveShift, isFieldMoved, type AdjustField } from '../../../../utils/adjust-session.utils';
import type { ShiftConfidence } from '../../../../utils/text-anchors.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

/** Review of «Copiar y ajustar por textos»: fields and anchor texts, applied only on request. */
@Component({
  selector: 'app-adjust-review',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './adjust-review.component.html',
})
export class AdjustReviewComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  moved(field: AdjustField): boolean {
    return isFieldMoved(field);
  }

  /** «→ 24 pt · ↓ 32 pt» (PDF y grows upwards, so a negative dy goes down). */
  offset(field: AdjustField): string {
    const { dx, dy } = effectiveShift(field);
    return AdjustReviewComponent.formatShift(dx, dy);
  }

  offsetOf(dx: number, dy: number): string {
    return AdjustReviewComponent.formatShift(dx, dy);
  }

  static formatShift(dx: number, dy: number): string {
    const round = (value: number) => Math.round(Math.abs(value));
    const horizontal = dx === 0 ? '' : `${dx > 0 ? '→' : '←'} ${round(dx)} pt`;
    const vertical = dy === 0 ? '' : `${dy > 0 ? '↑' : '↓'} ${round(dy)} pt`;
    return [horizontal, vertical].filter(Boolean).join(' · ') || '0 pt';
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
}
