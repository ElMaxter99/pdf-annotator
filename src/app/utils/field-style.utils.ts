import { PageField } from '../models/annotation.model';
import { DEFAULT_FONT_ID } from '../fonts/font-catalog.service';
import { normalizeColor } from './color.utils';
import {
  normalizeFieldDecimals,
  normalizeFieldType,
  sanitizeOptionalAppender,
  sanitizeTextPreservingSpacing,
} from './annotation-fields.utils';
import { toFiniteNumber } from './number.utils';
import { DEFAULT_DATE_FORMAT, sanitizeDateFormat } from './date-format.utils';

export const DEFAULT_OPACITY = 1;

/** Resolves a raw font family name to a known catalog id. */
export type FontNormalizer = (fontFamily: string | null | undefined) => string;

export function fieldHasRenderableContent(field: PageField): boolean {
  const valueText = typeof field.value === 'string' ? field.value.trim() : '';
  if (valueText) {
    return true;
  }

  const type = normalizeFieldType(field.type);
  if (type === 'check' || type === 'radio') {
    return true;
  }

  return field.mapField.trim().length > 0;
}

export function normalizeOpacityValue(value: unknown): number | undefined {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return undefined;
  }
  const clamped = Math.min(Math.max(numeric, 0), 1);
  return Math.round(clamped * 100) / 100;
}

export function normalizeBackgroundColor(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'transparent') {
    return undefined;
  }
  return normalizeColor(trimmed);
}

export function ensureFieldStyle(field: PageField, normalizeFontFamily: FontNormalizer): PageField {
  const fontFamily = normalizeFontFamily(field.fontFamily);
  const opacity = normalizeOpacityValue(field.opacity) ?? DEFAULT_OPACITY;
  const background = normalizeBackgroundColor(field.backgroundColor) ?? null;
  const locked = !!field.locked;
  const hidden = !!field.hidden;
  const legacyField = field as PageField & {
    fontWeight?: unknown;
    textAlign?: unknown;
  };
  const hasLegacyWeight = Object.prototype.hasOwnProperty.call(legacyField, 'fontWeight');
  const hasLegacyAlign = Object.prototype.hasOwnProperty.call(legacyField, 'textAlign');

  if (
    field.fontFamily === fontFamily &&
    (field.opacity ?? DEFAULT_OPACITY) === opacity &&
    (field.backgroundColor ?? null) === background &&
    (field.locked ?? false) === locked &&
    (field.hidden ?? false) === hidden &&
    !hasLegacyWeight &&
    !hasLegacyAlign
  ) {
    return field;
  }

  const { fontWeight: _legacyWeight, textAlign: _legacyAlign, ...rest } = legacyField;

  return {
    ...rest,
    fontFamily,
    opacity,
    backgroundColor: background,
    locked,
    hidden,
  };
}

export function prepareFieldForStorage(
  field: PageField,
  normalizeFontFamily: FontNormalizer,
): PageField {
  const styled = ensureFieldStyle(field, normalizeFontFamily);
  const type = normalizeFieldType(styled.type);
  const base: PageField = {
    x: styled.x,
    y: styled.y,
    mapField: typeof styled.mapField === 'string' ? styled.mapField : '',
    fontSize: styled.fontSize,
    color: normalizeColor(styled.color),
    type,
    fontFamily: styled.fontFamily ?? DEFAULT_FONT_ID,
    opacity: styled.opacity ?? DEFAULT_OPACITY,
    backgroundColor: styled.backgroundColor ?? null,
    locked: !!styled.locked,
    hidden: !!styled.hidden,
  };

  const value = sanitizeTextPreservingSpacing(styled.value);
  if (value !== undefined) {
    base.value = value;
  }

  if (typeof styled.aiId === 'string') {
    base.aiId = styled.aiId;
  }

  if (type === 'number') {
    const decimals = normalizeFieldDecimals(styled.decimals);
    if (decimals !== undefined) {
      base.decimals = decimals;
    }
    const appender = sanitizeOptionalAppender(styled.appender);
    if (appender !== undefined) {
      base.appender = appender;
    }
  }

  if (type === 'date') {
    base.dateFormat = sanitizeDateFormat(styled.dateFormat) ?? DEFAULT_DATE_FORMAT;
  }

  return base;
}

export function prepareFieldForForm(
  field: PageField,
  normalizeFontFamily: FontNormalizer,
): PageField {
  const styled = ensureFieldStyle(field, normalizeFontFamily);
  const decimals =
    typeof styled.decimals === 'number' && Number.isFinite(styled.decimals)
      ? Math.max(0, Math.round(styled.decimals))
      : null;

  return {
    ...styled,
    value: typeof styled.value === 'string' ? styled.value : '',
    appender: typeof styled.appender === 'string' ? styled.appender : '',
    decimals,
    dateFormat: typeof styled.dateFormat === 'string' ? styled.dateFormat : '',
    locked: !!styled.locked,
    hidden: !!styled.hidden,
  };
}

export function areFieldsEqual(
  a: PageField,
  b: PageField,
  normalizeFontFamily: FontNormalizer,
): boolean {
  const sanitizedA = prepareFieldForStorage(a, normalizeFontFamily);
  const sanitizedB = prepareFieldForStorage(b, normalizeFontFamily);

  return (
    sanitizedA.x === sanitizedB.x &&
    sanitizedA.y === sanitizedB.y &&
    sanitizedA.mapField === sanitizedB.mapField &&
    sanitizedA.fontSize === sanitizedB.fontSize &&
    sanitizedA.color === sanitizedB.color &&
    sanitizedA.type === sanitizedB.type &&
    (sanitizedA.value ?? undefined) === (sanitizedB.value ?? undefined) &&
    (sanitizedA.appender ?? undefined) === (sanitizedB.appender ?? undefined) &&
    (sanitizedA.decimals ?? undefined) === (sanitizedB.decimals ?? undefined) &&
    (sanitizedA.dateFormat ?? undefined) === (sanitizedB.dateFormat ?? undefined) &&
    (sanitizedA.fontFamily ?? DEFAULT_FONT_ID) === (sanitizedB.fontFamily ?? DEFAULT_FONT_ID) &&
    (sanitizedA.opacity ?? DEFAULT_OPACITY) === (sanitizedB.opacity ?? DEFAULT_OPACITY) &&
    (sanitizedA.backgroundColor ?? null) === (sanitizedB.backgroundColor ?? null) &&
    (sanitizedA.locked ?? false) === (sanitizedB.locked ?? false) &&
    (sanitizedA.hidden ?? false) === (sanitizedB.hidden ?? false)
  );
}
