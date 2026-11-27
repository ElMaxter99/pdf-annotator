import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { SearchSelectComponent } from '../../../components/search-select/search-select.component';
import { FocusTrapDirective } from '../../../directives/focus-trap.directive';
import type { SearchOption } from '../../../utils/search-select.utils';
import { suggestPairs } from '../../../utils/unpaired-suggest.utils';

export interface UnpairedAssignment {
  readonly file: File;
  readonly id: string;
}

interface TrayRow {
  readonly file: File;
  /** PDF sugerido por el nombre (claro y sin repetir), o null. */
  readonly suggestion: SearchOption | null;
}

/**
 * Bandeja «Emparejar versiones B» (opción B del panel del lote): las versiones B que no casaron por nombre, con una
 * sugerencia clara por archivo cuando la hay, «Aceptar N sugerencias», asignar a mano con el buscador y descartar.
 * Pensada para decenas de archivos: la lista se desplaza dentro de la bandeja y el panel no se mueve.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-unpaired-tray',
  standalone: true,
  imports: [TranslationPipe, SearchSelectComponent, FocusTrapDirective],
  templateUrl: './unpaired-tray.component.html',
  styleUrl: './unpaired-tray.component.scss',
  host: { style: 'display: contents' },
})
export class UnpairedTrayComponent {
  readonly files = input.required<readonly File[]>();
  /** PDF del lote que aún no tienen versión B. */
  readonly options = input.required<SearchOption[]>();
  readonly assign = output<UnpairedAssignment[]>();
  readonly discard = output<File[]>();
  readonly closed = output<void>();

  readonly query = signal('');
  readonly tab = signal<'suggested' | 'none'>('suggested');
  /** Sugerencias que la persona ha desmarcado (por defecto todas marcadas). */
  readonly unchecked = signal<ReadonlySet<File>>(new Set());

  readonly rows = computed<TrayRow[]>(() => {
    const files = this.files();
    const options = this.options();
    const byId = new Map(options.map((o) => [o.id, o]));
    const pairs = suggestPairs(files, options);
    return files.map((file, index) => ({
      file,
      suggestion: byId.get(pairs.get(index) ?? '') ?? null,
    }));
  });
  readonly suggestedCount = computed(() => this.rows().filter((r) => r.suggestion).length);
  readonly noneCount = computed(() => this.rows().length - this.suggestedCount());
  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const wantSuggested = this.tab() === 'suggested';
    return this.rows().filter(
      (row) =>
        !!row.suggestion === wantSuggested &&
        (!q ||
          row.file.name.toLowerCase().includes(q) ||
          (row.suggestion?.label.toLowerCase().includes(q) ?? false)),
    );
  });
  readonly checkedRows = computed(() =>
    this.rows().filter((row) => row.suggestion && !this.unchecked().has(row.file)),
  );
  readonly noneRows = computed(() => this.rows().filter((row) => !row.suggestion));

  constructor() {
    // Sin archivos con sugerencia, se abre directamente en «Sin sugerencia».
    effect(() => {
      if (this.suggestedCount() === 0 && this.noneCount() > 0 && this.tab() === 'suggested') {
        this.tab.set('none');
      }
    });
  }

  isChecked(row: TrayRow): boolean {
    return !this.unchecked().has(row.file);
  }

  toggle(row: TrayRow): void {
    const next = new Set(this.unchecked());
    if (next.has(row.file)) next.delete(row.file);
    else next.add(row.file);
    this.unchecked.set(next);
  }

  acceptChecked(): void {
    const list = this.checkedRows().map((row) => ({ file: row.file, id: row.suggestion!.id }));
    if (list.length) this.assign.emit(list);
  }

  pick(file: File, id: string): void {
    if (id) this.assign.emit([{ file, id }]);
  }

  discardNone(): void {
    const list = this.noneRows().map((row) => row.file);
    if (list.length) this.discard.emit(list);
  }
}
