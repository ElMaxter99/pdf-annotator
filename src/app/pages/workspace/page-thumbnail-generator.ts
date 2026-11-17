import { signal } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PageThumbnail } from '../../models/page-thumbnail.model';
import { thumbnailScale } from '../../utils/thumbnail-scale.utils';

/**
 * Gestiona las miniaturas del PDF abierto. Al abrir un PDF solo calcula el tamaño de cada una
 * (la lista aparece al instante, con `imageUrl: null`); la imagen se dibuja bajo demanda, cuando
 * la miniatura entra en pantalla (`request`) y se descarta de la cola si sale antes de tocarle
 * (`cancel`). Se dibuja de una en una con OffscreenCanvas y se gestionan sus URLs de objeto.
 * Un PDF nuevo cancela lo anterior.
 */
export class PageThumbnailGenerator {
  readonly thumbnails = signal<readonly PageThumbnail[]>([]);
  private objectUrls = new Map<number, string>();
  private queue: number[] = [];
  private doc: PDFDocumentProxy | null = null;
  private running = false;
  private token = 0;

  /** Libera las URLs y vacía la lista (también cancela el trabajo en curso). */
  dispose(): void {
    this.token += 1;
    this.doc = null;
    this.queue = [];
    this.thumbnails.set([]);
    this.revokeUrls();
  }

  /** Prepara la lista de miniaturas vacías (solo tamaños, sin dibujar nada). */
  async generate(doc: PDFDocumentProxy | null): Promise<void> {
    this.dispose();
    const generationToken = this.token;
    if (!doc) {
      return;
    }

    if (typeof OffscreenCanvas === 'undefined') {
      console.warn('OffscreenCanvas no está disponible; se omite la generación de miniaturas.');
      return;
    }

    const items: PageThumbnail[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      if (generationToken !== this.token) {
        return;
      }
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: thumbnailScale(base.width) });
      items.push({
        pageNumber,
        imageUrl: null,
        width: Math.max(1, Math.round(viewport.width)),
        height: Math.max(1, Math.round(viewport.height)),
      });
      if (typeof page.cleanup === 'function') {
        page.cleanup();
      }
    }
    this.doc = doc;
    this.thumbnails.set(items);
  }

  /** Pide dibujar la miniatura de una página (la última pedida se dibuja primero). */
  request(pageNumber: number): void {
    if (!this.doc || this.objectUrls.has(pageNumber) || this.queue.includes(pageNumber)) {
      return;
    }
    this.queue.push(pageNumber);
    void this.drain();
  }

  /** Quita de la cola una miniatura que ya no se ve y aún no se ha dibujado. */
  cancel(pageNumber: number): void {
    this.queue = this.queue.filter((n) => n !== pageNumber);
  }

  private async drain(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const generationToken = this.token;
    try {
      while (this.queue.length && generationToken === this.token) {
        const pageNumber = this.queue.pop() as number;
        try {
          await this.renderOne(pageNumber, generationToken);
        } catch (error) {
          console.error('No se pudo generar la miniatura de la página', pageNumber, error);
        }
      }
    } finally {
      this.running = false;
    }
    if (this.queue.length && generationToken === this.token) {
      void this.drain();
    }
  }

  private async renderOne(pageNumber: number, generationToken: number): Promise<void> {
    const doc = this.doc;
    const item = this.thumbnails().find((t) => t.pageNumber === pageNumber);
    if (!doc || !item) {
      return;
    }
    const page = await doc.getPage(pageNumber);
    try {
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: thumbnailScale(base.width) });
      const canvas = new OffscreenCanvas(item.width, item.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, item.width, item.height);
      await page.render({
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        canvas: null,
        viewport,
      }).promise;
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      if (generationToken !== this.token) {
        return;
      }
      const url = URL.createObjectURL(blob);
      this.objectUrls.set(pageNumber, url);
      this.thumbnails.update((list) =>
        list.map((t) => (t.pageNumber === pageNumber ? { ...t, imageUrl: url } : t)),
      );
    } finally {
      if (typeof page.cleanup === 'function') {
        page.cleanup();
      }
    }
  }

  private revokeUrls(): void {
    for (const url of this.objectUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.objectUrls.clear();
  }
}
