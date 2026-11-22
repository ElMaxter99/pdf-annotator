import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslationService } from '../i18n/translation.service';
import { getDesktopBridge, type StorageEntryInfo, type StorageGroup } from './desktop-update.service';
import { ToastService } from './toast.service';

export type StorageRowState = 'calculating' | 'ready' | 'missing' | 'error';

export interface StorageRow extends StorageEntryInfo {
  state: StorageRowState;
  bytes: number;
  partial: boolean;
  /** Se está vaciando esta fila. */
  clearing: boolean;
}

/** Tamaño legible («96 MB», «14 KB», «0 B»). Base 1024, una cifra decimal solo desde 1 GB. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`;
}

/**
 * Panel «Almacenamiento» de la app de escritorio (mesas P-125 y P-126): qué guarda la app, dónde y cuánto ocupa.
 * Los tamaños se piden fila a fila (el proceso principal los mide con tope de tiempo). Sin puente (web) no existe.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly bridge = getDesktopBridge()?.storage ?? null;
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(TranslationService);

  readonly available = this.bridge !== null;
  readonly panelOpen = signal(false);
  readonly rows = signal<StorageRow[]>([]);
  readonly loadError = signal(false);
  /** Fila cuyo «Vaciar» espera confirmación (`'all'` = «Vaciar todo esto»). */
  readonly confirming = signal<string | null>(null);
  readonly lastFreed = signal<number | null>(null);
  readonly clearError = signal<string | null>(null);
  private token = 0;

  readonly groups = computed(() =>
    (['work', 'app', 'clearable'] as StorageGroup[]).map((group) => ({ group, rows: this.rows().filter((r) => r.group === group) })),
  );
  readonly measuring = computed(() => this.rows().some((r) => r.state === 'calculating'));
  readonly total = computed(() => this.rows().reduce((n, r) => n + r.bytes, 0));
  readonly workBytes = computed(() => this.rows().filter((r) => r.group === 'work').reduce((n, r) => n + r.bytes, 0));
  readonly clearableRows = computed(() => this.rows().filter((r) => r.clearable && r.state === 'ready' && r.bytes > 0));
  readonly clearableBytes = computed(() => this.clearableRows().reduce((n, r) => n + r.bytes, 0));
  readonly confirmRows = computed(() => {
    const id = this.confirming();
    if (!id) return [];
    return id === 'all' ? this.clearableRows() : this.rows().filter((r) => r.id === id);
  });
  readonly confirmBytes = computed(() => this.confirmRows().reduce((n, r) => n + r.bytes, 0));

  open(): void {
    if (!this.bridge) return;
    this.panelOpen.set(true);
    this.lastFreed.set(null);
    this.clearError.set(null);
    this.confirming.set(null);
    void this.load();
  }
  close(): void {
    this.panelOpen.set(false);
    this.confirming.set(null);
    this.token += 1;
  }

  async load(): Promise<void> {
    const bridge = this.bridge;
    if (!bridge) return;
    const mine = ++this.token;
    this.loadError.set(false);
    try {
      const { entries } = await bridge.list();
      if (mine !== this.token) return;
      this.rows.set(entries.map((e) => ({ ...e, state: 'calculating', bytes: 0, partial: false, clearing: false })));
    } catch {
      if (mine === this.token) this.loadError.set(true);
      return;
    }
    await Promise.all(this.rows().map((r) => this.measure(r.id, mine)));
  }

  private async measure(id: string, mine = this.token): Promise<void> {
    let patch: Partial<StorageRow>;
    try {
      const size = await this.bridge!.size(id);
      patch = size ? { state: size.exists ? 'ready' : 'missing', bytes: size.bytes, partial: size.partial } : { state: 'error' };
    } catch {
      patch = { state: 'error' };
    }
    if (mine === this.token) this.patch(id, patch);
  }

  private patch(id: string, patch: Partial<StorageRow>): void {
    this.rows.update((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  askClear(id: string): void {
    this.clearError.set(null);
    this.confirming.set(id);
  }
  cancelClear(): void {
    this.confirming.set(null);
  }

  /** Vacía la fila confirmada (o todas las vaciables) y vuelve a medir. */
  async confirmClear(): Promise<void> {
    const bridge = this.bridge;
    const ids = this.confirmRows().map((r) => r.id);
    this.confirming.set(null);
    if (!bridge || !ids.length) return;
    this.clearError.set(null);
    let freed = 0;
    let failed: string | null = null;
    for (const id of ids) {
      this.patch(id, { clearing: true });
      try {
        const res = await bridge.clear(id);
        if (res.ok) freed += res.freed ?? 0;
        else failed ??= id;
      } catch {
        failed ??= id;
      }
      await this.measure(id);
      this.patch(id, { clearing: false });
    }
    if (failed) this.clearError.set(failed);
    else this.lastFreed.set(freed);
  }

  async reveal(id: string): Promise<void> {
    if (!this.bridge) return;
    let result = '';
    try {
      result = await this.bridge.reveal(id);
    } catch {
      result = 'error';
    }
    if (result === '') return;
    this.toast.error(this.i18n.translate(result === 'missing' ? 'storage.toast.missing' : 'storage.toast.openFailed'));
  }

  async copyPath(row: StorageRow): Promise<void> {
    try {
      await navigator.clipboard.writeText(row.path);
      this.toast.show(this.i18n.translate('storage.toast.copied'));
    } catch {
      this.toast.error(this.i18n.translate('storage.toast.copyFailed'));
    }
  }
}
