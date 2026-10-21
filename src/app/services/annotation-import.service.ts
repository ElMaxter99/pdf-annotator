import { Injectable, inject } from '@angular/core';
import { FontCatalogService } from '../fonts/font-catalog.service';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import { normalizeColor } from '../utils/color.utils';
import {
  extractPagesCollection,
  normalizeFieldDecimals,
  normalizeFieldText,
  normalizeFieldType,
  sanitizeOptionalAppender,
} from '../utils/annotation-fields.utils';
import { toFiniteNumber } from '../utils/number.utils';

/** What looked wrong in imported data. Nothing here changes the imported result. */
export interface ImportReport {
  /** Pages ignored because of a bad `num` or a missing `fields` list. */
  skippedPages: number;
  /** Entries ignored because they are not objects, lack numeric x/y, or have no content. */
  skippedFields: number;
  /** Font sizes outside the 8–72 range the editor allows. */
  fontSizeOutOfRange: number;
  /** Opacities outside 0.1–1. */
  opacityOutOfRange: number;
}

export function emptyImportReport(): ImportReport {
  return { skippedPages: 0, skippedFields: 0, fontSizeOutOfRange: 0, opacityOutOfRange: 0 };
}

export function hasImportIssues(report: ImportReport): boolean {
  return Object.values(report).some((count) => count > 0);
}

/** Turns arbitrary (possibly hand-written) JSON into well-formed annotations. */
@Injectable({ providedIn: 'root' })
export class AnnotationImportService {
  private readonly fontCatalog = inject(FontCatalogService);

  /**
   * Returns `null` when the data has no pages collection. Invalid pages/fields are skipped.
   * `prepareField` finishes each field (defaults, sanitising) the same way stored fields are.
   */
  normalizeImportedCoordinates(
    data: unknown,
    prepareField: (field: PageField) => PageField,
    report: ImportReport = emptyImportReport()
  ): PageAnnotations[] | null {
    const pagesData = extractPagesCollection(data);
    if (!Array.isArray(pagesData)) {
      return null;
    }

    const normalized: PageAnnotations[] = [];

    for (const rawPage of pagesData) {
      if (!rawPage || typeof rawPage !== 'object') {
        report.skippedPages += 1;
        continue;
      }

      const pageNum = toFiniteNumber((rawPage as { num?: unknown }).num);
      if (!pageNum || !Number.isInteger(pageNum) || pageNum < 1) {
        report.skippedPages += 1;
        continue;
      }

      const rawFields = (rawPage as { fields?: unknown }).fields;
      if (!Array.isArray(rawFields)) {
        report.skippedPages += 1;
        continue;
      }

      const fields: PageField[] = [];

      for (const rawField of rawFields) {
        if (!rawField || typeof rawField !== 'object') {
          report.skippedFields += 1;
          continue;
        }

        const { x, y, mapField, fontSize, color, value, type, decimals, appender } =
          rawField as Record<string, unknown>;

        const normalizedType = normalizeFieldType(type);
        const normalizedValue = normalizeFieldText(value);
        const normalizedMapField = normalizeFieldText(mapField) ?? normalizedValue;
        const normalizedX = toFiniteNumber(x);
        const normalizedY = toFiniteNumber(y);

        if (normalizedX === null || normalizedY === null) {
          report.skippedFields += 1;
          continue;
        }

        if (
          normalizedMapField === null &&
          normalizedValue === null &&
          normalizedType !== 'check' &&
          normalizedType !== 'radio'
        ) {
          report.skippedFields += 1;
          continue;
        }

        const normalizedFontSize = toFiniteNumber(fontSize);
        if (normalizedFontSize !== null && (normalizedFontSize < 8 || normalizedFontSize > 72)) {
          report.fontSizeOutOfRange += 1;
        }
        const normalizedColor =
          typeof color === 'string' && color.trim() ? color.trim() : '#000000';

        const normalizedField: PageField = {
          x: Math.round(normalizedX * 100) / 100,
          y: Math.round(normalizedY * 100) / 100,
          mapField: normalizedMapField ?? '',
          fontSize:
            normalizedFontSize && normalizedFontSize > 0
              ? Math.round(normalizedFontSize * 100) / 100
              : 14,
          color: normalizeColor(normalizedColor),
          type: normalizedType,
        };

        if (normalizedValue !== null) {
          normalizedField.value = normalizedValue;
        }

        if (normalizedType === 'number') {
          const normalizedDecimals = normalizeFieldDecimals(decimals);
          if (normalizedDecimals !== undefined) {
            normalizedField.decimals = normalizedDecimals;
          }
          const normalizedAppender = sanitizeOptionalAppender(appender);
          if (normalizedAppender !== undefined) {
            normalizedField.appender = normalizedAppender;
          }
        }

        const rawOpacity = (rawField as { opacity?: unknown }).opacity;
        const numericOpacity = toFiniteNumber(rawOpacity);
        if (numericOpacity !== null && (numericOpacity < 0.1 || numericOpacity > 1)) {
          report.opacityOutOfRange += 1;
        }
        const rawBackground = (rawField as { backgroundColor?: unknown }).backgroundColor;
        const fontCandidates = this.fontCatalog.collectFontFamilyCandidates(rawField as Record<string, unknown>);

        const styledField = prepareField({
          ...normalizedField,
          fontFamily: this.fontCatalog.resolveImportedFontFamily(...fontCandidates),
          opacity: rawOpacity as number | string | undefined,
          backgroundColor: typeof rawBackground === 'string' ? rawBackground : undefined,
        } as PageField);

        fields.push(styledField);
      }

      if (fields.length) {
        normalized.push({ num: pageNum, fields });
      }
    }

    normalized.sort((a, b) => a.num - b.num);
    return normalized;
  }
}
