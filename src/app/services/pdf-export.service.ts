import { Injectable } from '@angular/core';
import type { PdfLibFontkit } from '@pdf-lib/fontkit';
import type { FontVariantDescriptor } from '../fonts/font-variant';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import { hexToRgbComponents } from '../utils/color.utils';

export interface PdfExportRequest {
  /** Candidate PDF byte sources, best first; the first one pdf-lib can load is used. */
  readonly pdfByteCandidates: readonly Uint8Array[];
  readonly pages: readonly PageAnnotations[];
  readonly customFonts: ReadonlyMap<string, { readonly data: Uint8Array }>;
  readonly defaultFontId: string;
  readonly defaultOpacity: number;
  /** Fills in defaults (font, colour, opacity…) for a stored field. */
  readonly styleField: (field: PageField) => PageField;
  /** Text that is actually painted for a field (value / X for checks / formatted number). */
  readonly renderText: (field: PageField) => string;
  readonly resolveFont: (fontId: string) => { readonly descriptor: FontVariantDescriptor };
}

export interface PdfExportResult {
  readonly bytes: Uint8Array;
  /** The candidate that loaded successfully, so callers can cache it. */
  readonly sourceBytes: Uint8Array;
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  private fontkitPromise: Promise<PdfLibFontkit> | null = null;

  async exportAnnotatedPdf(request: PdfExportRequest): Promise<PdfExportResult> {
    const pdfLib = await import('pdf-lib');
    const { PDFDocument, rgb, StandardFonts } = pdfLib;
    const loadOptions = {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    } as const;

    if (!request.pdfByteCandidates.length) {
      throw new Error('No se encontraron bytes de PDF para procesar.');
    }

    let pdf: InstanceType<typeof PDFDocument> | null = null;
    let sourceBytes: Uint8Array | null = null;
    const loadErrors: unknown[] = [];

    for (const candidate of request.pdfByteCandidates) {
      try {
        pdf = await PDFDocument.load(candidate, loadOptions);
        sourceBytes = candidate;
        break;
      } catch (error) {
        loadErrors.push(error);
      }
    }

    if (!pdf || !sourceBytes) {
      throw new Error(`No se pudo cargar el PDF original (${loadErrors.length} intentos fallidos).`);
    }

    if (request.customFonts.size > 0) {
      await this.registerFontkit(pdf);
    }

    const fontCache = new Map<string, any>();
    const defaultVariant = request.resolveFont(request.defaultFontId).descriptor;
    const pdfPageCount = pdf.getPageCount();
    const document = pdf;

    const getFont = async (descriptor: FontVariantDescriptor): Promise<any> => {
      if (descriptor.kind === 'standard') {
        const cacheKey = `standard:${descriptor.name}`;
        if (!fontCache.has(cacheKey)) {
          fontCache.set(cacheKey, await document.embedFont(StandardFonts[descriptor.name]));
        }
        return fontCache.get(cacheKey);
      }

      const custom = request.customFonts.get(descriptor.fontId);
      if (!custom) {
        return getFont(defaultVariant);
      }

      const cacheKey = `custom:${descriptor.fontId}`;
      if (!fontCache.has(cacheKey)) {
        fontCache.set(cacheKey, await document.embedFont(custom.data, { subset: true }));
      }
      return fontCache.get(cacheKey);
    };

    for (const pageAnnotations of request.pages) {
      const targetIndex = Math.trunc(pageAnnotations.num) - 1;
      if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= pdfPageCount) {
        console.warn(
          `Se ignoraron anotaciones para la página ${pageAnnotations.num} porque el PDF solo tiene ${pdfPageCount} páginas.`
        );
        continue;
      }

      const page = document.getPage(targetIndex);

      for (const field of pageAnnotations.fields ?? []) {
        const styledField = request.styleField(field);
        if (styledField.hidden) {
          continue;
        }

        const text = request.renderText(styledField);
        const fontOption = request.resolveFont(styledField.fontFamily ?? request.defaultFontId);
        const font = await getFont(fontOption.descriptor);
        const textColor = hexToRgbComponents(styledField.color) ?? { r: 0, g: 0, b: 0 };
        const opacity = styledField.opacity ?? request.defaultOpacity;
        const textWidth = font.widthOfTextAtSize(text, styledField.fontSize);

        if (styledField.backgroundColor) {
          const bg = hexToRgbComponents(styledField.backgroundColor);
          if (bg) {
            const totalHeight = font.heightAtSize(styledField.fontSize);
            const ascent = font.heightAtSize(styledField.fontSize, { descender: false });
            const descent = totalHeight - ascent;
            if (textWidth > 0 && totalHeight > 0) {
              page.drawRectangle({
                x: styledField.x,
                y: styledField.y - descent,
                width: textWidth,
                height: totalHeight,
                color: rgb(bg.r / 255, bg.g / 255, bg.b / 255),
                opacity,
              });
            }
          }
        }

        if (text) {
          page.drawText(text, {
            x: styledField.x,
            y: styledField.y,
            size: styledField.fontSize,
            color: rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255),
            font,
            opacity,
          });
        }
      }
    }

    const bytes = await document.save({ useObjectStreams: false });
    return { bytes, sourceBytes };
  }

  private async registerFontkit(pdf: { registerFontkit?: (fontkit: any) => void }): Promise<void> {
    try {
      const fontkit = await this.loadFontkit();
      if (typeof pdf.registerFontkit === 'function') {
        pdf.registerFontkit(fontkit);
      } else {
        console.warn('La instancia de PDFDocument no soporta registerFontkit.');
      }
    } catch (error) {
      console.error('No se pudo registrar fontkit para fuentes personalizadas.', error);
      throw error instanceof Error
        ? error
        : new Error('No se pudo inicializar fontkit para fuentes personalizadas.');
    }
  }

  private async loadFontkit(): Promise<PdfLibFontkit> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('fontkit solo puede cargarse en el navegador.');
    }

    if (!this.fontkitPromise) {
      this.fontkitPromise = import('@pdf-lib/fontkit')
        .then((module) => (module.default ?? module) as PdfLibFontkit)
        .catch((error) => {
          this.fontkitPromise = null;
          throw error;
        });
    }

    return this.fontkitPromise;
  }
}
