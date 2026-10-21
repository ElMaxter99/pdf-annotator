import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { STANDARD_FONT_FAMILIES } from './standard-font-families';
import type { FontVariantDescriptor } from './font-variant';

export const DEFAULT_FONT_ID = 'standard:helvetica';

export type FontOptionType = 'standard' | 'custom';

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly type: FontOptionType;
  readonly cssFamily: string;
  readonly descriptor: FontVariantDescriptor;
}

export interface CustomFontEntry {
  readonly id: string;
  readonly name: string;
  readonly cssName: string;
  readonly data: Uint8Array;
}

/**
 * Catalogue of the fonts available to annotations: the standard PDF families plus any
 * custom font the user loaded. Also resolves the loose font names found in imported JSON.
 */
@Injectable({ providedIn: 'root' })
export class FontCatalogService {
  private readonly document = inject(DOCUMENT, { optional: true });

  readonly customFontsFeatureEnabled = signal(false);
  readonly customFonts = signal<CustomFontEntry[]>([]);
  readonly fontOptions = computed<readonly FontOption[]>(() => this.buildFontOptions());

  /** Loads the font into the document and stores it. Throws when the font cannot be loaded. */
  async registerCustomFont(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    const fontId = this.createRuntimeId('font');
    const baseName = file.name.replace(/\.[^.]+$/, '') || file.name;
    const safeName = baseName.replace(/[^a-zA-Z0-9_-]+/g, '-');
    const cssName = `${safeName}-${fontId}`;
    const fontFace = new FontFace(cssName, buffer);
    await fontFace.load();
    if (this.document?.fonts) {
      this.document.fonts.add(fontFace);
    }

    const entry: CustomFontEntry = {
      id: fontId,
      name: baseName,
      cssName,
      data: new Uint8Array(buffer),
    };

    this.customFonts.update((fonts) => [entry, ...fonts.filter((font) => font.id !== entry.id)]);
  }

  private createRuntimeId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private buildFontOptions(): FontOption[] {
    const standardOptions = STANDARD_FONT_FAMILIES.map(
      (family): FontOption => ({
        id: `standard:${family.id}`,
        label: family.label,
        type: 'standard',
        cssFamily: family.cssFamily,
        descriptor: { kind: 'standard', name: family.pdfName },
      })
    );

    const customEnabled = this.customFontsFeatureEnabled();
    const customOptions = customEnabled
      ? this.customFonts().map(
          (font): FontOption => ({
            id: this.toCustomFontOptionId(font.id),
            label: font.name,
            type: 'custom',
            cssFamily: `"${font.cssName}"`,
            descriptor: { kind: 'custom', fontId: font.id },
          })
        )
      : [];

    return [...standardOptions, ...customOptions];
  }

  toCustomFontOptionId(fontId: string): string {
    return `custom:${fontId}`;
  }

  getFontOptionById(fontId: string): FontOption {
    const normalized = this.normalizeFontFamily(fontId);
    const option = this.fontOptions().find((item) => item.id === normalized);
    if (option) {
      return option;
    }
    const fallback = this.fontOptions().find((item) => item.id === DEFAULT_FONT_ID);
    if (!fallback) {
      throw new Error('Default font option is not available.');
    }
    return fallback;
  }

  normalizeFontFamily(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        const options = this.fontOptions();
        if (options.some((option) => option.id === trimmed)) {
          return trimmed;
        }
      }
    }
    return DEFAULT_FONT_ID;
  }

  collectFontFamilyCandidates(rawField: Record<string, unknown>): unknown[] {
    const candidates: unknown[] = [];
    const push = (value: unknown) => {
      if (value !== undefined && value !== null) {
        candidates.push(value);
      }
    };

    const directKeys = [
      'fontFamily',
      'fontfamily',
      'font_family',
      'fontFamilyName',
      'font_family_name',
      'font',
      'fontName',
      'font_name',
      'familyName',
      'fontId',
      'font_id',
      'fontFamilyId',
      'font_family_id',
      'fontFace',
      'font_face',
      'fontType',
      'font_type',
      'typeface',
    ];

    for (const key of directKeys) {
      if (key in rawField) {
        push(rawField[key]);
      }
    }

    const style = rawField['style'];
    if (style && typeof style === 'object') {
      const styleRecord = style as Record<string, unknown>;
      push(styleRecord['fontFamily']);
      push(styleRecord['fontfamily']);
      push(styleRecord['font']);
      push(styleRecord['fontName']);
      push(styleRecord['font_name']);
    }

    const font = rawField['font'];
    if (font && typeof font === 'object') {
      const fontRecord = font as Record<string, unknown>;
      push(font);
      push(fontRecord['id']);
      push(fontRecord['name']);
      push(fontRecord['family']);
      push(fontRecord['value']);
      push(fontRecord['fontFamily']);
      push(fontRecord['font_name']);
    }

    const typography = (rawField as { typography?: unknown }).typography;
    if (typography && typeof typography === 'object') {
      const typographyRecord = typography as Record<string, unknown>;
      push(typographyRecord['fontFamily']);
      push(typographyRecord['font']);
      push(typographyRecord['name']);
    }

    const meta = (rawField as { meta?: unknown }).meta;
    if (meta && typeof meta === 'object') {
      const metaRecord = meta as Record<string, unknown>;
      const metaFont = metaRecord['font'];
      if (metaFont && typeof metaFont === 'object') {
        const metaFontRecord = metaFont as Record<string, unknown>;
        push(metaFontRecord['id']);
        push(metaFontRecord['name']);
        push(metaFontRecord['family']);
        push(metaFontRecord['fontFamily']);
      }
    }

    return candidates;
  }

  resolveImportedFontFamily(...candidates: unknown[]): string | undefined {
    if (!candidates.length) {
      return undefined;
    }

    const options = this.fontOptions();
    if (!options.length) {
      return undefined;
    }

    const sanitize = (value: string) => value.toLowerCase();
    const canonical = (value: string) => sanitize(value).replace(/[^a-z0-9]/g, '');
    const visited = new Set<string>();

    const tryMatchOption = (input: string): string | undefined => {
      const normalized = sanitize(input);
      const simplified = canonical(input);

      for (const option of options) {
        if (option.id === input) {
          return option.id;
        }

        const optionIdNormalized = sanitize(option.id);
        if (optionIdNormalized === normalized || canonical(option.id) === simplified) {
          return option.id;
        }

        const labelNormalized = sanitize(option.label);
        if (labelNormalized === normalized || canonical(option.label) === simplified) {
          return option.id;
        }

        if (option.type === 'standard') {
          const baseId = option.id.replace(/^standard:/, '');
          const baseNormalized = sanitize(baseId);
          const baseCanonical = canonical(baseId);
          if (
            baseId === input ||
            baseNormalized === normalized ||
            baseCanonical === simplified ||
            (baseCanonical.length >= 3 && simplified.includes(baseCanonical))
          ) {
            return option.id;
          }
        }

        const labelCanonical = canonical(option.label);
        if (labelCanonical.length >= 3 && simplified.includes(labelCanonical)) {
          return option.id;
        }

        const cssParts = option.cssFamily
          .split(',')
          .map((part) => part.trim().replace(/^["'`]+|["'`]+$/g, ''))
          .filter(Boolean);
        for (const cssPart of cssParts) {
          const cssNormalized = sanitize(cssPart);
          if (cssNormalized === normalized || canonical(cssPart) === simplified) {
            return option.id;
          }
        }
      }

      return undefined;
    };

    const attemptString = (value: string): string | undefined => {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }

      if (visited.has(trimmed)) {
        return undefined;
      }
      visited.add(trimmed);

      const direct = tryMatchOption(trimmed);
      if (direct) {
        return direct;
      }

      if (trimmed.includes(',')) {
        for (const part of trimmed.split(',')) {
          const result = attemptString(part.replace(/^["'`]+|["'`]+$/g, ''));
          if (result) {
            return result;
          }
        }
      }

      const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, '');
      if (unquoted !== trimmed) {
        const result = attemptString(unquoted);
        if (result) {
          return result;
        }
      }

      return undefined;
    };

    const attempt = (value: unknown): string | undefined => {
      if (value === null || value === undefined) {
        return undefined;
      }

      if (typeof value === 'string') {
        return attemptString(value);
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        return attemptString(String(value));
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          const result = attempt(item);
          if (result) {
            return result;
          }
        }
        return undefined;
      }

      if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const objectCandidates: unknown[] = [];

        const candidateKeys = [
          'id',
          'value',
          'name',
          'label',
          'family',
          'font',
          'fontFamily',
          'fontFamilyId',
          'fontId',
          'font_id',
          'font_name',
          'fontFace',
          'css',
          'cssFamily',
        ];

        for (const key of candidateKeys) {
          if (key in record) {
            objectCandidates.push(record[key]);
          }
        }

        const recordType = record['type'];
        const recordName = record['name'];
        if (typeof recordType === 'string' && typeof recordName === 'string') {
          objectCandidates.push(`${recordType}:${recordName}`);
        }

        const recordKind = record['kind'];
        if (typeof recordKind === 'string' && typeof recordName === 'string') {
          objectCandidates.push(`${recordKind}:${recordName}`);
        }

        const recordAliases = record['aliases'];
        if (Array.isArray(recordAliases)) {
          objectCandidates.push(...recordAliases);
        }

        for (const candidate of objectCandidates) {
          const result = attempt(candidate);
          if (result) {
            return result;
          }
        }
      }

      return undefined;
    };

    for (const candidate of candidates) {
      const result = attempt(candidate);
      if (result) {
        return result;
      }
    }

    return undefined;
  }

  resolveCssFontFamily(fontId: string): string {
    const option = this.getFontOptionById(fontId);
    return option.cssFamily;
  }
}
