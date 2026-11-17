import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, inject, output } from '@angular/core';
import { FocusTrapDirective } from '../../../directives/focus-trap.directive';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { PageMapBatchService, type PageMapRow } from '../../../services/page-map-batch.service';

/** «Sugerir tablas de páginas» (P-100 a P-102): confirm, progress with counter and result per PDF. */
@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-page-map-batch',
  standalone: true,
  imports: [CommonModule, TranslationPipe, FocusTrapDirective],
  templateUrl: './page-map-batch-dialog.component.html',
  styleUrl: './page-map-batch-dialog.component.scss',
})
export class PageMapBatchDialogComponent {
  readonly service = inject(PageMapBatchService);
  /** The dialog closed; `applied` is how many tables were applied (to offer «Deshacer»). */
  readonly closed = output<number>();
  /** Open this PDF in the editor to review its table. */
  readonly review = output<string>();

  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.service.phase() === 'closed') {
      return;
    }
    event.preventDefault();
    if (this.service.phase() === 'running') {
      this.service.cancel();
    } else {
      this.close();
    }
  }

  close(): void {
    const applied = this.service.phase() === 'done' ? this.service.applied().length : 0;
    this.service.close();
    this.closed.emit(applied);
  }

  reviewFirst(): void {
    const first = this.service.doubtful()[0];
    const applied = this.service.applied().length;
    this.service.close();
    this.closed.emit(applied);
    if (first) {
      this.review.emit(first.id);
    }
  }

  readonly rowIsNoText = (row: PageMapRow): boolean => row.state === 'noText';

  /** PDFs that were still waiting when it was cancelled. */
  untouchedCount(): number {
    return this.service.rows().filter((row) => row.state === 'untouched').length;
  }

  chipClass(row: PageMapRow): string {
    switch (row.state) {
      case 'applied':
        return 'ok';
      case 'doubt':
      case 'noText':
        return 'warn';
      case 'error':
        return 'bad';
      case 'reading':
        return 'run';
      default:
        return '';
    }
  }
}
