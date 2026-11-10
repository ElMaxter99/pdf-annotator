import { Component, Input, computed, signal } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { extractPagesCollection } from '../../../utils/annotation-fields.utils';
import { parseTemplateText } from '../../../utils/template-text.utils';
import type { PageField } from '../../../models/annotation.model';
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
    @if (vm.batchCompareOpen()) {
      <div class="dialog-backdrop" (click)="vm.batchCompareOpen.set(false)">
        <div class="dialog dlg dlg--wide" id="batch-compare" role="dialog" aria-modal="true" [attr.aria-label]="'batch.json.compareTitle' | t" (click)="$event.stopPropagation()" (keydown.escape)="vm.batchCompareOpen.set(false)">
          <div class="dialog__header">
            <h3 class="dialog__title">{{ 'batch.json.compareTitle' | t }}</h3>
            <span class="dlg__chips">
              @for (k of kinds; track k) {
                @if (k !== 'same') { <span class="chip chip--{{ k }}">{{ 'batch.editor.kind.' + k | t }}: {{ vm.batchDiff().counts[k] }}</span> }
              }
            </span>
            <button type="button" class="btn" id="batch-compare-copy" (click)="vm.copyJSON()">{{ 'batch.json.copyB' | t }}</button>
            <button type="button" class="btn" id="batch-compare-close" (click)="vm.batchCompareOpen.set(false)" [attr.aria-label]="'batch.editor.cancel' | t">✕</button>
          </div>
          <div class="dialog__body">
            <div class="cmp">
              <div class="cmp__col">
                <div class="cmp__head"><b>A</b> {{ 'batch.json.cmpA' | t }}</div>
                @for (row of rows(); track $index) {
                  <div class="cmp__line cmp__line--{{ row.kind }}" [class.cmp__line--gap]="!row.a">{{ row.a ?? '' }}</div>
                }
              </div>
              <div class="cmp__col">
                <div class="cmp__head"><b>B</b> {{ 'batch.json.cmpB' | t }}</div>
                @for (row of rows(); track $index) {
                  <div class="cmp__line cmp__line--{{ row.kind }}" [class.cmp__line--gap]="!row.b">{{ row.b ?? '' }}</div>
                }
              </div>
            </div>
            <p class="dlg__sum">{{ 'batch.json.cmpHint' | t }}</p>
            <div class="cmpedit">
              <label class="cmpedit__col"><span>A · {{ 'batch.json.cmpA' | t }}</span>
                <textarea id="batch-compare-a" class="dlg-ta" readonly spellcheck="false" [value]="vm.batchATextValue()"></textarea></label>
              <label class="cmpedit__col"><span>B · {{ 'batch.json.cmpB' | t }}</span>
                <textarea id="batch-compare-b" class="dlg-ta" spellcheck="false" [value]="vm.coordsTextModel" (input)="vm.onCoordsTextChange($any($event.target).value)" (paste)="vm.onCoordsTextPaste()"></textarea></label>
            </div>
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
    .dlg--wide { width: min(1100px, 100%); }
    .dlg--wide .dialog__header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; .dialog__title { margin-right: auto; } }
    .cmpedit { display: flex; gap: 12px; } .cmpedit__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); .dlg-ta { min-height: 200px; height: 24vh; } }
    .cmp { display: flex; border: 1px solid color-mix(in srgb, var(--text) 18%, transparent); border-radius: 12px; overflow: auto; max-height: 28vh; }
    .cmp__col { flex: 1; min-width: 0; & + & { border-left: 1px solid color-mix(in srgb, var(--text) 18%, transparent); } }
    .cmp__head { padding: 6px 12px; font-size: 13px; background: color-mix(in srgb, var(--text) 8%, transparent); position: sticky; top: 0; }
    .cmp__line { font-family: Consolas, monospace; font-size: 12px; line-height: 1.7; padding: 0 12px; white-space: pre; overflow: hidden; text-overflow: ellipsis; min-height: 1.7em; }
    .cmp__line--moved, .cmp__line--page { background: color-mix(in srgb, #fbbf24 16%, transparent); }
    .cmp__line--new { background: color-mix(in srgb, #60a5fa 18%, transparent); }
    .cmp__line--missing { background: color-mix(in srgb, var(--danger) 18%, transparent); }
    .cmp__line--gap { background: repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--text) 12%, transparent) 6px 7px); }
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

  /** One line per field pair: the same row of A and of B, aligned by field name. */
  readonly rows = computed(() => {
    const line = (side: { page: number; field: PageField } | undefined) =>
      side ? `p.${side.page}  ${JSON.stringify({ mapField: side.field.mapField, x: side.field.x, y: side.field.y })}` : null;
    return this.vm.batchDiff().rows.map((r) => ({ kind: r.kind, a: line(r.a), b: line(r.b) }));
  });

  readonly kinds: readonly DiffKind[] = ['same', 'moved', 'page', 'new', 'missing'];
}
