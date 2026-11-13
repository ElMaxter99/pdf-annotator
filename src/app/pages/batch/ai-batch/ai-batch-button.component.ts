import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { AiModelSelectComponent } from '../../../components/ai-model-select/ai-model-select.component';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { AiBatchService } from '../../../services/ai-batch.service';
import { AiHelperService, type AiProvider } from '../../../services/ai-helper.service';
import { BatchStoreService } from '../../../services/batch-store.service';
import { toastKey } from './ai-batch.helpers';
import { ToastService } from '../../../services/toast.service';
import { TranslationService } from '../../../i18n/translation.service';
import { AI_BATCH_COPILOT_CAP, estimateAiBatch, isEligibleForAiBatch } from '../../../utils/ai-batch.utils';

type Target = { ids: string[] | undefined; failedOnly: boolean };

/** «✦ Trasladar con IA»: the button of the panel header, its menu and the confirmation with the estimate. */
@Component({
  selector: 'app-ai-batch-button',
  standalone: true,
  imports: [CommonModule, TranslationPipe, AiModelSelectComponent],
  templateUrl: './ai-batch-button.component.html',
  styleUrl: './ai-batch.scss',
})
export class AiBatchButtonComponent {
  readonly queue = inject(AiBatchService);
  readonly helper = inject(AiHelperService);
  private readonly store = inject(BatchStoreService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  @ViewChild('startBtn') startBtn?: ElementRef<HTMLButtonElement>;
  @ViewChild('menuBtn') menuBtn?: ElementRef<HTMLButtonElement>;
  /** Focus goes into the dialog as soon as it exists, so Escape and Tab work from the keyboard. */
  @ViewChild('dlg') set dialogRoot(el: ElementRef<HTMLElement> | undefined) {
    if (el) {
      queueMicrotask(() => (el.nativeElement.querySelector<HTMLElement>('.ai-pcard--on') ?? el.nativeElement).focus());
    }
  }

  readonly cap = AI_BATCH_COPILOT_CAP;
  readonly menuOpen = signal(false);
  readonly target = signal<Target | null>(null);
  readonly cascade = signal(true);
  readonly remember = signal(false);

  readonly eligible = computed(() => this.store.items().filter(isEligibleForAiBatch));
  readonly withoutB = computed(() => this.store.items().filter((item) => !item.bPdf).length);
  readonly failedIds = computed(() =>
    Object.values(this.queue.rows())
      .filter((row) => row.phase === 'failed')
      .map((row) => row.id),
  );
  readonly provider = this.helper.provider;
  readonly providerName = computed(() => providerName(this.provider()));
  readonly retry = computed(() => this.helper.retry()[this.provider()] !== false);
  readonly chosen = computed(() => {
    const target = this.target();
    if (!target) {
      return [];
    }
    return target.ids ? this.eligible().filter((item) => target.ids?.includes(item.id)) : this.eligible();
  });
  readonly estimate = computed(() => estimateAiBatch(this.chosen(), this.provider(), this.retry()));
  readonly isCopilot = computed(() => this.provider() === 'copilot');
  readonly providers = computed(() =>
    (['claude', 'copilot', 'fake'] as AiProvider[]).filter((p) => p !== 'fake' || this.helper.found()['fake'] === true),
  );
  readonly busy = this.queue.busy;
  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    if (this.menuOpen()) {
      this.menuOpen.set(false);
      queueMicrotask(() => this.menuBtn?.nativeElement.focus());
    }
  }

  choose(failedOnly: boolean): void {
    this.menuOpen.set(false);
    this.target.set({ ids: failedOnly ? this.failedIds() : undefined, failedOnly });
    this.cascade.set(true);
    void this.helper.check();
  }

  closeDialog(): void {
    this.target.set(null);
    queueMicrotask(() => this.menuBtn?.nativeElement.focus());
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
      root.querySelectorAll<HTMLElement>('button:not([disabled]), select, input, [href]'),
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
    const target = this.target();
    if (!target || !this.ready()) {
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
      this.target.set(null);
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
