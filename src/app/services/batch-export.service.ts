import { Injectable, inject } from '@angular/core';
import { DEFAULT_FONT_ID, FontCatalogService } from '../fonts/font-catalog.service';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import { baseName } from '../utils/batch-files.utils';
import { toArrayBuffer } from '../utils/download.utils';
import { PreviewSettingsService } from './preview-settings.service';
import { resolveFieldPreview } from '../utils/preview-values.utils';
import type { BatchItem } from './batch-store.service';
import { PdfExportService } from './pdf-export.service';

/** Fields as the JSON expects them: the basics always, the rest only when they differ from defaults. */
export function serializeBatchField(field: PageField): Record<string, unknown> {
  const out: Record<string, unknown> = {
    x: field.x,
    y: field.y,
    mapField: field.mapField,
    fontSize: field.fontSize,
    type: field.type,
  };
  if (field.color && field.color.toLowerCase() !== '#000000') out['color'] = field.color;
  if (field.value) out['value'] = field.value;
  if (field.decimals !== undefined && field.decimals !== null) out['decimals'] = field.decimals;
  if (field.appender) out['appender'] = field.appender;
  if (field.fontFamily && field.fontFamily !== DEFAULT_FONT_ID) out['fontFamily'] = field.fontFamily;
  if (typeof field.opacity === 'number' && field.opacity !== 1) out['opacity'] = field.opacity;
  if (field.backgroundColor) out['backgroundColor'] = field.backgroundColor;
  return out;
}

export function serializeBatchPages(pages: readonly PageAnnotations[]): { pages: unknown[] } {
  return {
    pages: pages.map((page) => ({ num: page.num, fields: page.fields.map(serializeBatchField) })),
  };
}

export interface BatchExportFile {
  readonly filename: string;
  readonly blob: Blob;
}

@Injectable({ providedIn: 'root' })
export class BatchExportService {
  private readonly pdfExport = inject(PdfExportService);
  private readonly fonts = inject(FontCatalogService);
  private readonly preview = inject(PreviewSettingsService);

  /** `a` exports the coordinates of the original PDF, `b` those adjusted over the version B. */
  json(item: BatchItem, side: 'a' | 'b' = 'b'): BatchExportFile {
    const pages = (side === 'b' ? item.layout : item.template) ?? item.template ?? [];
    return {
      filename: `${baseName(item.name)}.json`,
      blob: new Blob([JSON.stringify(serializeBatchPages(pages), null, 2)], {
        type: 'application/json',
      }),
    };
  }

  async pdf(item: BatchItem, side: 'a' | 'b' = 'b'): Promise<BatchExportFile> {
    const useB = side === 'b' && !!item.newPdf;
    const source = useB ? item.newPdf : item.pdf;
    if (!source) {
      throw new Error('El PDF no está disponible.');
    }
    const bytes = new Uint8Array(await source.arrayBuffer());
    const ctx = this.preview.context();
    const { bytes: out } = await this.pdfExport.exportAnnotatedPdf({
      pdfByteCandidates: [bytes],
      pages: (useB ? item.layout : item.template) ?? [],
      customFonts: new Map(),
      defaultFontId: DEFAULT_FONT_ID,
      defaultOpacity: 1,
      styleField: (field) => ({
        ...field,
        fontFamily: this.fonts.normalizeFontFamily(field.fontFamily),
        opacity: typeof field.opacity === 'number' ? field.opacity : 1,
      }),
      renderText: (field) => resolveFieldPreview(field, ctx).text,
      resolveFont: (fontId) => this.fonts.getFontOptionById(fontId),
    });
    return {
      filename: `${baseName(item.name)}.pdf`,
      blob: new Blob([toArrayBuffer(out)], { type: 'application/pdf' }),
    };
  }
}
