import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import type { CascadePdf } from '../utils/adjust-cascade.utils';
import type { PageTextItem } from '../utils/text-anchors.utils';
import { ensureWorker } from './pdf-thumbnail.service';

/** Reads the text and page sizes of a PDF without opening it in the editor (used by the batch cascade). */
@Injectable({ providedIn: 'root' })
export class PdfTextService {
  async read(blob: Blob): Promise<CascadePdf | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    ensureWorker();
    let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null;
    try {
      doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      const texts: PageTextItem[][] = [];
      const sizes: Array<{ w: number; h: number }> = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const view = page.getViewport({ scale: 1 });
        sizes.push({ w: Math.round(view.width), h: Math.round(view.height) });
        const content = await page.getTextContent();
        const items: PageTextItem[] = [];
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) {
            continue;
          }
          const x = Number(item.transform?.[4]);
          const y = Number(item.transform?.[5]);
          if (Number.isFinite(x) && Number.isFinite(y)) {
            items.push({ text: item.str, x, y });
          }
        }
        texts.push(items);
      }
      return { texts, sizes };
    } catch {
      return null;
    } finally {
      void doc?.destroy();
    }
  }
}
