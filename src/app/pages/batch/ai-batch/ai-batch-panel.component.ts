import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { AiBatchService, rowCredits, type AiBatchRow } from '../../../services/ai-batch.service';
import { AiHelperService } from '../../../services/ai-helper.service';
import { OptionsService } from '../../../services/options.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { formatCredits, usageBilled } from '../../../utils/ai-proposal.utils';
import { AI_BATCH_ACTIVE_PHASES } from '../../../utils/ai-batch.utils';
import { AiBatchDetailsComponent } from './ai-batch-details.component';
import { InfoTipComponent } from '../../../components/info-tip/info-tip.component';
import { providerName } from './ai-batch-button.component';

/**
 * «Traslado con IA»: one non-modal side panel for the whole run (progress, failures, per-PDF list and, on demand, the
 * details accordion). It replaces the old status bar, the toasts and the full-screen «Qué está haciendo la IA».
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-batch-panel',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiBatchDetailsComponent, InfoTipComponent],
  templateUrl: './ai-batch-panel.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchPanelComponent implements OnInit, OnDestroy {
  readonly queue = inject(AiBatchService);
  readonly helper = inject(AiHelperService);
  readonly options = inject(OptionsService);
  private readonly store = inject(BatchStoreService);
  private readonly i18n = inject(TranslationService);
  @Output() readonly reviewFirst = new EventEmitter<void>();

  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly pausing = signal(false);
  /** What the summary at the foot talks about: the whole batch, the PDF in progress or a PDF the person picked. */
  readonly scope = signal<'all' | 'follow' | 'pick'>('all');
  readonly filterKeys = ['all', 'review', 'warn', 'failed'] as const;
  readonly filter = signal<(typeof this.filterKeys)[number]>('all');

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
    if (this.queue.detailsOpen()) {
      this.queue.closeDetails(); // first Esc goes back from the details to the list
      return;
    }
    if (this.scope() === 'pick') {
      this.release(); // first Esc lets go of the chosen PDF; the next one closes the panel
      return;
    }
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
  /** Tiempo de la tanda: corre mientras trabaja y se para al terminar el último PDF (no sigue contando). */
  readonly elapsed = computed(() => {
    const start = this.queue.startedAt();
    if (!start) return '0:00';
    const ends = Object.values(this.queue.rows()).map((row) => row.endedAt ?? 0);
    const end = this.queue.run() === 'done' && ends.length ? Math.max(start, ...ends) : this.now();
    return clock(Math.max(0, end - start));
  });
  readonly tokens = computed(() => usageBilled(this.queue.usage()));
  readonly cacheRead = computed(() => this.queue.usage()?.cacheRead ?? 0);
  readonly measured = computed(() => this.tokens() > 0);
  /** Copilot cobra en créditos de IA: con él nunca se enseñan tokens. */
  readonly isCopilot = this.queue.isCopilot;
  /** Créditos de IA que informa el propio Copilot (≈), en vivo y al terminar cada petición. */
  readonly credits = computed(() => Math.round((this.queue.credits() ?? 0) * 100) / 100);
  creditsText(value: number): string {
    return `≈ ${formatCredits(value, this.i18n.language())}`;
  }
  readonly list = computed(() =>
    this.queue
      .order()
      .map((id) => ({ row: this.queue.rows()[id], name: this.store.find(id)?.name ?? id }))
      .filter((entry): entry is { row: AiBatchRow; name: string } => !!entry.row),
  );
  /** The PDF in progress, if any. */
  readonly current = computed(() => this.list().find((entry) => AI_BATCH_ACTIVE_PHASES.includes(entry.row.phase)) ?? null);
  /** The PDF in progress or, when nothing runs, the last one that did something. */
  readonly followed = computed(() => {
    const list = this.list();
    return this.current() ?? [...list].reverse().find((entry) => entry.row.phase !== 'queued') ?? list[0] ?? null;
  });
  readonly picked = computed(() => {
    const id = this.queue.detailsId();
    return this.scope() === 'pick' && id ? this.list().find((entry) => entry.row.id === id) ?? null : null;
  });
  /** The PDF the summary talks about (`null` = the whole batch). */
  readonly subject = computed(() => (this.scope() === 'pick' ? this.picked() : this.scope() === 'follow' ? this.followed() : null));
  readonly longList = computed(() => this.list().length > 10);
  readonly filterCounts = computed(() => {
    const phases = this.list().map((entry) => entry.row.phase);
    return {
      all: phases.length,
      review: phases.filter((p) => p === 'ready' || p === 'partial' || p === 'free').length,
      warn: phases.filter((p) => p === 'partial').length,
      failed: phases.filter((p) => p === 'failed' || p === 'cancelled').length,
    };
  });
  readonly visible = computed(() => {
    const filter = this.longList() ? this.filter() : 'all';
    return this.list().filter(({ row }) =>
      filter === 'all'
        ? true
        : filter === 'review'
          ? row.phase === 'ready' || row.phase === 'partial' || row.phase === 'free'
          : filter === 'warn'
            ? row.phase === 'partial'
            : row.phase === 'failed' || row.phase === 'cancelled',
    );
  });
  /** Summary for the chosen scope (P-72, P-73). */
  readonly sheet = computed(() => {
    this.now(); // keeps the clock ticking
    const t = (key: string, params?: Record<string, string | number>) => this.i18n.translate(key, params);
    const row = this.subject();
    const lang = this.i18n.language();
    if (!row) {
      const tokens = this.tokens();
      return {
        key: 'all',
        title: t('batch.ai.sheet.allTitle'),
        sub: t('batch.ai.sheet.allSub', { count: this.finished() }),
        // Con Copilot, la cifra que importa son sus créditos; con Claude, los tokens que cuentan (sin los leídos de caché).
        big: this.isCopilot()
          ? this.credits() > 0 ? this.creditsText(this.credits()) : null
          : tokens > 0 ? tokens.toLocaleString(lang) : null,
        bigLabel: t(this.isCopilot() ? 'batch.ai.sheet.credits' : 'batch.ai.sheet.tokens'),
        note: this.isCopilot()
          ? this.credits() > 0 ? '' : t('batch.ai.sheet.noMeasure')
          : tokens > 0
            ? this.cacheRead() > 0
              ? t('batch.ai.sheet.cacheNote', { count: this.cacheRead().toLocaleString(lang) })
              : ''
            : t('batch.ai.sheet.noMeasure'),
        error: '',
        stats: [
          { label: t('batch.ai.sheet.requests'), value: String(this.queue.requests()) },
          { label: t('batch.ai.sheet.time'), value: this.elapsed() },
          { label: t('batch.ai.sheet.free'), value: String(this.freeCount()) },
        ],
      };
    }
    const r = row.row;
    const copilot = r.provider === 'copilot';
    const rowCr = rowCredits(r) ?? 0;
    const tokens = copilot ? rowCr : usageBilled(r.usage);
    const started = r.startedAt ?? r.t0;
    const failed = r.phase === 'failed' && r.error ? t(`ai.error.${r.error.code}.title`, { provider: providerName(r.provider || 'claude') }) : '';
    return {
      key: `${this.scope()}:${r.id}`,
      title: t(this.scope() === 'follow' ? 'batch.ai.sheet.followTitle' : 'batch.ai.sheet.pdfTitle', { name: row.name }),
      sub: this.scope() === 'follow' ? t('batch.ai.sheet.followSub') : t(this.stateOf(r).key, this.stateParams(r)),
      big: r.phase === 'free' ? '0' : tokens > 0 ? (copilot ? this.creditsText(rowCr) : tokens.toLocaleString(lang)) : null,
      bigLabel: t(copilot && r.phase !== 'free' ? 'batch.ai.sheet.credits' : 'batch.ai.sheet.tokens'),
      note: r.phase === 'free' ? t('batch.ai.details.noSpend') : tokens > 0 || failed ? '' : t('batch.ai.sheet.noMeasure'),
      error: failed,
      stats: [
        { label: t('batch.ai.sheet.attempts'), value: String(r.attempt) },
        { label: t('batch.ai.sheet.time'), value: started === null ? '—' : clock(Math.max(0, (r.endedAt ?? this.now()) - started)) },
        { label: t('batch.ai.sheet.placed'), value: t('batch.ai.sheet.placedValue', { placed: r.placed, total: r.total }) },
      ],
    };
  });
  readonly retryCount = computed(() => this.counts().failed + this.counts().cancelled);
  readonly lost = computed(() => this.queue.pause()?.kind === 'lost');
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
    if (row.provider === 'copilot') {
      const credits = rowCredits(row) ?? 0;
      return credits > 0 ? `${this.creditsText(credits)} ${this.i18n.translate('batch.ai.sheet.credits')}` : '';
    }
    const tokens = usageBilled(row.usage);
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

  chooseAll(): void {
    this.scope.set('all');
  }

  chooseFollow(): void {
    this.scope.set('follow');
    this.queue.detailsId.set(null);
    this.queue.detailsFollow.set(true);
  }

  /** Clicking the chosen row again lets it go. */
  pickRow(id: string): void {
    if (this.scope() === 'pick' && this.queue.detailsId() === id) {
      this.release();
      return;
    }
    this.scope.set('pick');
    this.queue.pickDetails(id);
  }

  release(): void {
    this.scope.set('all');
    this.queue.detailsId.set(null);
    this.queue.detailsFollow.set(true);
  }

  /** ↑ ↓ move between the rows of the list. */
  onListKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    const row = (event.target as HTMLElement | null)?.closest('li');
    const next = event.key === 'ArrowDown' ? row?.nextElementSibling : row?.previousElementSibling;
    const button = next?.querySelector<HTMLElement>('button');
    if (button) {
      event.preventDefault();
      button.focus();
    }
  }

  toggleDetails(): void {
    this.queue.detailsOpen() ? this.queue.closeDetails() : this.queue.openDetails(this.queue.detailsId());
  }
}

function clock(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
