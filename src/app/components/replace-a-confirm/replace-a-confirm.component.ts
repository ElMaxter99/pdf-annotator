import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, output, signal, effect } from '@angular/core';
import { FocusTrapDirective } from '../../directives/focus-trap.directive';
import { TranslationPipe } from '../../i18n/translation.pipe';
import type { BatchItem } from '../../models/batch.model';
import { PdfTextService } from '../../services/pdf-text.service';
import { countFields } from '../../utils/template-update.utils';

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
  readonly pagesOld = signal<number | null | undefined>(undefined);
  readonly pagesNew = signal<number | null | undefined>(undefined);

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
  readonly unreadable = computed(() => this.pagesNew() === null);

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    event.preventDefault();
    this.cancelled.emit();
  }

  constructor() {
    effect(() => {
      const item = this.item();
      const file = this.file();
      this.pagesOld.set(undefined);
      this.pagesNew.set(undefined);
      void this.pdfText.pageCount(item.aPdf).then((n) => this.pagesOld.set(n));
      void this.pdfText.pageCount(file).then((n) => this.pagesNew.set(n));
    });
  }
}
