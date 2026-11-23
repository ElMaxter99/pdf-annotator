import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, ViewChild, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { InfoTipComponent } from '../../../components/info-tip/info-tip.component';
import { AiInstructionsComponent } from '../../../components/ai-instructions/ai-instructions.component';
import { AiModelSelectComponent } from '../../../components/ai-model-select/ai-model-select.component';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { AiBatchService } from '../../../services/ai-batch.service';
import { AiHelperService, type AiProvider } from '../../../services/ai-helper.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { toastKey } from './ai-batch.helpers';
import { ToastService } from '../../../services/toast.service';
import { TranslationService } from '../../../i18n/translation.service';
import { buildAiBreakdown } from '../../../utils/batch-summary.utils';
import { AI_BATCH_COPILOT_CAP, estimateAiBatch, isEligibleForAiBatch } from '../../../utils/ai-batch.utils';

/** «✦ Trasladar con IA»: the button of the panel header and its one-decision popover (estimate, provider folded under «Cambiar»). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-batch-button',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiModelSelectComponent, InfoTipComponent, AiInstructionsComponent],
  templateUrl: './ai-batch-button.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchButtonComponent {
  readonly queue = inject(AiBatchService);
  readonly helper = inject(AiHelperService);
  readonly store = inject(BatchStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  @ViewChild('startBtn') startBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('menuBtn') menuBtn?: ElementRef<HTMLButtonElement>;
  /** Focus goes into the popover as soon as it exists, so Escape and Tab work from the keyboard. */
  @ViewChild('dlg') set dialogRoot(el: ElementRef<HTMLElement> | undefined) {
    if (el) {
      queueMicrotask(() => (el.nativeElement.querySelector<HTMLElement>('[data-testid="ai-batch-start"]:not([disabled])') ?? el.nativeElement).focus());
    }
  }

  readonly cap = AI_BATCH_COPILOT_CAP;
  readonly open = signal(false);
  readonly changing = signal(false);
  /** «Más información» (ⓘ del título): peticiones, créditos y qué se envía, cerrado por defecto. */
  readonly info = signal(false);
  /** Desglose de los PDF que se quedan fuera, a demanda. */
  readonly omitOpen = signal(false);
  readonly cascade = signal(true);
  readonly remember = signal(false);

  /** Limits the run to these PDFs (the marked ones); `null` = the whole batch. */
  readonly ids = input<readonly string[] | null>(null);
  /** Own text for the trigger (a `batch.ai.draft.*` key that receives `{{count}}`); `null` = «Trasladar con IA». */
  readonly label = input<string | null>(null);
  /** Quiet look for secondary triggers (the recovery notice). */
  readonly ghost = input(false);
  /** Opens the popover upwards (button in the selection bar at the bottom). */
  readonly up = input(false);

  /** «Ver cuáles»: the panel filters by the reason a PDF stays out. */
  readonly showReason = output<'noB' | 'noFields'>();
  /** Why PDFs stay out; only shown for the whole batch (not for a marked selection). */
  readonly breakdown = computed(() => buildAiBreakdown(this.store.items()));

  readonly totalCount = computed(() => this.store.items().length);

  /** «Instrucciones para la IA» of the whole batch (A6). */
  readonly saveInstructions = (text: string): void => this.store.setBatchAiInstructions(text);

  see(reason: 'noB' | 'noFields'): void {
    this.showReason.emit(reason);
    this.closeDialog();
  }

  readonly eligible = computed(() => {
    const only = this.ids();
    const pool = only ? this.store.items().filter((item) => only.includes(item.id)) : this.store.items();
    return pool.filter(isEligibleForAiBatch);
  });
  /** Marked PDFs the run leaves out (no B, no fields or already «Listo»). */
  readonly skipped = computed(() => (this.ids() ? this.ids()!.length - this.eligible().length : 0));
  /** PDF que se quedan fuera: de los marcados, o de todo el lote. */
  readonly omitted = computed(() =>
    this.ids() ? this.skipped() : Math.max(0, this.totalCount() - this.eligible().length),
  );
  readonly withoutB = computed(() => this.store.items().filter((item) => !item.bPdf).length);
  readonly provider = this.helper.provider;
  readonly providerName = computed(() => providerName(this.provider()));
  readonly retry = computed(() => this.helper.retry()[this.provider()] !== false);
  readonly chosen = this.eligible;
  /** Saved proposals this run would overwrite, and how many carry the person's own edits. */
  readonly replacing = computed(() => {
    const saved = this.chosen().filter((item) => item.aiProposal);
    return {
      count: saved.length,
      edited: saved.filter((item) => Object.keys(item.aiProposal?.edits ?? {}).length > 0).length,
    };
  });
  readonly estimate = computed(() => estimateAiBatch(this.chosen(), this.provider(), this.retry()));
  readonly isCopilot = computed(() => this.provider() === 'copilot');
  readonly providers = computed(() =>
    (['claude', 'copilot', 'fake'] as AiProvider[]).filter((p) => p !== 'fake' || this.helper.found()['fake'] === true),
  );
  readonly busy = this.queue.busy;
  readonly modelLabel = computed(
    () => (this.helper.models()[this.provider()] ?? '').trim() || this.i18n.translate('ai.details.modelDefault'),
  );

  toggle(): void {
    if (this.open()) {
      this.closeDialog();
      return;
    }
    this.cascade.set(true);
    this.changing.set(false);
    this.info.set(false);
    this.omitOpen.set(false);
    this.open.set(true);
    void this.helper.check();
  }

  closeDialog(): void {
    if (this.open()) {
      this.open.set(false);
      queueMicrotask(() => this.menuBtn?.nativeElement.focus());
    }
  }

  /** Click outside the popover closes it (it is not modal, so the list stays usable). */
  @HostListener('document:mousedown', ['$event'])
  onOutside(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  setProvider(value: string): void {
    this.helper.setProvider(value as AiProvider);
    void this.helper.check();
  }

  /** Connected, the CLI found and enough pairs to send. */
  readonly ready = computed(() => this.helper.connection() === 'ready' && this.chosen().length > 0);

  onKeydown(event: KeyboardEvent, root: HTMLElement): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeDialog();
      return;
    }
    if (event.key !== 'Tab') {
      return;
    }
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, textarea, [href]'),
    );
    if (!focusable.length) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  start(): void {
    if (!this.open() || !this.ready()) {
      return;
    }
    if (!this.helper.consent()) {
      this.helper.acceptConsent(this.remember());
    }
    const result = this.queue.start(
      this.chosen().map((item) => item.id),
      { cascade: this.cascade() },
    );
    if (result === 'started') {
      this.open.set(false);
      return;
    }
    const key = toastKey(result);
    if (key) {
      this.toast.warning(this.i18n.translate(key));
    }
  }
}

export function providerName(provider: string): string {
  return provider === 'copilot' ? 'Copilot' : provider === 'fake' ? 'Simulado' : 'Claude';
}
