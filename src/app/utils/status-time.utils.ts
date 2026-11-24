import type { BatchItem } from '../models/batch.model';

/** A timestamp a `Date` can represent (stored data is untrusted: 1e20 would make formatting throw). */
export function isValidStamp(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && Number.isFinite(new Date(value).getTime());
}

export interface StatusStamp {
  readonly at: number;
  /** Old batch without a saved change: `updatedAt` stands in (last modification, not a real change). */
  readonly approx: boolean;
}

/** When the state of an item last changed; `null` if it never did (and there is no usable guess). */
export function statusStamp(
  item: Pick<BatchItem, 'status' | 'statusAt' | 'updatedAt'>,
): StatusStamp | null {
  if (isValidStamp(item.statusAt)) {
    return { at: item.statusAt, approx: false };
  }
  if (item.status === 'ready' && isValidStamp(item.updatedAt)) {
    return { at: item.updatedAt, approx: true };
  }
  return null;
}

/** Items that carry the most recent change (ties: all of them are not marked, only the first). */
export function latestStampId(items: readonly BatchItem[]): string | null {
  let best: { id: string; at: number } | null = null;
  for (const item of items) {
    const stamp = statusStamp(item);
    if (stamp && !stamp.approx && (!best || stamp.at > best.at)) {
      best = { id: item.id, at: stamp.at };
    }
  }
  return best?.id ?? null;
}

export interface StatusTimeLabels {
  readonly today: string;
  readonly yesterday: string;
}

/** «hoy 14:32», «ayer 17:48», «24 nov 09:10», «12 dic 2025 09:10». */
export function formatStatusTime(
  at: number,
  now: number,
  locale: string,
  labels: StatusTimeLabels,
): string {
  const date = new Date(at);
  const today = new Date(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  if (days === 0) {
    return `${labels.today} ${time}`;
  }
  if (days === 1) {
    return `${labels.yesterday} ${time}`;
  }
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(date);
  return `${day} ${time}`;
}

export function formatStatusTitle(at: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'medium' }).format(
    new Date(at),
  );
}
