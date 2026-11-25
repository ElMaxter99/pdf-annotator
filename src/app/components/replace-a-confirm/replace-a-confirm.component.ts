import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, output, signal, effect } from '@angular/core';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { TranslationPipe } from '../../i18n/translation.pipe';
import type { BatchItem } from '../../models/batch.model';
import { PdfTextService } from '../../services/pdf-text.service';
import { countFields } from '../../utils/template-update.utils';

interface PdfInfo {
  readonly pages: number;
  readonly w: number;
  readonly h: number;
}

const SHEETS: ReadonlyArray<readonly [string, number, number]> = [
  ['A4', 595, 842],
  ['A3', 842, 1191],
  ['A5', 420, 595],
  ['Letter', 612, 792],
  ['Legal', 612, 1008],
];

/** «A4», «Letter»… (any orientation) or the size in points. */
function sheetName(info: PdfInfo | null | undefined): string {
  if (!info) {
    return '';
  }
  const [lo, hi] = [Math.min(info.w, info.h), Math.max(info.w, info.h)];
  const known = SHEETS.find(([, w, h]) => Math.abs(w - lo) <= 3 && Math.abs(h - hi) <= 3);
  return known ? known[0] : `${Math.round(info.w)} × ${Math.round(info.h)} pt`;
}

/**
 * Confirmación de «Reemplazar A» (P-190 a P-192): compara el PDF actual con el nuevo y dice qué se
 * conserva, qué se descarta y qué puede quedar desfasado, antes de cambiar nada.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-replace-a-confirm',
  standalone: true,
  imports: [TranslationPipe, FocusTrapDirective],
  templateUrl: './replace-a-confirm.component.html',
  styleUrl: './replace-a-confirm.component.scss',
})
export class ReplaceAConfirmComponent {
  private readonly pdfText = inject(PdfTextService);

  readonly item = input.required<BatchItem>();
  readonly file = input.required<File>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  /** Pages of the current and of the new PDF; `undefined` while reading, `null` if unreadable. */
  readonly infoOld = signal<PdfInfo | null | undefined>(undefined);
  readonly infoNew = signal<PdfInfo | null | undefined>(undefined);
  readonly pagesOld = computed(() => this.infoOld() && (this.infoOld() as PdfInfo).pages);
  readonly pagesNew = computed(() => this.infoNew() && (this.infoNew() as PdfInfo).pages);
  readonly sizeOld = computed(() => sheetName(this.infoOld()));
  readonly sizeNew = computed(() => sheetName(this.infoNew()));
  readonly sizeDiffers = computed(() => {
    const a = this.infoOld();
    const b = this.infoNew();
    return !!a && !!b && (Math.abs(a.w - b.w) > 2 || Math.abs(a.h - b.h) > 2);
  });

  readonly fieldsA = computed(() => countFields(this.item().aPages));
  readonly fieldsB = computed(() => countFields(this.item().bPages ?? []));
  readonly mapPages = computed(() => this.item().pageMap?.pairs.length ?? 0);
  readonly aiFields = computed(() => this.item().aiProposal?.rows.length ?? 0);
  readonly hasB = computed(() => !!this.item().bPdf);
  readonly hasFit = computed(() => this.item().fitA !== undefined);
  readonly nothingToDrop = computed(
    () => !this.item().pageMap && !this.item().aiProposal && !this.hasFit(),
  );
  readonly pagesDiffer = computed(() => {
    const a = this.pagesOld();
    const b = this.pagesNew();
    return typeof a === 'number' && typeof b === 'number' && a !== b;
  });
  readonly unreadable = computed(() => this.infoNew() === null);

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }

  constructor() {
    effect(() => {
      const item = this.item();
      const file = this.file();
      this.infoOld.set(undefined);
      this.infoNew.set(undefined);
      void this.pdfText.pageInfo(item.aPdf).then((n) => this.infoOld.set(n));
      void this.pdfText.pageInfo(file).then((n) => this.infoNew.set(n));
    });
  }
}
