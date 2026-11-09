import type { PageField } from '../models/annotation.model';
import {
  normalizeFieldDecimals,
  normalizeFieldType,
  sanitizeOptionalAppender,
} from './annotation-fields.utils';
import { formatNumberWithTruncation, toFiniteNumber } from './number.utils';

/** Text that is actually painted for a field (value / X for checks / formatted number). */
export function fieldRenderText(field: PageField): string {
  const override = typeof field.value === 'string' && field.value.trim() ? field.value : undefined;
  if (override !== undefined) {
    return override;
  }

  const type = normalizeFieldType(field.type);
  if (type === 'check' || type === 'radio') {
    return 'X';
  }

  const baseText = typeof field.mapField === 'string' ? field.mapField : '';

  if (type === 'number') {
    const numeric = toFiniteNumber(baseText);
    if (numeric !== null) {
      const decimals = normalizeFieldDecimals(field.decimals);
      const formatted =
        decimals !== undefined ? formatNumberWithTruncation(numeric, decimals) : baseText;
      const appender = sanitizeOptionalAppender(field.appender) ?? '';
      return `${formatted}${appender}`;
    }
  }

  return baseText;
}
