import { Component, Input, computed, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { extractPagesCollection } from '../../../utils/annotation-fields.utils';
import { parseTemplateText } from '../../../utils/template-text.utils';
import type { DiffKind } from '../../../utils/batch-diff.utils';
import type { WorkspacePageComponent } from '../../workspace/workspace.page';

/** Report of differences A → B and the confirmation to validate, over the A/B editor. */
@Component({
  selector: 'app-batch-editor-dialogs',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    @if (vm.batchDiffOpen()) {
      <div class="dialog-backdrop" (click)="vm.batchDiffOpen.set(false)">
        <div class="dialog dlg" id="batch-diff" role="dialog" aria-modal="true" [attr.aria-label]="'batch.editor.diffTitle' | t" (click)="$event.stopPropagation()">
          <div class="dialog__header">
            <h3 class="dialog__title">{{ 'batch.editor.diffTitle' | t }}</h3>
            <button type="button" class="btn" id="batch-diff-close" (click)="vm.batchDiffOpen.set(false)">✕</button>
          </div>
          <div class="dialog__body">
            <p class="dlg__sum">{{ 'batch.editor.diffSummary' | t : { fa: vm.batchDiff().fieldsA, fb: vm.batchDiff().fieldsB, pa: vm.batchDiff().pagesA, pb: vm.batchDiff().pagesB } }}</p>
            <div class="dlg__chips">
              @for (k of kinds; track k) {
                <span class="chip chip--{{ k }}">{{ 'batch.editor.kind.' + k | t }}: {{ vm.batchDiff().counts[k] }}</span>
              }
            </div>
            <table class="dlg__table">
              <tbody>
                @for (row of vm.batchDiff().rows; track $index) {
                  <tr [attr.data-kind]="row.kind">
                    <td>{{ row.key }}</td>
                    <td>A {{ row.a ? 'p.' + row.a.page : '—' }}</td>
                    <td>B {{ row.b ? 'p.' + row.b.page : '—' }}</td>
                    <td><span class="chip chip--{{ row.kind }}">{{ 'batch.editor.kind.' + row.kind | t }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    }
    @if (vm.batchTemplateDrawerOpen()) {
      <div class="dialog-backdrop dlg-drawer-bd" (click)="vm.batchTemplateDrawerOpen.set(false)">
        <aside class="dlg-drawer" id="batch-template-drawer" role="dialog" aria-modal="true" [attr.aria-label]="'batch.editor.putA' | t" (click)="$event.stopPropagation()" (keydown.escape)="vm.batchTemplateDrawerOpen.set(false)">
          <div class="dlg-drawer__head"><h3>{{ 'batch.editor.putA' | t }}</h3><button type="button" class="btn" id="batch-template-close" (click)="vm.batchTemplateDrawerOpen.set(false)" [attr.aria-label]="'batch.editor.cancel' | t">✕</button></div>
          <p class="dlg__sum">{{ 'batch.editor.putAHelp' | t }}</p>
          <div class="dlg-seg" role="tablist">
            <button type="button" role="tab" [class.on]="mode() === 'paste'" (click)="mode.set('paste')">{{ 'batch.setup.paste' | t }}</button>
            <button type="button" role="tab" [class.on]="mode() === 'file'" (click)="mode.set('file')">{{ 'batch.setup.file' | t }}</button>
          </div>
          @if (mode() === 'paste') {
            <textarea id="batch-template-text" class="dlg-ta" spellcheck="false" rows="9" [value]="draft()" (input)="draft.set($any($event.target).value)" placeholder="var pdfTemplate = { pages: [ ... ] };"></textarea>
            @if (draft().trim()) {
              @let v = check();
              <p class="dlg__sum" id="batch-template-status" role="status">@if (v.ok) { ✓ {{ 'batch.template.found' | t : { pages: v.pages, fields: v.fields } }} } @else { ⚠ {{ 'batch.template.error' | t }} }</p>
            }
          } @else {
            <label class="btn dlg-file">{{ 'batch.template.loadFile' | t }}
              <input type="file" accept="application/json,.json" hidden id="batch-template-file" (change)="onFile($event)" />
            </label>
          }
          <p class="dlg-note">🔒 {{ 'batch.editor.putANote' | t }}</p>
          <div class="dlg__actions" style="margin-top:auto">
            <button type="button" class="btn" (click)="vm.batchTemplateDrawerOpen.set(false)">{{ 'batch.editor.cancel' | t }}</button>
            @if (mode() === 'paste') {
              <button type="button" class="btn btn--primary" id="batch-template-apply" [disabled]="!check().ok" (click)="vm.batchSetTemplateText(draft())">{{ 'batch.editor.putA' | t }}</button>
            }
          </div>
        </aside>
      </div>
    }
    @if (vm.batchValidateOpen()) {
      <div class="dialog-backdrop" (click)="vm.batchValidateOpen.set(false)">
        <div class="dialog dlg" id="batch-validate" role="dialog" aria-modal="true" [attr.aria-label]="'batch.editor.validateTitle' | t" (click)="$event.stopPropagation()">
          <div class="dialog__header"><h3 class="dialog__title">{{ 'batch.editor.validateTitle' | t }}</h3></div>
          <div class="dialog__body">
            <p>{{ 'batch.editor.validateText' | t : { name: vm.batchItem()?.name ?? '' } }}</p>
            @if (vm.batchDiff().counts.missing > 0) {
              <p class="dlg__warn" id="batch-validate-warn">{{ 'batch.editor.validateMissing' | t : { count: vm.batchDiff().counts.missing } }}</p>
            }
            <div class="dlg__actions">
              <button type="button" class="btn" id="batch-validate-cancel" (click)="vm.batchValidateOpen.set(false)">{{ 'batch.editor.cancel' | t }}</button>
              <button type="button" class="btn btn--primary" id="batch-validate-confirm" (click)="vm.batchValidate()">{{ 'batch.editor.validateConfirm' | t }}</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .dlg-drawer-bd { justify-content: flex-end; align-items: stretch; padding: 0; }
    .dlg-drawer { width: min(560px, 100%); background: var(--panel); border-left: 2px solid var(--accent); padding: 22px; display: flex; flex-direction: column; gap: 12px; box-shadow: -20px 0 50px rgba(0,0,0,.5); overflow: auto; }
    .dlg-drawer__head { display: flex; align-items: center; justify-content: space-between; h3 { margin: 0; font-size: 19px; } }
    .dlg-seg { display: flex; gap: 8px; button { flex: 1; font: inherit; font-weight: 600; font-size: 13px; color: var(--text); border: 1px solid var(--line, rgba(255,255,255,.2)); background: color-mix(in srgb, var(--text) 6%, transparent); border-radius: 12px; padding: 9px 12px; cursor: pointer; &.on { border: 2px solid var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); } } }
    .dlg-ta { width: 100%; box-sizing: border-box; resize: vertical; background: var(--bg); color: var(--text); border: 1px solid var(--line, rgba(255,255,255,.2)); border-radius: 12px; padding: 12px 14px; font-family: Consolas, monospace; font-size: 12px; min-height: 160px; }
    .dlg-note { margin: 0; padding: 10px 14px; border-radius: 12px; font-size: 13px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid var(--accent); }
    .dlg-file { align-self: flex-start; cursor: pointer; }
    .dlg { width: min(720px, 100%); }
    .dlg__sum { margin: 0; color: var(--muted); font-size: 14px; }
    .dlg__chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .dlg__table { width: 100%; border-collapse: collapse; font-size: 13px; td { padding: 6px 8px; border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent); } }
    .dlg__warn { margin: 0; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, #fbbf24 14%, transparent); border: 1px solid color-mix(in srgb, #fbbf24 55%, transparent); font-size: 14px; }
    .dlg__actions { display: flex; justify-content: flex-end; gap: 8px; }
    .chip { font-size: 12px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: color-mix(in srgb, var(--text) 10%, transparent);
      &--same { background: color-mix(in srgb, var(--accent) 22%, transparent); } &--moved, &--page { background: color-mix(in srgb, #fbbf24 30%, transparent); }
      &--new { background: color-mix(in srgb, #a78bfa 30%, transparent); } &--missing { background: color-mix(in srgb, var(--danger) 25%, transparent); } }
  `,
})
export class BatchEditorDialogsComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  readonly mode = signal<'paste' | 'file'>('paste');
  readonly draft = signal('');
  readonly check = computed(() => {
    const result = parseTemplateText(this.draft());
    if (!result.ok) return { ok: false as const };
    const pages = extractPagesCollection(result.data);
    const list = Array.isArray(pages) ? pages : [];
    const fields = list.reduce<number>(
      (n, p) => n + (Array.isArray((p as { fields?: unknown })?.fields) ? (p as { fields: unknown[] }).fields.length : 0),
      0
    );
    return { ok: true as const, pages: list.length, fields };
  });

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.vm.batchSetTemplateFile(file);
  }

  readonly kinds: readonly DiffKind[] = ['same', 'moved', 'page', 'new', 'missing'];
}
