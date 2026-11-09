import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'pdf-annotator-batch-tabs';

/** The PDFs opened as tabs in this batch session (only their ids; the data lives in the batch store). */
@Injectable({ providedIn: 'root' })
export class BatchTabsService {
  readonly open = signal<readonly string[]>(this.read());

  add(id: string) {
    if (this.open().includes(id)) return;
    this.set([...this.open(), id]);
  }

  /** Closes a tab and returns the neighbouring one, if any, so the caller can move there. */
  close(id: string): string | null {
    const list = this.open();
    const index = list.indexOf(id);
    if (index < 0) return null;
    const next = list.filter((x) => x !== id);
    this.set(next);
    return next[index] ?? next[index - 1] ?? null;
  }

  forget(ids: readonly string[]) {
    this.set(this.open().filter((id) => !ids.includes(id)));
  }

  private set(list: readonly string[]) {
    this.open.set(list);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* private mode: the tabs just last while the page lives */
    }
  }

  private read(): readonly string[] {
    try {
      const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
    } catch {
      return [];
    }
  }
}
