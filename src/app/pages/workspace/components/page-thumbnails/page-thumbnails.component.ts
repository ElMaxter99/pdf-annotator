import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { PageThumbnail } from '../../../../models/page-thumbnail.model';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

/** Avisa cuando el elemento entra o sale de la zona visible (con un margen para ir un paso por delante). */
@Directive({ selector: '[appInView]', standalone: true })
export class InViewDirective implements OnInit, OnDestroy {
  @Output() inView = new EventEmitter<boolean>();
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      this.inView.emit(true);
      return;
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        this.zone.run(() => this.inView.emit(last.isIntersecting));
      },
      { rootMargin: '160px 0px' },
    );
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

@Component({
  selector: 'app-page-thumbnails',
  standalone: true,
  imports: [CommonModule, TranslationPipe, InViewDirective],
  templateUrl: './page-thumbnails.component.html',
  styleUrls: ['./page-thumbnails.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageThumbnailsComponent {
  @Input({ required: true }) thumbnails: readonly PageThumbnail[] = [];
  @Input() activePage = 1;
  @Output() pageSelected = new EventEmitter<number>();

  @Output() thumbnailVisible = new EventEmitter<number>();
  @Output() thumbnailHidden = new EventEmitter<number>();
  @Output() thumbnailRetry = new EventEmitter<number>();

  trackByPage(_index: number, thumbnail: PageThumbnail): number {
    return thumbnail.pageNumber;
  }

  onInView(pageNumber: number, visible: boolean) {
    (visible ? this.thumbnailVisible : this.thumbnailHidden).emit(pageNumber);
  }

  onSelect(thumbnail: PageThumbnail) {
    if (thumbnail.failed) {
      this.thumbnailRetry.emit(thumbnail.pageNumber);
    }
    this.pageSelected.emit(thumbnail.pageNumber);
  }
}
