import { signal } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PageThumbnail } from '../../models/page-thumbnail.model';
import { thumbnailScale } from '../../utils/thumbnail-scale.utils';

/**
 * Genera las miniaturas del PDF abierto (una a una, con OffscreenCanvas) y gestiona sus URLs de
 * objeto. Una generación nueva cancela la anterior.
 */
export class PageThumbnailGenerator {
  readonly thumbnails = signal<readonly PageThumbnail[]>([]);
  private objectUrls: string[] = [];
  private token = 0;

  /** Libera las URLs y vacía la lista (también cancela una generación en curso). */
  dispose(): void {
    this.token += 1;
    this.thumbnails.set([]);
    this.revokeUrls();
  }

  async generate(doc: PDFDocumentProxy | null): Promise<void> {
    this.token += 1;
    const generationToken = this.token;

    this.thumbnails.set([]);
    this.revokeUrls();

    if (!doc) {
      return;
    }

    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('OffscreenCanvas no está disponible; se omite la generación de miniaturas.');
      return;
    }

    const thumbnails: PageThumbnail[] = [];
    const urls: string[] = [];
    const discard = () => urls.forEach((url) => URL.revokeObjectURL(url));

    try {
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        if (generationToken !== this.token) {
          discard();
          return;
        }

        const page = await doc.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: thumbnailScale(baseViewport.width) });
        const width = Math.max(1, Math.round(viewport.width));
        const height = Math.max(1, Math.round(viewport.height));

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d', { alpha: false });

        if (!ctx) {
          if (typeof page.cleanup === 'function') {
            page.cleanup();
          }
          continue;
        }

        ctx.clearRect(0, 0, width, height);

        await page.render({
          canvasContext: ctx as unknown as CanvasRenderingContext2D,
          canvas: null,
          viewport,
        }).promise;

        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const url = URL.createObjectURL(blob);

        urls.push(url);
        thumbnails.push({ pageNumber, imageUrl: url, width, height });

        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    } catch (error) {
      discard();
      throw error;
    }

    if (generationToken !== this.token) {
      discard();
      return;
    }

    this.objectUrls = urls;
    this.thumbnails.set(thumbnails);
  }

  private revokeUrls(): void {
    for (const url of this.objectUrls) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls = [];
  }
}
