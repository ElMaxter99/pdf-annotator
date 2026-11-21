import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { InfoTipComponent } from '../info-tip/info-tip.component';
import { AI_INSTRUCTIONS_MAX, cleanAiInstructions } from '../../utils/ai-instructions.utils';

let nextId = 0;
const SAVE_DELAY_MS = 400;

/**
 * «Instrucciones para la IA (opcional)» (A6 de la 1.17): a folded row with a short text area. Used in the popover of
 * «Trasladar con IA» (whole batch) and in the AI panel of the editor (this PDF only). Saves while typing (debounced)
 * and when it closes; the text is plain and untrusted (`cleanAiInstructions`).
 */
@Component({
  selector: 'app-ai-instructions',
  standalone: true,
  imports: [TranslationPipe, InfoTipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ai-instr" [class.ai-instr--open]="open()">
      <div class="ai-instr__row">
        <button
          type="button"
          class="ai-instr__toggle"
          [attr.aria-expanded]="open()"
          [attr.aria-controls]="bodyId"
          (click)="toggle()"
          [attr.data-testid]="testId() + '-toggle'"
        >
          <span>{{ 'ai.instructions.title' | t }}</span>
          @if (hasText()) {
            <span class="ai-instr__on" [attr.data-testid]="testId() + '-on'">· {{ 'ai.instructions.on' | t }}</span>
          } @else {
            <span class="ai-instr__opt">{{ 'ai.instructions.optional' | t }}</span>
          }
          <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
        </button>
        <app-info-tip [text]="(scope() === 'pdf' ? 'ai.instructions.hintPdf' : 'ai.instructions.hintBatch') | t" />
      </div>
      @if (open()) {
        <div class="ai-instr__body" [id]="bodyId">
          <textarea
            class="ai-instr__text"
            rows="3"
            [attr.maxlength]="max"
            [value]="draft()"
            [attr.aria-label]="'ai.instructions.title' | t"
            [attr.placeholder]="'ai.instructions.placeholder' | t"
            (input)="onInput($any($event.target).value)"
            (blur)="flush()"
            [attr.data-testid]="testId()"
          ></textarea>
          <div class="ai-instr__foot">
            @if (scope() === 'pdf') {
              <small class="ai-instr__src" [attr.data-testid]="testId() + '-source'">
                {{ (inherited() ? 'ai.instructions.fromBatch' : 'ai.instructions.ownPdf') | t }}
              </small>
              @if (!inherited()) {
                <button type="button" class="ai-instr__link" (click)="useBatch()" [attr.data-testid]="testId() + '-reset'">
                  {{ 'ai.instructions.useBatch' | t }}
                </button>
              }
            }
            <small class="ai-instr__count" aria-live="polite">{{ draft().length }}/{{ max }}</small>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .ai-instr__row {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .ai-instr__toggle {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        min-width: 0;
        padding: 2px 0;
        border: 0;
        background: none;
        color: var(--accent-text);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .ai-instr__toggle:hover span:first-child {
        text-decoration: underline;
      }
      .ai-instr__toggle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
        border-radius: 4px;
      }
      .ai-instr__opt {
        color: var(--muted);
        font-weight: 400;
      }
      .ai-instr__on {
        color: var(--text);
        font-weight: 600;
      }
      .ai-instr__body {
        display: grid;
        gap: 4px;
        margin-top: 6px;
      }
      .ai-instr__text {
        width: 100%;
        min-height: 64px;
        max-height: 160px;
        box-sizing: border-box;
        resize: vertical;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid var(--input-border);
        background: var(--input-bg);
        color: var(--text);
        font: inherit;
        font-size: 0.82rem;
        line-height: 1.35;
      }
      .ai-instr__text::placeholder {
        color: var(--muted);
      }
      .ai-instr__text:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 1px;
      }
      :host-context(:root.theme-light) .ai-instr__text {
        background: var(--panel);
        border-color: var(--light-border-strong);
      }
      .ai-instr__foot {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: var(--muted);
      }
      .ai-instr__count {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
      }
      .ai-instr__link {
        padding: 0;
        border: 0;
        background: none;
        color: var(--accent-text);
        font: inherit;
        cursor: pointer;
        text-decoration: underline;
      }
    `,
  ],
})
export class AiInstructionsComponent implements OnDestroy {
  /** Saved text (batch or PDF); the box shows it until the person types. */
  readonly value = input('');
  /** `batch` = popover of the batch; `pdf` = editor, only this PDF. */
  readonly scope = input<'batch' | 'pdf'>('batch');
  /** Only for `pdf`: the PDF has no text of its own and shows the batch one. */
  readonly inherited = input(false);
  readonly testId = input('ai-instructions');
  /** What the text belongs to (the PDF id in the editor): a pending save goes to the one it was typed for. */
  readonly key = input('');
  /**
   * Keeps the new text (already cleaned). A callback rather than an output: the last save can happen while the
   * box is being destroyed (popover or panel closed), when an output can no longer emit.
   */
  readonly commit = input<(text: string, key: string) => void>(() => undefined);
  /** Only for `pdf`: «Usar las del lote». */
  readonly reset = output<void>();

  readonly max = AI_INSTRUCTIONS_MAX;
  readonly bodyId = `ai-instr-${++nextId}`;
  readonly open = signal(false);
  readonly draft = signal('');
  readonly hasText = computed(() => cleanAiInstructions(this.draft()).length > 0);
  private dirty = false;
  private dirtyKey = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Follows the saved text while the person is not typing (another PDF, «Usar las del lote», a reload).
    effect(() => {
      const value = this.value();
      const key = this.key();
      untracked(() => {
        // Another PDF: what was typed for the previous one is saved there first.
        if (this.dirty && this.dirtyKey !== key) {
          this.flush();
        }
        // Same text once cleaned (spaces or a line break still being typed): keep what is on screen.
        if (!this.dirty && cleanAiInstructions(this.draft()) !== value) {
          this.draft.set(value);
        }
      });
    });
  }

  toggle(): void {
    if (this.open()) {
      this.flush();
    }
    this.open.update((open) => !open);
  }

  onInput(text: string): void {
    if (this.dirty && this.dirtyKey !== this.key()) {
      this.flush();
    }
    this.draft.set(text.slice(0, AI_INSTRUCTIONS_MAX));
    this.dirty = true;
    this.dirtyKey = this.key();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    this.commit()(cleanAiInstructions(this.draft()), this.dirtyKey);
  }

  useBatch(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.dirty = false;
    this.reset.emit();
  }

  ngOnDestroy(): void {
    this.flush();
  }
}
