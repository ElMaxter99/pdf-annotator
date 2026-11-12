import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { TranslationService } from '../../../../i18n/translation.service';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { ToastService } from '../../../../services/toast.service';
import {
  estimateTokens,
  sumUsage,
  usageTotal,
  type AiUsage,
} from '../../../../utils/ai-proposal.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

export type AiDetailsTab = 'summary' | 'steps' | 'sent' | 'usage';

interface TimelineItem {
  state: 'done' | 'cur' | 'err' | 'wait';
  title: string;
  sub: string;
  at: number | null;
}

/** «Ver detalles» of «Copiar y adaptar con IA»: what is sent, the steps and the real usage (only what the provider reports). */
@Component({
  selector: 'app-ai-details',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './ai-details.component.html',
})
export class AiDetailsComponent implements OnInit, OnDestroy {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  @ViewChild('closeBtn', { static: true }) closeBtn?: ElementRef<HTMLButtonElement>;

  private readonly i18n = inject(TranslationService);
  private readonly toast = inject(ToastService);
  readonly tab = signal<AiDetailsTab>('summary');
  readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;
  private opener: Element | null = null;

  readonly tabs: AiDetailsTab[] = ['summary', 'steps', 'sent', 'usage'];

  ngOnInit(): void {
    this.opener = typeof document === 'undefined' ? null : document.activeElement;
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

  close(): void {
    this.vm.setAiDetailsOpen(false);
  }

  providerName(): string {
    const provider = this.vm.ai()?.provider;
    return provider === 'copilot' ? 'Copilot' : provider === 'fake' ? 'Simulado' : 'Claude';
  }

  /** Real usage is known only for Claude; with anything else we show what we know and say so. */
  measured(): boolean {
    return this.vm.ai()?.provider === 'claude';
  }

  loading(): boolean {
    return this.vm.ai()?.phase === 'loading';
  }

  elapsed(): string {
    const s = this.vm.ai();
    if (!s) {
      return '0:00';
    }
    const end = s.endedAt ?? this.now();
    return this.clock(end - s.startedAt);
  }

  clock(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  statusText(): string {
    const s = this.vm.ai();
    const time = this.elapsed();
    if (!s || s.phase === 'loading') {
      return this.t('ai.details.status.running', { time });
    }
    if (s.phase === 'error') {
      return this.t('ai.details.status.error', { time });
    }
    return this.t(s.phase === 'empty' ? 'ai.details.status.doneEmpty' : 'ai.details.status.done', { time });
  }

  statusClass(): string {
    const phase = this.vm.ai()?.phase;
    return phase === 'error' ? 'err' : phase === 'empty' ? 'warn' : '';
  }

  modelName(): string {
    const s = this.vm.ai();
    return (s?.details?.model || this.vm.aiHelper.models()[s?.provider ?? 'claude'] || '').trim() || this.t('ai.details.modelDefault');
  }

  diagnosis(): string | null {
    const d = this.vm.ai()?.details?.diagnosis;
    return d && (d !== 'partial' || this.vm.ai()?.phase === 'ready') ? d : null;
  }

  diagnosisIsError(): boolean {
    return this.vm.ai()?.phase === 'empty';
  }

  usage(): AiUsage | null {
    const s = this.vm.ai();
    if (!s) {
      return null;
    }
    return sumUsage(s.details?.attempts.map((a) => a.usage) ?? []) ?? s.usage;
  }

  total(): number {
    return usageTotal(this.usage());
  }

  share(part: number): number {
    const total = this.total();
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }

  costUsd(): number | null {
    const costs = (this.vm.ai()?.details?.attempts ?? []).map((a) => a.costUsd).filter((c): c is number => c !== null);
    return costs.length ? costs.reduce((a, b) => a + b, 0) : null;
  }

  requests(): number {
    return Math.max(1, this.vm.ai()?.details?.attempts.length ?? this.vm.ai()?.attempt ?? 1);
  }

  estimate(): number {
    return estimateTokens(this.vm.ai()?.sent ?? null, this.requests());
  }

  kb(bytes: number): string {
    return bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : bytes >= 1024
        ? `${Math.round(bytes / 1024)} KB`
        : `${bytes} B`;
  }

  num(n: number): string {
    return n.toLocaleString(this.i18n.language());
  }

  sentBytes(): number {
    return (this.vm.ai()?.sent?.files ?? []).filter((f) => !f.name.endsWith('.pdf')).reduce((n, f) => n + f.bytes, 0);
  }

  sentFiles() {
    return (this.vm.ai()?.sent?.files ?? []).filter((f) => !f.name.endsWith('.pdf'));
  }

  timeline(): TimelineItem[] {
    const s = this.vm.ai();
    if (!s) {
      return [];
    }
    const provider = this.providerName();
    const items: TimelineItem[] = [];
    const firstAsk = s.stageLog.find((e) => e.stage === 'asking');
    items.push({
      state: 'done',
      title: this.t('ai.details.step.prepare'),
      sub: s.sent ? this.t('ai.details.step.prepareSub', { textsA: s.sent.textsA, textsB: s.sent.textsB, pagesA: s.sent.pagesA, pagesB: s.sent.pagesB }) : '',
      at: firstAsk ? firstAsk.at : null,
    });
    const asks = s.stageLog.filter((e) => e.stage === 'asking');
    for (const ask of asks) {
      const steps = s.stepLog.filter((e) => e.attempt === ask.attempt);
      items.push({
        state: 'done',
        title: this.t('ai.details.step.send', { provider }),
        sub: this.t(steps.length || this.measured() ? 'ai.details.step.sendSub' : 'ai.details.step.sendNoSteps', { n: ask.attempt, provider }),
        at: ask.at,
      });
      for (const entry of steps) {
        const step = entry.step;
        items.push(
          step.kind === 'answer'
            ? { state: 'done', title: this.t('ai.details.step.answer', { provider }), sub: this.t('ai.details.step.answerSub', { chars: step.chars }), at: entry.at }
            : step.tool === 'Read' && step.file
              ? { state: 'done', title: this.t('ai.details.step.read', { provider, file: step.file }), sub: '', at: entry.at }
              : { state: 'done', title: this.t('ai.details.step.tool', { provider, tool: step.tool || '—' }), sub: '', at: entry.at },
        );
      }
    }
    const resolving = s.stageLog.find((e) => e.stage === 'resolving');
    if (resolving) {
      items.push({ state: 'done', title: this.t('ai.details.step.resolve'), sub: this.t('ai.details.step.resolveSub'), at: resolving.at });
    }
    const end = s.endedAt ? s.endedAt - s.startedAt : null;
    if (s.phase === 'error') {
      items.push({ state: 'err', title: this.t('ai.details.step.error'), sub: s.error?.message ?? '', at: end });
    } else if (s.phase === 'ready' || s.phase === 'empty') {
      const total = s.rows.length;
      const placed = s.rows.filter((r) => r.ok).length;
      items.push({
        state: placed === 0 ? 'err' : 'done',
        title: this.t('ai.details.step.result'),
        sub: this.t(placed === 0 ? 'ai.details.step.resultEmpty' : 'ai.details.step.resultSub', { placed, total }),
        at: end,
      });
    } else {
      const last = items[items.length - 1];
      last.state = 'cur';
      last.at = null;
      if (!resolving) {
        items.push({ state: 'wait', title: this.t('ai.details.step.resolve'), sub: this.t('ai.details.step.resolveSub'), at: null });
      }
      items.push({ state: 'wait', title: this.t('ai.details.step.show'), sub: this.t('ai.details.step.showSub'), at: null });
    }
    return items;
  }

  /** Plain-text report without any PDF content, to paste into a bug report. */
  async copyReport(): Promise<void> {
    const s = this.vm.ai();
    if (!s) {
      return;
    }
    const lines = [
      `${this.providerName()} · ${this.modelName()} · ${this.statusText()}`,
      ...this.timeline().map((i, n) => `${n + 1}. ${i.title}${i.sub ? ` — ${i.sub}` : ''}`),
      `${this.t('ai.details.sent.title')}: ${this.sentFiles().map((f) => `${f.name} (${this.kb(f.bytes)})`).join(', ') || '—'}`,
    ];
    const u = this.usage();
    if (this.measured() && u) {
      lines.push(`tokens: ${this.total()} (in ${u.input}, out ${u.output}, cache read ${u.cacheRead}, cache write ${u.cacheWrite})`);
      const cost = this.costUsd();
      if (cost !== null) {
        lines.push(`${this.t('ai.details.usage.cost')}: ${cost.toFixed(4)} USD`);
      }
    } else {
      lines.push(`${this.t('ai.details.usage.requests')}: ${this.requests()} · ~${this.estimate()} tokens (${this.t('ai.details.usage.estimateBadge')})`);
    }
    const diag = this.diagnosis();
    if (diag) {
      lines.push(this.t('ai.details.diag.' + diag, { provider: this.providerName() }));
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      this.toast.show(this.t('ai.details.copied'));
    } catch {
      this.toast.warning(this.t('ai.details.copyFailed'));
    }
  }
}
