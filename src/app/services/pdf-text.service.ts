import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import type { CascadePdf } from '../utils/adjust-cascade.utils';
import type { PageTextItem } from '../utils/text-anchors.utils';
import { ensureWorker } from './pdf-thumbnail.service';

/** Texts of one page with their position in PDF points. */
export async function readPageTexts(
  doc: { getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> },
  pageNumber: number,
): Promise<PageTextItem[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const out: PageTextItem[] = [];
  for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
    if (typeof item.str !== 'string' || !item.str.trim()) {
      continue;
    }
    const x = Number(item.transform?.[4]);
    const y = Number(item.transform?.[5]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      out.push({ text: item.str, x, y });
    }
  }
  return out;
}

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
        const items = await readPageTexts(doc, n);
        texts.push(items);
      }
      return { texts, sizes };
    } catch {
      return null;
    } finally {
      void doc?.destroy();
    }
  }

  /** Number of pages of a PDF (`null` when it cannot be read). */
  async pageCount(blob: Blob): Promise<number | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    ensureWorker();
    let doc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']> | null = null;
    try {
      doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      return doc.numPages;
    } catch {
      return null;
    } finally {
      void doc?.destroy();
    }
  }

  /** The text of every page of a PDF, one string per page (`null` when it cannot be read). */
  async pageTexts(blob: Blob): Promise<string[] | null> {
    const pdf = await this.read(blob);
    return pdf ? pdf.texts.map((items) => items.map((item) => item.text).join(' ')) : null;
  }
}
