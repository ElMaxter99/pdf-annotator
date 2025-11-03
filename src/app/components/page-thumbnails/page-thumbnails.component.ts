import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { PageThumbnail } from '../../models/page-thumbnail.model';
import { TranslationPipe } from '../../i18n/translation.pipe';

@Component({
  selector: 'app-page-thumbnails',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './page-thumbnails.component.html',
  styleUrls: ['./page-thumbnails.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageThumbnailsComponent {
  @Input({ required: true }) thumbnails: readonly PageThumbnail[] = [];
  @Input() activePage = 1;
  @Output() pageSelected = new EventEmitter<number>();

  onSelect(pageNumber: number) {
    this.pageSelected.emit(pageNumber);
  }
}
