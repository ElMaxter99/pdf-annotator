import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { FocusTrapDirective } from '../../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { PageMapData } from '../../../../models/batch.model';
import {
  type PageSuggestion,
  analyzePageMap,
  identityMap,
  shiftMap,
} from '../../../../utils/page-map.utils';
import type { WorkspacePageComponent } from '../../workspace.page';

/** «Emparejar páginas» (P-79 a P-81): which page of A goes with each page of B. Nothing changes until «Aplicar». */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-page-map-dialog',
  standalone: true,
  imports: [FocusTrapDirective, TranslationPipe],
  templateUrl: './page-map-dialog.component.html',
})
export class PageMapDialogComponent {
  @Input({ required: true }) set vm(value: WorkspacePageComponent) {
    this._vm = value;
    this.draft.set(value.pageMap() ?? identityMap(value.pageCountA(), value.pageCount()));
  }
  get vm(): WorkspacePageComponent {
    return this._vm;
  }
  private _vm!: WorkspacePageComponent;

  readonly draft = signal<PageMapData>({ pairs: [], origins: [] });
  readonly phase = signal<'idle' | 'loading' | 'noText'>('idle');
  readonly progress = signal({ done: 0, total: 0 });
  readonly focusRow = signal(1);
  readonly suggestion = signal<PageSuggestion | null>(null);

  readonly pagesA = computed(() => this.vm.pageCountA());
  readonly optionsA = computed(() => Array.from({ length: this.pagesA() }, (_, i) => i + 1));
  private readonly base = computed(() => this.vm.pageMap() ?? identityMap(this.pagesA(), this.vm.pageCount()));
  readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== JSON.stringify(this.base()),
  );
  readonly report = computed(() => analyzePageMap(this.draft(), this.pagesA()));
  readonly byNumber = computed(() => this.draft().origins.every((origin) => origin === 'number'));
  readonly rows = computed(() =>
    this.draft().pairs.map((a, i) => ({
      b: i + 1,
      a,
      origin: this.draft().origins[i],
      repeated: this.report().repeatedRows.has(i + 1),
      alsoIn: a === null ? [] : (this.report().repeated.get(a) ?? []).filter((b) => b !== i + 1),
      score: this.suggestion()?.scores[i] ?? 0,
      canRestore:
        this.draft().origins[i] === 'manual' &&
        !!this.suggestion() &&
        this.suggestion()!.map.pairs[i] !== this.draft().pairs[i],
    })),
  );
  readonly focused = computed(() => this.rows()[this.focusRow() - 1] ?? null);
  readonly unusedText = computed(() => this.report().unusedA.join(', '));
  readonly percent = computed(() => {
    const { done, total } = this.progress();
    return total ? Math.round((done / total) * 100) : 0;
  });

  setRow(b: number, value: string): void {
    const a = value === '' ? null : Number(value);
    this.draft.update((map) => ({
      pairs: map.pairs.map((current, i) => (i === b - 1 ? a : current)),
      origins: map.origins.map((origin, i) => (i === b - 1 ? 'manual' : origin)),
    }));
  }

  restoreRow(b: number): void {
    const suggestion = this.suggestion();
    if (!suggestion) {
      return;
    }
    this.draft.update((map) => ({
      pairs: map.pairs.map((current, i) => (i === b - 1 ? suggestion.map.pairs[i] : current)),
      origins: map.origins.map((origin, i) => (i === b - 1 ? 'auto' : origin)),
    }));
  }

  shift(delta: -1 | 1): void {
    this.draft.update((map) => shiftMap(map, delta, this.pagesA()));
    this.suggestion.set(null);
  }

  resetByNumber(): void {
    this.draft.set(identityMap(this.pagesA(), this.vm.pageCount()));
    this.suggestion.set(null);
  }

  async suggest(): Promise<void> {
    this.phase.set('loading');
    this.progress.set({ done: 0, total: 0 });
    const result = await this.vm.suggestPageMapFromTexts(this.draft(), (done, total) =>
      this.progress.set({ done, total }),
    );
    if (result === null) {
      this.phase.set('idle');
      return;
    }
    if (result === 'noText') {
      this.phase.set('noText');
      return;
    }
    this.draft.set(result.map);
    this.suggestion.set(result);
    this.phase.set('idle');
  }

  cancelReading(): void {
    this.vm.cancelPageMapReading();
    this.phase.set('idle');
  }

  apply(): void {
    if (this.phase() === 'loading' || !this.dirty()) {
      return;
    }
    this.vm.applyPageMap(this.byNumber() ? undefined : this.draft());
  }

  close(): void {
    this.vm.closePageMap();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.apply();
    }
  }
}
