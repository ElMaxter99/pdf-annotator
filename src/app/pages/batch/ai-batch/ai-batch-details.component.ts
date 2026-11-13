import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import { AiBatchService, type AiBatchRow } from '../../../services/ai-batch.service';
import { AiHelperService } from '../../../services/ai-helper.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';
import { AI_BATCH_ACTIVE_PHASES } from '../../../utils/ai-batch.utils';
import { buildBatchTimeline, isFinished } from '../../../utils/ai-batch-details.utils';
import { estimateTokens, sumUsage, usageTotal } from '../../../utils/ai-proposal.utils';
import { providerName } from './ai-batch-button.component';

export type BatchDetailsTab = 'summary' | 'steps' | 'sent' | 'usage';

/** «Qué está haciendo la IA · lote»: the single-PDF «Ver detalles» for each PDF of the queue, plus the whole-batch usage. */
@Component({
  selector: 'app-ai-batch-details',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './ai-batch-details.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchDetailsComponent implements OnInit, OnDestroy {
  readonly queue = inject(AiBatchService);
  readonly helper = inject(AiHelperService);
  private readonly store = inject(BatchStoreService);
  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);

  @ViewChild('closeBtn', { static: true }) closeBtn?: ElementRef<HTMLButtonElement>;

  readonly tabs: BatchDetailsTab[] = ['summary', 'steps', 'sent', 'usage'];
  readonly tab = signal<BatchDetailsTab>('summary');
  readonly follow = signal(true);
  readonly picked = signal<string | null>(null);
  readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  private opener: Element | null = null;

  /** Rows in queue order, with the file name. */
  readonly list = computed(() =>
    this.queue
      .order()
      .map((id) => ({ row: this.queue.rows()[id], name: this.store.find(id)?.name ?? id }))
      .filter((entry): entry is { row: AiBatchRow; name: string } => !!entry.row),
  );
  /** The PDF in progress, or the last one that did anything. */
  private readonly current = computed(() => {
    const rows = this.list().map((entry) => entry.row);
    return (
      rows.find((row) => AI_BATCH_ACTIVE_PHASES.includes(row.phase)) ??
      [...rows].reverse().find((row) => row.phase !== 'queued') ??
      rows[0] ??
      null
    );
  });
  readonly selectedId = computed(() => {
    const wanted = this.follow() ? null : this.picked() ?? this.queue.detailsId();
    return wanted && this.queue.rows()[wanted] ? wanted : this.current()?.id ?? null;
  });
  readonly row = computed(() => {
    const id = this.selectedId();
    return id ? this.queue.rows()[id] ?? null : null;
  });
  readonly name = computed(() => (this.row() ? this.store.find(this.row()!.id)?.name ?? '' : ''));
  readonly position = computed(() => {
    const id = this.selectedId();
    return { n: id ? this.queue.order().indexOf(id) + 1 : 0, total: this.queue.order().length };
  });
  readonly timeline = computed(() => {
    const row = this.row();
    return row ? buildBatchTimeline(row, (key, params) => this.i18n.translate(key, params), this.providerLabel()) : [];
  });
  readonly usage = computed(() => this.row()?.usage ?? sumUsage(this.row()?.details?.attempts.map((a) => a.usage) ?? []));
  readonly total = computed(() => usageTotal(this.usage()));
  readonly measured = computed(() => this.total() > 0);
  readonly freeCount = computed(() => this.list().filter((entry) => entry.row.phase === 'free').length);
  readonly batchTokens = computed(() => usageTotal(this.queue.usage()));
  readonly credits = computed(() => {
    const v = (this.row()?.details?.attempts ?? []).map((a) => a.aiCredits).filter((c): c is number => c !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  });
  readonly sentFiles = computed(() => (this.row()?.sent?.files ?? []).filter((f) => !f.name.endsWith('.pdf')));

  ngOnInit(): void {
    this.opener = typeof document === 'undefined' ? null : document.activeElement;
    const id = this.queue.detailsId();
    if (id) {
      this.follow.set(false);
      this.picked.set(id);
    }
    this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    queueMicrotask(() => this.closeBtn?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
    (this.opener as HTMLElement | null)?.focus?.();
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.translate(key, params);
  }

  providerLabel(): string {
    const row = this.row();
    return row?.provider === 'adjust' ? this.t('ai.review.adjustProvider') : providerName(row?.provider || this.helper.provider());
  }

  modelName(): string {
    const row = this.row();
    return (row?.details?.model || this.helper.models()[row?.provider ?? 'claude'] || '').trim() || this.t('ai.details.modelDefault');
  }

  /** `ai`: the AI ran for this PDF; otherwise the text-based adjustment solved it or has not asked yet. */
  usedAi(): boolean {
    const row = this.row();
    return !!row && (row.provider !== 'adjust' || !!row.stageLog.length);
  }

  active(): boolean {
    const row = this.row();
    return !!row && AI_BATCH_ACTIVE_PHASES.includes(row.phase);
  }

  elapsed(): string {
    const row = this.row();
    if (!row || row.t0 === null) {
      return '0:00';
    }
    return this.clock((row.endedAt ?? this.now()) - row.t0);
  }

  clock(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  runElapsed(): string {
    const start = this.queue.startedAt();
    return start ? this.clock(this.now() - start) : '0:00';
  }

  statusKey(): string {
    const row = this.row();
    return row ? `batch.ai.state.${row.phase}` : 'batch.ai.state.queued';
  }

  statusParams(): Record<string, number> {
    const row = this.row();
    return { n: row?.attempt ?? 1, placed: row?.placed ?? 0, total: row?.total ?? 0 };
  }

  statusClass(): string {
    const row = this.row();
    return row?.phase === 'failed' ? 'err' : row?.phase === 'partial' ? 'warn' : '';
  }

  num(n: number): string {
    return n.toLocaleString(this.i18n.language());
  }

  share(part: number): number {
    return this.total() > 0 ? Math.round((part / this.total()) * 100) : 0;
  }

  kb(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
  }

  requests(): number {
    return Math.max(1, this.row()?.details?.attempts.length ?? this.row()?.attempt ?? 1);
  }

  estimate(): number {
    return estimateTokens(this.row()?.sent ?? null, this.requests());
  }

  stateOf(row: AiBatchRow): { tone: string; key: string } {
    const tone = row.phase === 'ready' || row.phase === 'free' ? 'on' : row.phase === 'failed' ? 'err' : row.phase === 'partial' ? 'warn' : AI_BATCH_ACTIVE_PHASES.includes(row.phase) ? 'on' : '';
    return { tone, key: `batch.ai.state.${row.phase}` };
  }

  stateParams(row: AiBatchRow): Record<string, number> {
    return { n: row.attempt, placed: row.placed, total: row.total };
  }

  rowNote(row: AiBatchRow): string {
    if (row.phase === 'free') {
      return this.t('batch.ai.details.noSpend');
    }
    if (row.phase === 'failed' && row.error) {
      return this.t(`ai.error.${row.error.code}.title`, { provider: providerName(row.provider || 'claude') });
    }
    const tokens = usageTotal(row.usage);
    return tokens ? this.t('batch.ai.tokens', { count: this.num(tokens) }) : '—';
  }

  pick(id: string): void {
    this.follow.set(false);
    this.picked.set(id);
  }

  close(): void {
    this.queue.closeDetails();
  }

  cancelThis(): void {
    this.queue.skipCurrent();
  }

  trapFocus(event: KeyboardEvent, root: HTMLElement): void {
    const items = Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
    );
    if (!items.length) {
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === root)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  tabKey(event: KeyboardEvent, root: HTMLElement): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const next = this.tabs[(this.tabs.indexOf(this.tab()) + step + this.tabs.length) % this.tabs.length];
    this.tab.set(next);
    queueMicrotask(() => root.querySelector<HTMLElement>(`[data-testid="ai-bdetails-tab-${next}"]`)?.focus());
  }

  private async write(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fallback below */
    }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  private reportOf(row: AiBatchRow, name: string): string[] {
    const provider = row.provider === 'adjust' ? this.t('ai.review.adjustProvider') : providerName(row.provider || 'claude');
    const items = buildBatchTimeline(row, (key, params) => this.i18n.translate(key, params), provider);
    const lines = [`${name} · ${provider} · ${this.t(`batch.ai.state.${row.phase}`, this.stateParams(row))}`];
    items.forEach((item, n) => lines.push(`${n + 1}. ${item.title}${item.sub && item.state !== 'err' ? ` — ${item.sub}` : ''}`));
    if (row.error) {
      lines.push(`error: ${row.error.code}`);
    }
    const tokens = usageTotal(row.usage);
    if (tokens) {
      lines.push(`tokens: ${tokens}`);
    }
    return lines;
  }

  /** Plain text without any PDF content: this PDF, or every PDF of the run. */
  async copy(all: boolean): Promise<void> {
    const entries = all ? this.list() : this.list().filter((entry) => entry.row.id === this.selectedId());
    const lines = entries.flatMap((entry, i) => [...(i ? [''] : []), ...this.reportOf(entry.row, entry.name)]);
    if (all) {
      const requests = this.t('batch.ai.requests', { sent: this.queue.requests() });
      lines.push('', this.batchTokens() > 0 ? `${this.t('batch.ai.tokens', { count: this.num(this.batchTokens()) })} · ${requests}` : requests);
    }
    if (await this.write(lines.join('\n'))) {
      this.toast.show(this.t('ai.details.copied'));
    } else {
      this.toast.warning(this.t('ai.details.copyFailed'));
    }
  }

  finished(row: AiBatchRow): boolean {
    return isFinished(row);
  }
}
