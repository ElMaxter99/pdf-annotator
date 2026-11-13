import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { AiBatchService } from '../../../services/ai-batch.service';
import { AiHelperService } from '../../../services/ai-helper.service';
import { usageTotal } from '../../../utils/ai-proposal.utils';

/** The queue in progress: counter, time, consumption, pause and cancel, stop reasons and the final summary. */
@Component({
  selector: 'app-ai-batch-status',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './ai-batch-status.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchStatusComponent implements OnInit, OnDestroy {
  readonly queue = inject(AiBatchService);
  private readonly helper = inject(AiHelperService);
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
  readonly reviewable = computed(() => this.counts().done);
  readonly freeCount = computed(
    () => Object.values(this.queue.rows()).filter((row) => row.phase === 'free').length,
  );
  readonly readyCount = computed(
    () => Object.values(this.queue.rows()).filter((row) => row.phase === 'ready').length,
  );
  readonly partialCount = computed(
    () => Object.values(this.queue.rows()).filter((row) => row.phase === 'partial').length,
  );

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

  close(): void {
    this.pausing.set(false);
    this.queue.reset();
  }

  retryFailed(): void {
    this.queue.retryFailed();
  }
}

function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
