import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { AiBatchService, type AiBatchRow } from '../../../services/ai-batch.service';
import { AiHelperService } from '../../../services/ai-helper.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { usageTotal } from '../../../utils/ai-proposal.utils';
import { AI_BATCH_ACTIVE_PHASES } from '../../../utils/ai-batch.utils';
import { AiBatchDetailsComponent } from './ai-batch-details.component';
import { providerName } from './ai-batch-button.component';

/**
 * «Traslado con IA»: one non-modal side panel for the whole run (progress, failures, per-PDF list and, on demand, the
 * details accordion). It replaces the old status bar, the toasts and the full-screen «Qué está haciendo la IA».
 */
@Component({
  selector: 'app-ai-batch-panel',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiBatchDetailsComponent],
  templateUrl: './ai-batch-panel.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchPanelComponent implements OnInit, OnDestroy {
  readonly queue = inject(AiBatchService);
  readonly helper = inject(AiHelperService);
  private readonly store = inject(BatchStoreService);
  private readonly i18n = inject(TranslationService);
  @Output() readonly reviewFirst = new EventEmitter<void>();

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly pausing = signal(false);

  ngOnInit(): void {
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.queue.panelOpen() && this.queue.run() !== 'idle') {
      this.queue.closePanel();
    }
  }

  readonly counts = this.queue.counts;
  readonly finished = computed(() => this.counts().done + this.counts().failed + this.counts().cancelled);
  readonly percent = computed(() =>
    this.counts().total ? Math.round((this.finished() / this.counts().total) * 100) : 0,
  );
  readonly waiting = computed(() => this.counts().queued + this.counts().active);
  readonly elapsed = computed(() => {
    const start = this.queue.startedAt();
    return start ? clock(Math.max(0, this.now() - start)) : '0:00';
  });
  readonly tokens = computed(() => usageTotal(this.queue.usage()));
  readonly measured = computed(() => this.tokens() > 0);
  readonly list = computed(() =>
    this.queue
      .order()
      .map((id) => ({ row: this.queue.rows()[id], name: this.store.find(id)?.name ?? id }))
      .filter((entry): entry is { row: AiBatchRow; name: string } => !!entry.row),
  );
  /** The PDF in progress, if any. */
  readonly current = computed(() => this.list().find((entry) => AI_BATCH_ACTIVE_PHASES.includes(entry.row.phase)) ?? null);
  readonly retryCount = computed(() => this.counts().failed + this.counts().cancelled);
  readonly provider = computed(() => providerName(this.helper.provider()));
  readonly readyCount = computed(() => this.list().filter((e) => e.row.phase === 'ready').length);
  readonly freeCount = computed(() => this.list().filter((e) => e.row.phase === 'free').length);
  readonly partialCount = computed(() => this.list().filter((e) => e.row.phase === 'partial').length);
  readonly offline = computed(() => this.helper.connection() === 'offline');
  readonly selectedId = computed(() => {
    const id = this.queue.detailsId();
    return !this.queue.detailsFollow() && id && this.queue.rows()[id] ? id : null;
  });

  stateOf(row: AiBatchRow): { tone: string; key: string } {
    const tone =
      row.phase === 'ready' || row.phase === 'free'
        ? 'on'
        : row.phase === 'failed'
          ? 'err'
          : row.phase === 'partial'
            ? 'warn'
            : AI_BATCH_ACTIVE_PHASES.includes(row.phase)
              ? 'on'
              : '';
    return { tone, key: `batch.ai.state.${row.phase}` };
  }

  stateParams(row: AiBatchRow): Record<string, number> {
    return { n: row.attempt, placed: row.placed, total: row.total };
  }

  rowNote(row: AiBatchRow): string {
    if (row.phase === 'free') {
      return this.i18n.translate('batch.ai.details.noSpend');
    }
    if (row.phase === 'failed' && row.error) {
      return this.i18n.translate(`ai.error.${row.error.code}.title`, { provider: providerName(row.provider || 'claude') });
    }
    const tokens = usageTotal(row.usage);
    return tokens ? this.i18n.translate('batch.ai.tokens', { count: tokens.toLocaleString(this.i18n.language()) }) : '';
  }

  requestPause(): void {
    this.pausing.set(true);
    this.queue.requestPause();
  }

  resume(): void {
    this.pausing.set(false);
    this.queue.resume();
  }

  cancel(): void {
    this.pausing.set(false);
    this.queue.cancel();
  }

  /** «Cerrar»: hides the panel; with a finished run it also forgets it, while a live run keeps going. */
  close(): void {
    this.queue.closePanel();
  }

  dismiss(): void {
    this.pausing.set(false);
    this.queue.reset();
  }

  retryFailed(): void {
    this.queue.retryFailed();
  }

  toggleDetails(): void {
    this.queue.detailsOpen() ? this.queue.closeDetails() : this.queue.openDetails(this.queue.detailsId());
  }
}

function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
