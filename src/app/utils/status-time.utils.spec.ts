import type { BatchItem } from '../models/batch.model';
import { formatStatusTime, latestStampId, statusStamp } from './status-time.utils';

const item = (id: string, over: Partial<BatchItem> = {}): BatchItem =>
  ({ id, name: id, status: 'review', updatedAt: 1000, ...over }) as BatchItem;
const labels = { today: 'hoy', yesterday: 'ayer' };

describe('status-time.utils', () => {
  it('uses statusAt and falls back to updatedAt only for old ready items', () => {
    expect(statusStamp(item('a', { statusAt: 50 }))).toEqual({ at: 50, approx: false });
    expect(statusStamp(item('b', { status: 'ready' }))).toEqual({ at: 1000, approx: true });
    expect(statusStamp(item('c'))).toBeNull();
  });

  it('ignores timestamps outside the Date range', () => {
    expect(statusStamp(item('a', { statusAt: 1e20 }))).toBeNull();
    expect(statusStamp(item('b', { status: 'ready', updatedAt: 1e20 }))).toBeNull();
    expect(statusStamp(item('c', { status: 'ready', statusAt: 1e20, updatedAt: 5 }))).toEqual({
      at: 5,
      approx: true,
    });
  });

  it('marks the latest real change only', () => {
    const items = [
      item('a', { statusAt: 10 }),
      item('b', { statusAt: 30 }),
      item('c', { status: 'ready', updatedAt: 99999 }),
    ];
    expect(latestStampId(items)).toBe('b');
  });

  it('formats today, yesterday and older dates', () => {
    const now = new Date(2026, 10, 24, 15, 0).getTime();
    expect(formatStatusTime(new Date(2026, 10, 24, 14, 32).getTime(), now, 'es-ES', labels)).toBe(
      'hoy 14:32',
    );
    expect(formatStatusTime(new Date(2026, 10, 23, 17, 48).getTime(), now, 'es-ES', labels)).toBe(
      'ayer 17:48',
    );
    expect(
      formatStatusTime(new Date(2025, 11, 12, 9, 10).getTime(), now, 'es-ES', labels),
    ).toContain('2025');
  });
});
