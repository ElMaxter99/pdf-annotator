import { Component, Input, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import type { PageField } from '../../../models/annotation.model';
import { templatePageOfField } from '../../../utils/batch-diff.utils';
import type { WorkspacePageComponent } from '../../workspace/workspace.page';

interface BRow {
  pageNum: number;
  pageIndex: number;
  index: number;
  name: string;
  from: number | null;
  duplicate: boolean;
}

interface ARow {
  pageNum: number;
  field: PageField;
  name: string;
}

/** Sidebar panel of the A/B editor: how the fields of B relate to those of A. */
@Component({
  selector: 'app-batch-relations',
  standalone: true,
  imports: [TranslationPipe, RouterLink],
  template: `
    <section class="rel" id="batch-relations" [attr.aria-label]="'batch.editor.relTitle' | t">
      <h5 class="rel__title">{{ 'batch.editor.relTitle' | t }}</h5>

      @if (!vm.batchHasB()) {
        <p class="rel__note" id="rel-no-b">{{ 'batch.editor.noB' | t }}
          <a [routerLink]="['/batch', vm.batchItemId()]" [queryParams]="{ setup: 1 }">{{ 'batch.editor.addB' | t }}</a></p>
      } @else if (!hasTemplate()) {
        <p class="rel__note" id="rel-no-template">{{ 'batch.editor.noTemplate' | t }}</p>
      }

      @if (vm.batchHasB() && !bRows().length) {
        <div class="rel__start">
          <p class="rel__note">{{ 'batch.editor.startNote' | t }}</p>
          <button type="button" class="btn" id="rel-copy" [disabled]="!hasTemplate()"
            (click)="vm.batchCopyAToB(false)">{{ 'batch.editor.copyAToB' | t }}</button>
          <button type="button" class="btn" id="rel-empty" (click)="vm.batchCopyAToB(true)">{{ 'batch.editor.startEmpty' | t }}</button>
        </div>
      }

      @if (duplicates().length) {
        <p class="rel__warn" id="rel-dup">{{ 'batch.editor.duplicates' | t : { names: duplicates().join(', ') } }}</p>
      }

      @if (bRows().length) {
        <h6 class="rel__sub">{{ 'batch.editor.fieldsB' | t }}</h6>
        <ul class="rel__list" id="rel-b">
          @for (row of bRows(); track row.pageNum + ':' + row.index) {
            <li>
              <button type="button" class="rel__row" [class.is-focus]="row.name && row.name === vm.batchFocusKey()"
                (click)="vm.batchGoToField(row.pageNum, row.index)">
                <span class="rel__name">{{ row.name || ('batch.editor.unnamed' | t) }}</span>
                <span class="rel__page">B p.{{ row.pageNum }}</span>
                @if (row.from !== null) {
                  <span class="rel__badge" [class.rel__badge--moved]="row.from !== row.pageNum">↔ A p.{{ row.from }}</span>
                } @else if (hasTemplate()) {
                  <span class="rel__badge rel__badge--only">{{ 'batch.editor.onlyB' | t }}</span>
                }
              </button>
            </li>
          }
        </ul>
      }

      @if (vm.batchHasB() && unusedA().length) {
        <h6 class="rel__sub">{{ 'batch.editor.unusedA' | t : { count: unusedA().length } }}</h6>
        <ul class="rel__list" id="rel-a-unused">
          @for (row of unusedA(); track $index) {
            <li class="rel__unused">
              <span class="rel__name">{{ row.name || ('batch.editor.unnamed' | t) }}</span>
              <span class="rel__page">A p.{{ row.pageNum }}</span>
              <button type="button" class="btn btn--sm" (click)="vm.batchAddFromA(row.field)">＋ {{ 'batch.editor.addToB' | t }}</button>
            </li>
          }
        </ul>
      }

      @if (movable()) {
        <div class="rel__move" id="rel-move">
          <label for="rel-move-sel">{{ 'batch.editor.moveTo' | t }}</label>
          <select id="rel-move-sel" #sel (change)="vm.batchMoveSelectedToPage(+sel.value); sel.value = ''">
            <option value="">—</option>
            @for (p of pageNumbers(); track p) {
              <option [value]="p">{{ 'batch.editor.pageN' | t : { n: p } }}</option>
            }
          </select>
        </div>
      }
    </section>
  `,
  styles: `
    .rel { display: flex; flex-direction: column; gap: 8px; padding: 4px 0 12px; }
    .rel__title { margin: 0; font-size: 14px; } .rel__sub { margin: 6px 0 0; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
    .rel__note, .rel__warn { margin: 0; font-size: 13px; line-height: 1.4; }
    .rel__warn { padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, #fbbf24 14%, transparent); border: 1px solid color-mix(in srgb, #fbbf24 55%, transparent); }
    .rel__start { display: flex; flex-direction: column; gap: 8px; }
    .rel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; }
    .rel__row, .rel__unused { width: 100%; display: flex; gap: 8px; align-items: center; text-align: left; font: inherit; font-size: 13px; color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); border: 0; border-radius: 10px; padding: 6px 8px; min-height: 34px; }
    .rel__row { cursor: pointer; &.is-focus { outline: 2px solid var(--accent); } &:focus-visible { outline: 2px solid var(--text); } }
    .rel__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rel__page { color: var(--muted); font-size: 12px; flex: none; }
    .rel__badge { flex: none; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: color-mix(in srgb, var(--accent) 22%, transparent);
      &--moved { background: color-mix(in srgb, #fbbf24 30%, transparent); } &--only { background: color-mix(in srgb, #a78bfa 30%, transparent); } }
    .rel__move { display: flex; gap: 8px; align-items: center; font-size: 13px; select { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line, rgba(255,255,255,.25)); border-radius: 10px; padding: 6px 10px; } }
    a { color: var(--accent); }
  `,
})
export class BatchRelationsComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly hasTemplate = computed(() => !!this.vm.batchItem()?.template?.some((p) => p.fields.length));

  readonly bRows = computed<BRow[]>(() => {
    const template = this.vm.batchItem()?.template ?? [];
    const seen = new Map<string, number>();
    const rows: BRow[] = [];
    this.vm.coords().forEach((page, pageIndex) => {
      page.fields.forEach((field, index) => {
        const name = field.mapField ?? '';
        const from = name ? templatePageOfField(template, name) : null;
        if (name) seen.set(name, (seen.get(name) ?? 0) + 1);
        rows.push({ pageNum: page.num, pageIndex, index, name, from, duplicate: false });
      });
    });
    return rows.map((r) => ({ ...r, duplicate: !!r.name && (seen.get(r.name) ?? 0) > 1 }));
  });

  readonly duplicates = computed(() => [
    ...new Set(this.bRows().filter((r) => r.duplicate).map((r) => r.name)),
  ]);

  readonly unusedA = computed<ARow[]>(() => {
    const used = new Set(this.bRows().map((r) => r.name).filter(Boolean));
    const out: ARow[] = [];
    for (const page of this.vm.batchItem()?.template ?? []) {
      for (const field of page.fields) {
        if (field.mapField && !used.has(field.mapField)) {
          out.push({ pageNum: page.num, field, name: field.mapField });
        }
      }
    }
    return out;
  });

  readonly movable = computed(() => {
    const sel = this.vm.selection();
    return this.vm.batchHasB() && !!sel && sel.fields.length === 1;
  });

  pageNumbers(): number[] {
    return Array.from({ length: this.vm.pageCount }, (_, i) => i + 1);
  }
}
