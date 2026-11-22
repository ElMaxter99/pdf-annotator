import { CommonModule } from '@angular/common';
import { Component, Input, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import type { BatchItem } from '../../../models/batch.model';
import { AiBatchService } from '../../../services/ai-batch.service';
import { TranslationService } from '../../../i18n/translation.service';
import { AI_BATCH_ACTIVE_PHASES } from '../../../utils/ai-batch.utils';
import { buildBatchTimeline, currentStep, isFinished } from '../../../utils/ai-batch-details.utils';
import { providerName } from './ai-batch-button.component';

const KNOWN_ERRORS = ['images_not_read', 'timeout', 'cli_error'];
const NOTHING = ['no_text_a', 'no_text_b', 'permission_denied', 'no_valid_answer', 'anchors_not_found', 'ai_found_nothing'];

/** State of one PDF in the AI queue (or its saved proposal, once the queue is gone). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-batch-chip',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  template: `
    @if (view(); as v) {
      <span class="ai-chip-wrap">
        <span class="ai-chip ai-chip--{{ v.tone }}" [attr.data-testid]="'ai-chip-' + v.phase" [attr.title]="v.done ? ('batch.ai.chip.tip.placed' | t: v.params) : null">
          @if (v.active) {
            <span class="ai-chip__spin" aria-hidden="true"></span>
          }
          {{ (v.done ? 'batch.ai.chip.' + v.key : 'batch.ai.state.' + v.key) | t: v.params }}
          @if (v.error) {
            · {{ v.error | t }}
          }
        </span>
        @if (v.toCheck) {
          <span class="ai-pill ai-pill--warn" data-testid="ai-chip-to-check" [attr.title]="'batch.ai.chip.tip.toCheck' | t: { n: v.toCheck }">{{ 'batch.ai.state.toCheck' | t: { n: v.toCheck } }}</span>
        }
        @if (v.added) {
          <span class="ai-pill" data-testid="ai-chip-added" [attr.title]="'batch.ai.chip.tip.added' | t: { n: v.added }">{{ 'batch.ai.chip.added' | t: { n: v.added } }}</span>
        }
        @if (v.absent) {
          <span class="ai-pill" data-testid="ai-chip-absent" [attr.title]="'batch.ai.chip.tip.absent' | t: { n: v.absent }">{{ 'batch.ai.chip.absent' | t: { n: v.absent } }}</span>
        }
        @if (v.canSkip) {
          <button type="button" class="btn btn--ghost ai-chip__skip" (click)="$event.stopPropagation(); queue.skipCurrent()" data-testid="ai-skip-one">
            {{ 'batch.ai.skipOne' | t }}
          </button>
        }
      </span>
      @if (v.sub; as sub) {
        <span class="ai-chip__sub" data-testid="ai-chip-sub">
          @if (sub.live) {
            {{ 'batch.ai.details.stepOf' | t: { n: sub.live.n, total: sub.live.total, title: sub.live.title } }} ·
          } @else if (sub.text) {
            {{ sub.text }} ·
          }
          <button type="button" class="ai-chip__link" (click)="$event.stopPropagation(); queue.openDetails(v.id)" [attr.data-testid]="'ai-chip-details'">
            {{ sub.link | t }}
          </button>
        </span>
      }
    }
  `,
  styleUrl: './ai-batch.scss',
})
export class AiBatchChipComponent {
  readonly queue = inject(AiBatchService);
  private readonly i18n = inject(TranslationService);
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
      const label = row.provider === 'adjust' ? this.i18n.translate('ai.review.adjustProvider') : providerName(row.provider || 'claude');
      const live = active ? currentStep(buildBatchTimeline(row, (key, params) => this.i18n.translate(key, params), label)) : null;
      const sub = live
        ? { live, text: '', link: 'batch.ai.details.live' }
        : isFinished(row) && row.phase !== 'cancelled'
          ? {
              live: null,
              text: row.phase === 'free' ? this.i18n.translate('batch.ai.details.noSpendShort') : '',
              link: row.phase === 'failed' ? 'batch.ai.details.seeDetails' : 'batch.ai.details.seeDone',
            }
          : null;
      return {
        id: item.id,
        sub,
        phase: row.phase,
        key: row.phase,
        params: { n: row.attempt, placed: row.placed, total: Math.max(0, row.total - (row.absent ?? 0)) },
        absent: row.absent ?? 0,
        done: row.phase === 'ready' || row.phase === 'free' || row.phase === 'partial',
        added: row.added ?? 0,
        toCheck: row.toCheck ?? 0,
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
      return { id: item.id, sub: null, phase: 'saved', key: 'saved', params: {}, absent: 0, done: false, added: 0, toCheck: 0, tone: 'ok', active: false, error: null, canSkip: false };
    }
    return null;
  });
}
