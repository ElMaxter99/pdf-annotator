import { Component, Input } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
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
  readonly kinds: readonly DiffKind[] = ['same', 'moved', 'page', 'new', 'missing'];
}
