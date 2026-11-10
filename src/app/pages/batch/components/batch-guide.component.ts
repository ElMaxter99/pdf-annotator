import { Component, Input, computed, inject } from '@angular/core';
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
        <div class="guide__main">
          <ol class="guide__steps">
            @for (s of steps; track s) {
              <li class="gstep" [class.done]="s < current()" [class.on]="s === current()">
                <span class="gn">{{ s < current() ? '✓' : s }}</span>
                <span><b>{{ 'batch.editor.g' + s + 't' | t }}</b><small>{{ 'batch.editor.g' + s + 'd' | t }}</small></span>
              </li>
              @if (s < 3) { <li class="gline" [class.done]="s < current()" aria-hidden="true"></li> }
            }
          </ol>
          <p class="guide__why">{{ 'batch.editor.guideWhy' | t }}</p>
        </div>
        <div class="guide__now" id="batch-now">
          <span class="lab">{{ 'batch.editor.nowLabel' | t }}</span>
          <b>{{ nowTitle() }}</b>
          <span class="guide__desc">{{ nowText() }}</span>
        </div>
        <button type="button" class="guide__fold" id="batch-guide-fold" (click)="vm.batchSetGuideOpen(false)"
          [attr.aria-label]="'batch.editor.guideHide' | t" [attr.title]="'batch.editor.guideHide' | t">▴</button>
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
    .guide { position: relative; display: flex; gap: 18px; align-items: stretch; background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, var(--panel)), var(--panel)); border: 1px solid var(--accent); border-radius: 18px; padding: 14px 18px; color: var(--text); }
    .guide--slim { align-items: center; padding: 8px 14px; gap: 10px; }
    .guide__spacer { flex: 1; }
    .guide__main { flex: 1.5; display: flex; flex-direction: column; gap: 10px; justify-content: center; min-width: 0; }
    .guide__steps { list-style: none; margin: 0; padding: 0; display: flex; align-items: center; gap: 6px; }
    .gstep { display: flex; gap: 10px; align-items: center; flex: 1; min-width: 0; }
    .gstep small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; }
    .gn { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; background: color-mix(in srgb, var(--text) 8%, transparent); border: 1px solid var(--line, rgba(255,255,255,.2)); flex: none; }
    .gstep.done .gn { background: var(--accent); color: var(--bg); border-color: var(--accent); }
    .gstep.on .gn { border: 2px solid var(--accent); color: var(--accent); }
    .gline { height: 2px; flex: 0 0 26px; background: var(--line, rgba(255,255,255,.2)); &.done { background: var(--accent); } }
    .guide__why { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .guide__now { flex: 1; display: flex; flex-direction: column; gap: 6px; justify-content: center; padding-left: 18px; border-left: 1px solid var(--line, rgba(255,255,255,.2)); min-width: 0; b { font-size: 16px; } }
    .guide__desc { color: var(--muted); font-size: 13px; }
    .guide__fold { position: absolute; top: 6px; right: 8px; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; border-radius: 8px; padding: 2px 6px; &:focus-visible { outline: 2px solid var(--text); } }
    .lab { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
    .btn { font: inherit; font-size: 13px; font-weight: 600; border-radius: 999px; padding: 4px 14px; cursor: pointer; background: transparent; color: var(--text); border: 1px solid var(--line, rgba(255,255,255,.25)); }
    :host-context(:root.theme-light) .guide { background: linear-gradient(135deg, #e6f7f4, #fff); border-color: #0b7a70; }
    :host-context(:root.theme-light) .gstep.done .gn { background: #0b7a70; color: #fff; border-color: #0b7a70; }
    :host-context(:root.theme-light) .gstep.on .gn, :host-context(:root.theme-light) .lab { color: #0b7a70; border-color: #0b7a70; }
  `,
})
export class BatchGuideComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  private readonly i18n = inject(TranslationService);
  readonly steps = [1, 2, 3];
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
    return this.i18n.translate(`batch.editor.now${step}d`, { count: vm.batchItem()?.template?.reduce((n, p) => n + p.fields.length, 0) ?? 0 });
  }
}
