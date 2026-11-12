import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import type { BatchItem } from '../../../models/batch.model';
import { AiBatchService } from '../../../services/ai-batch.service';
import { AI_BATCH_ACTIVE_PHASES } from '../../../utils/ai-batch.utils';

const KNOWN_ERRORS = ['images_not_read', 'timeout', 'cli_error'];
const NOTHING = ['no_text_a', 'no_text_b', 'permission_denied', 'no_valid_answer', 'anchors_not_found', 'ai_found_nothing'];

/** State of one PDF in the AI queue (or its saved proposal, once the queue is gone). */
@Component({
  selector: 'app-ai-batch-chip',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  template: `
    @if (view(); as v) {
      <span class="ai-chip-wrap">
        <span class="ai-chip ai-chip--{{ v.tone }}" [attr.data-testid]="'ai-chip-' + v.phase">
          @if (v.active) {
            <span class="ai-chip__spin" aria-hidden="true"></span>
          }
          {{ 'batch.ai.state.' + v.key | t: v.params }}
          @if (v.error) {
            · {{ v.error | t }}
          }
        </span>
        @if (v.canSkip) {
          <button type="button" class="btn btn--ghost ai-chip__skip" (click)="queue.skipCurrent()" data-testid="ai-skip-one">
            {{ 'batch.ai.skipOne' | t }}
          </button>
        }
      </span>
    }
  `,
  styleUrl: './ai-batch.scss',
})
export class AiBatchChipComponent {
  readonly queue = inject(AiBatchService);
  private readonly current = signal<BatchItem | null>(null);

  @Input({ required: true }) set item(value: BatchItem) {
    this.current.set(value);
  }

  readonly view = computed(() => {
    const item = this.current();
    if (!item) {
      return null;
    }
    const row = this.queue.rows()[item.id];
    if (row) {
      const active = AI_BATCH_ACTIVE_PHASES.includes(row.phase);
      const error =
        row.phase === 'failed' && row.error
          ? KNOWN_ERRORS.includes(row.error.code)
            ? `batch.ai.err.${row.error.code}`
            : NOTHING.includes(row.error.code)
              ? 'batch.ai.err.nothing'
              : 'batch.ai.err.generic'
          : null;
      return {
        phase: row.phase,
        key: row.phase,
        params: { n: row.attempt, placed: row.placed, total: row.total },
        tone:
          row.phase === 'ready' || row.phase === 'free'
            ? 'ok'
            : active
              ? 'on'
              : row.phase === 'failed'
                ? 'err'
                : row.phase === 'partial'
                  ? 'warn'
                  : 'idle',
        active,
        error,
        canSkip: row.phase === 'asking' || row.phase === 'reading',
      };
    }
    if (item.aiProposal) {
      return { phase: 'saved', key: 'saved', params: {}, tone: 'ok', active: false, error: null, canSkip: false };
    }
    return null;
  });
}
