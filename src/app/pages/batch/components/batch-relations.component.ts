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
      @if (vm.batchHasB()) {
        <div class="znext" id="batch-next">
          <span class="rel__sub">{{ 'batch.editor.nextTitle' | t }}</span>
          <div class="zk" [class.ok]="vm.batchStep() > 1" [class.now]="vm.batchStep() === 1"><i>{{ vm.batchStep() > 1 ? '✓' : '●' }}</i><span>{{ 'batch.editor.c1' | t }}</span></div>
          <div class="zk" [class.ok]="vm.batchStep() > 2" [class.now]="vm.batchStep() === 2"><i>{{ vm.batchStep() > 2 ? '✓' : vm.batchStep() === 2 ? '●' : '' }}</i><span>{{ 'batch.editor.c2' | t }}@if (vm.batchStep() === 2) { · {{ 'batch.editor.missing' | t : { count: vm.batchUnusedA().length } }} }</span></div>
          <div class="zk" [class.ok]="vm.batchDiffSeen() && vm.batchStep() === 3"><i>{{ vm.batchDiffSeen() && vm.batchStep() === 3 ? '✓' : '' }}</i><span>{{ 'batch.editor.c3' | t }}</span>@if (vm.batchStep() === 3) { <button type="button" class="btn btn--sm" (click)="vm.batchOpenDiff()">{{ 'batch.editor.see' | t }}</button> }</div>
          <div class="zk" [class.now]="vm.batchStep() === 3"><i>{{ vm.batchStep() === 3 ? '●' : '' }}</i><span>{{ 'batch.editor.c4' | t }}</span></div>
        </div>
        @if (vm.batchStep() === 3) {
          <div class="rel__sum" id="batch-summary">
            <span class="rel__sub">{{ 'batch.editor.summary' | t }}</span>
            @for (k of kinds; track k) {
              <div class="rel__sumrow"><span>{{ 'batch.editor.kind.' + k | t }}</span><b>{{ vm.batchDiff().counts[k] }}</b></div>
            }
          </div>
        }
      }

      @if (!vm.batchHasB()) {
        <p class="rel__note" id="rel-no-b">{{ 'batch.editor.noB' | t }}
          <a [routerLink]="['/batch', vm.batchItemId()]" [queryParams]="{ setup: 1 }">{{ 'batch.editor.addB' | t }}</a></p>
      } @else if (!hasTemplate()) {
        <p class="rel__note" id="rel-no-template">{{ 'batch.editor.noTemplate' | t }}</p>
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
    .znext { display: flex; flex-direction: column; gap: 8px; background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid var(--accent); border-radius: 14px; padding: 12px; }
    .zk { display: flex; gap: 8px; align-items: center; font-size: 13px; span { flex: 1; } i { font-style: normal; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; background: color-mix(in srgb, var(--text) 8%, transparent); border: 1px solid var(--line, rgba(255,255,255,.2)); flex: none; }
      &.ok i { background: var(--accent); color: var(--bg); border-color: var(--accent); } &.now { font-weight: 700; i { border: 2px solid var(--accent); color: var(--accent); } } }
    .rel__sum { display: flex; flex-direction: column; gap: 4px; }
    .rel__sumrow { display: flex; justify-content: space-between; font-size: 13px; background: color-mix(in srgb, var(--text) 6%, transparent); border-radius: 10px; padding: 6px 10px; }
    .btn { font: inherit; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 10px; cursor: pointer; background: var(--accent); color: var(--bg); border: 0; }
  `,
})
export class BatchRelationsComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly kinds = ['same', 'moved', 'page', 'new'] as const;
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
