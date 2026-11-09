import { Injectable } from '@angular/core';
import type { PageSize } from '../utils/page-size.utils';

export interface PdfInfo {
  readonly pageCount: number;
  readonly pageSize: PageSize;
}

/** Reads the page count and the first page size (in PDF points) of a PDF, in the browser. */
@Injectable({ providedIn: 'root' })
export class PdfInfoService {
  async read(blob: Blob): Promise<PdfInfo> {
    const { pdfjsLib } = await import('../utils/pdfjs-setup');
    const data = new Uint8Array(await blob.arrayBuffer());
    const doc = await pdfjsLib.getDocument({ data }).promise;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      return {
        pageCount: doc.numPages,
        pageSize: { width: viewport.width, height: viewport.height },
      };
    } finally {
      void doc.destroy();
    }
  }
}
