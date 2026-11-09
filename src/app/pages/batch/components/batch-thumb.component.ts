import { Component, effect, inject, input, signal } from '@angular/core';
import type { BatchItem } from '../../../services/batch-store.service';
import { PdfThumbService } from '../../../services/pdf-thumb.service';

/** First page of a batch PDF as a small picture; a placeholder shows while it is drawn. */
@Component({
  selector: 'app-batch-thumb',
  standalone: true,
  template: `
    @if (src(); as image) {
      <img [src]="image" alt="" width="120" />
    } @else {
      <span class="ph" aria-hidden="true"><i></i><i></i><i></i></span>
    }
  `,
  styles: [
    `
      :host { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; min-height: 0; }
      img { max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; border-radius: 3px; background: #fff; box-shadow: 0 2px 10px rgba(0, 0, 0, .3); }
      .ph { width: 70%; aspect-ratio: 1 / 1.41; border-radius: 4px; background: linear-gradient(90deg, rgba(128,128,128,.12), rgba(128,128,128,.28), rgba(128,128,128,.12)); background-size: 200% 100%; animation: sh 1.2s ease-out infinite; }
      .ph i { display: none; }
      @keyframes sh { to { background-position: -200% 0; } }
      @media (prefers-reduced-motion: reduce) { .ph { animation: none; } }
    `,
  ],
})
export class BatchThumbComponent {
  private readonly thumbs = inject(PdfThumbService);
  readonly item = input.required<BatchItem>();
  readonly src = signal<string | null>(null);

  constructor() {
    effect(() => {
      const item = this.item();
      const key = item.hash ?? item.id;
      this.src.set(null);
      void this.thumbs.thumb(key, item.pdf).then((image) => {
        if (this.item().id === item.id) this.src.set(image);
      });
    });
  }
}
