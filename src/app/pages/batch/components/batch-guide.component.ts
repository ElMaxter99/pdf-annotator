import { Component, Input, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../../../i18n/translation.service';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import type { WorkspacePageComponent } from '../../workspace/workspace.page';

/** Band over the A/B editor: why you are here, the three steps and what to do now. */
@Component({
  selector: 'app-batch-guide',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (vm.batchGuideOpen()) {
      <section class="guide" id="batch-guide" [attr.aria-label]="'batch.editor.guideTitle' | t">
        <div class="guide__main" id="batch-now">
          <span class="lab">{{ 'batch.editor.nowLabel' | t }}</span>
          <b>{{ nowTitle() }}</b>
          <span class="guide__desc">{{ nowText() }}</span>
          <span class="guide__spacer"></span>
          <span class="guide__dots" aria-hidden="true">
            @for (s of steps; track s) { <i [class.done]="s < current()" [class.on]="s === current()"></i> }
          </span>
          <span class="guide__step">{{ 'batch.editor.stepOf' | t : { n: current() } }}</span>
          <button type="button" class="guide__ico" id="batch-guide-info" (click)="why.set(!why())"
            [attr.aria-expanded]="why()" [attr.aria-label]="'batch.editor.guideInfo' | t" [attr.title]="'batch.editor.guideInfo' | t">ⓘ</button>
          <button type="button" class="guide__ico" id="batch-guide-fold" (click)="vm.batchSetGuideOpen(false)"
            [attr.aria-label]="'batch.editor.guideHide' | t" [attr.title]="'batch.editor.guideHide' | t">✕</button>
        </div>
        @if (why()) { <p class="guide__why" id="batch-guide-why">{{ 'batch.editor.guideWhy' | t }}</p> }
      </section>
    } @else {
      <section class="guide guide--slim" id="batch-guide">
        <span class="lab">{{ 'batch.editor.nowLabel' | t }}</span>
        <b>{{ nowTitle() }}</b>
        <span class="guide__spacer"></span>
        <button type="button" class="btn btn--ghost btn--sm" id="batch-guide-show" (click)="vm.batchSetGuideOpen(true)">{{ 'batch.editor.guideShow' | t }}</button>
      </section>
    }
  `,
  styles: `
    :host { display: block; flex: 0 0 100%; min-width: 0; }
    .guide { display: flex; flex-direction: column; gap: 6px; background: color-mix(in srgb, var(--accent) 14%, var(--panel)); border: 1px solid var(--accent); border-radius: 14px; padding: 8px 14px; color: var(--text); }
    .guide--slim { flex-direction: row; align-items: center; gap: 10px; }
    .guide__main { display: flex; align-items: center; gap: 12px; min-width: 0; b { font-size: 15px; white-space: nowrap; } }
    .guide__spacer { flex: 1; }
    .guide__desc { color: var(--muted); font-size: 13px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .guide__dots { display: flex; gap: 5px; i { width: 9px; height: 9px; border-radius: 50%; background: color-mix(in srgb, var(--text) 22%, transparent); &.done { background: var(--accent); } &.on { background: transparent; border: 2px solid var(--accent); } } }
    .guide__step { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .guide__ico { border: 0; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 14px; border-radius: 8px; padding: 2px 6px; &:hover { color: var(--text); } &:focus-visible { outline: 2px solid var(--text); } }
    .guide__why { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .lab { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
    .btn { font: inherit; font-size: 13px; font-weight: 600; border-radius: 999px; padding: 4px 14px; cursor: pointer; background: transparent; color: var(--text); border: 1px solid var(--line, rgba(255,255,255,.25)); }
    :host-context(:root.theme-light) .guide { background: #e6f7f4; border-color: #0b7a70; }
    :host-context(:root.theme-light) .lab { color: #0b7a70; }
    :host-context(:root.theme-light) .guide__dots i.done { background: #0b7a70; }
    :host-context(:root.theme-light) .guide__dots i.on { border-color: #0b7a70; }
  `,
})
export class BatchGuideComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  private readonly i18n = inject(TranslationService);
  readonly steps = [1, 2, 3];
  readonly why = signal(false);
  readonly current = computed(() => Math.max(1, this.vm.batchStep()));

  nowTitle() {
    const vm = this.vm;
    const step = vm.batchStep();
    if (step === 2) return this.i18n.translate('batch.editor.now2t', { name: vm.batchUnusedA()[0]?.name ?? '' });
    return this.i18n.translate(`batch.editor.now${step}t`);
  }

  nowText() {
    const vm = this.vm;
    const step = vm.batchStep();
    if (step === 1 && !vm.batchHasAFields()) return this.i18n.translate('batch.editor.now1dEmpty');
    return this.i18n.translate(`batch.editor.now${step}d`, { count: vm.batchItem()?.template?.reduce((n, p) => n + p.fields.length, 0) ?? 0 });
  }
}
