import { Component, ElementRef, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { PdfThumbnailService } from '../../services/pdf-thumbnail.service';

/**
 * First page of a PDF as a small picture: a skeleton while it renders, the page when ready and a
 * generic page icon when it cannot be drawn. Only renders once it scrolls into view.
 */
@Component({
  selector: 'app-pdf-thumb',
  standalone: true,
  template: `
    @if (src(); as url) {
      <img [src]="url" alt="" draggable="false" />
    } @else if (failed()) {
      <span class="pdf-thumb__icon" aria-hidden="true"></span>
    } @else {
      <span class="pdf-thumb__skeleton" aria-hidden="true"></span>
    }
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        background: #fff;
        border-radius: 3px;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
      }

      .pdf-thumb__skeleton {
        width: 70%;
        height: 90%;
        border-radius: 4px;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, currentColor 8%, transparent),
          color-mix(in srgb, currentColor 20%, transparent),
          color-mix(in srgb, currentColor 8%, transparent)
        );
        background-size: 200% 100%;
        animation: pdf-thumb-shimmer 1.2s ease-in-out infinite;
      }

      .pdf-thumb__icon {
        position: relative;
        width: 60%;
        height: 86%;
        border-radius: 3px;
        background: #fff;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);

        &::before {
          content: '';
          position: absolute;
          inset: 0 0 auto 0;
          height: 18%;
          background: #0f9b8e;
          border-radius: 3px 3px 0 0;
        }
      }

      @keyframes pdf-thumb-shimmer {
        from {
          background-position: 200% 0;
        }
        to {
          background-position: -200% 0;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .pdf-thumb__skeleton {
          animation: none;
        }
      }
    `,
  ],
})
export class PdfThumbComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) blob!: Blob;

  private readonly thumbnails = inject(PdfThumbnailService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;
  private loadedFor: Blob | null = null;

  readonly src = signal<string | null>(null);
  readonly failed = signal(false);

  ngOnChanges(): void {
    if (this.loadedFor === this.blob) {
      return;
    }
    this.loadedFor = null;
    this.src.set(null);
    this.failed.set(false);
    this.observer?.disconnect();
    if (typeof IntersectionObserver === 'undefined') {
      this.load();
      return;
    }
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        this.observer?.disconnect();
        this.load();
      }
    });
    this.observer.observe(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private load(): void {
    const blob = this.blob;
    this.loadedFor = blob;
    void this.thumbnails.thumbnail(blob).then((url) => {
      if (this.loadedFor !== blob) {
        return;
      }
      this.src.set(url);
      this.failed.set(url === null);
    });
  }
}
