import { Injectable } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { AcroFormField, AcroFormFieldRect } from '../models/acro-form-field.model';

const PDF_WORKER_MODULE_SRC = '/assets/pdfjs/pdf.worker.entry.mjs';
const PDF_WORKER_TYPE_MODULE = 'module';

function supportsModuleWorkers(): boolean {
  if (
    typeof Worker === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }

  let url: string | null = null;

  try {
    const blob = new Blob([''], { type: 'application/javascript' });
    url = URL.createObjectURL(blob);
    const tester = new Worker(url, { type: 'module' });
    tester.terminate();
    return true;
  } catch {
    return false;
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

const workerOptions = (pdfjsLib as any).GlobalWorkerOptions as {
  workerSrc?: string;
  workerType?: string;
};

if (supportsModuleWorkers()) {
  workerOptions.workerSrc = PDF_WORKER_MODULE_SRC;
  workerOptions.workerType = PDF_WORKER_TYPE_MODULE;
} else {
  workerOptions.workerSrc = undefined;
  workerOptions.workerType = undefined;
}

@Injectable({ providedIn: 'root' })
export class PdfLoaderService {
  async loadDocument(data: Uint8Array): Promise<{
    pdf: PDFDocumentProxy;
    acroFormFields: AcroFormField[];
  }> {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const acroFormFields = await this.extractAcroFormFields(pdf);
    return { pdf, acroFormFields };
  }

  private async extractAcroFormFields(pdf: PDFDocumentProxy): Promise<AcroFormField[]> {
    const fields: AcroFormField[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const annotations = await page.getAnnotations({ intent: 'display' });

      for (const annotation of annotations) {
        const fieldName = (annotation as { fieldName?: unknown }).fieldName;
        const rect = (annotation as { rect?: unknown }).rect;
        if (typeof fieldName !== 'string' || !fieldName.trim() || !Array.isArray(rect)) {
          continue;
        }

        const normalizedRect = this.normalizeRect(rect);
        if (!normalizedRect) {
          continue;
        }

        fields.push({
          name: fieldName.trim(),
          page: pageNumber,
          rect: normalizedRect,
        });
      }
    }

    return fields.sort((a, b) => a.page - b.page || a.name.localeCompare(b.name));
  }

  private normalizeRect(rect: unknown[]): AcroFormFieldRect | null {
    if (!Array.isArray(rect) || rect.length < 4) {
      return null;
    }

    const [x1, y1, x2, y2] = rect.map((value) => Number(value));

    if ([x1, y1, x2, y2].some((num) => Number.isNaN(num) || !Number.isFinite(num))) {
      return null;
    }

    const normalized = typeof pdfjsLib.Util?.normalizeRect === 'function'
      ? pdfjsLib.Util.normalizeRect([x1, y1, x2, y2])
      : [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];

    const width = normalized[2] - normalized[0];
    const height = normalized[3] - normalized[1];

    if (width <= 0 || height <= 0) {
      return null;
    }

    return {
      x: Math.round(normalized[0] * 100) / 100,
      y: Math.round(normalized[1] * 100) / 100,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
    };
  }
}
