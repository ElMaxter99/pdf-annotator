import { Injectable, computed, inject, signal } from '@angular/core';
import type { BatchItem, PageMapData } from '../models/batch.model';
import { suggestPageMap } from '../utils/page-map.utils';
import {
  classifyForTable,
  judgeSuggestion,
  planTables,
  type PageMapCandidate,
} from '../utils/page-map-batch.utils';
import { BatchStoreService } from './batch-store.service';
import { PdfTextService } from './pdf-text.service';

export type PageMapRowState =
  | 'pending'
  | 'reading'
  | 'applied'
  | 'doubt'
  | 'noText'
  | 'error'
  | 'untouched';

export interface PageMapRow {
  readonly id: string;
  readonly name: string;
  readonly pagesA: number;
  readonly pagesB: number;
  readonly state: PageMapRowState;
  /** Pages of B with a match, once the suggestion is done. */
  readonly matched?: number;
}

export type PageMapPhase = 'closed' | 'preparing' | 'confirm' | 'running' | 'done';

interface Prepared {
  readonly id: string;
  readonly name: string;
  readonly pagesA: number;
  readonly pagesB: number;
  readonly withB: boolean;
  readonly hasMap: boolean;
}

/** «Sugerir tablas de páginas» for several PDFs of the batch: a serial queue with a state per PDF. */
@Injectable({ providedIn: 'root' })
export class PageMapBatchService {
  private readonly store = inject(BatchStoreService);
  private readonly text = inject(PdfTextService);

  readonly phase = signal<PageMapPhase>('closed');
  /** Replace the tables that already exist. */
  readonly replace = signal(false);
  readonly rows = signal<readonly PageMapRow[]>([]);
  readonly cancelled = signal(false);
  private prepared: Prepared[] = [];
  private token = 0;
  private previous = new Map<string, PageMapData | undefined>();

  private readonly kinds = computed<PageMapCandidate[]>(() => {
    const replace = this.replace();
    return this.preparedSig().map((p) =>
      classifyForTable(
        { bPdf: p.withB ? true : null, pageMap: p.hasMap ? ({} as PageMapData) : undefined },
        p.pagesA,
        p.pagesB,
        replace,
      ),
    );
  });
  private readonly preparedSig = signal<readonly Prepared[]>([]);
  readonly plan = computed(() => planTables(this.kinds()));
  /** Existing tables among the marked PDFs (to offer «sustituir»). */
  readonly existing = computed(() => this.preparedSig().filter((p) => p.hasMap && p.withB).length);

  readonly total = computed(() => this.rows().length);
  readonly done = computed(
    () => this.rows().filter((row) => row.state !== 'pending' && row.state !== 'reading').length,
  );
  readonly current = computed(() => this.rows().find((row) => row.state === 'reading') ?? null);
  readonly applied = computed(() => this.rows().filter((row) => row.state === 'applied'));
  readonly doubtful = computed(() => this.rows().filter((row) => row.state === 'doubt'));
  readonly failed = computed(() => this.rows().filter((row) => row.state === 'error'));

  /** Opens the dialog for the marked PDFs: counts their pages to say what will be done. */
  async open(items: readonly BatchItem[]): Promise<void> {
    const token = ++this.token;
    this.cancelled.set(false);
    this.replace.set(false);
    this.rows.set([]);
    this.preparedSig.set([]);
    this.phase.set('preparing');
    const prepared: Prepared[] = [];
    for (const item of items) {
      const withB = !!item.bPdf;
      const [pagesA, pagesB] = withB
        ? await Promise.all([this.text.pageCount(item.aPdf), this.text.pageCount(item.bPdf as Blob)])
        : [0, 0];
      prepared.push({
        id: item.id,
        name: item.name,
        pagesA: pagesA ?? 0,
        pagesB: pagesB ?? 0,
        withB,
        hasMap: !!item.pageMap,
      });
      if (token !== this.token) {
        return;
      }
    }
    this.prepared = prepared;
    this.preparedSig.set(prepared);
    this.phase.set('confirm');
  }

  /** Runs the queue over the PDFs that get a table. */
  async start(): Promise<void> {
    if (this.phase() !== 'confirm') {
      return;
    }
    const kinds = this.kinds();
    const chosen = this.prepared.filter((_, i) => kinds[i] === 'suggest');
    this.previous = new Map();
    this.rows.set(
      chosen.map((p) => ({ id: p.id, name: p.name, pagesA: p.pagesA, pagesB: p.pagesB, state: 'pending' })),
    );
    this.phase.set('running');
    await this.run(chosen.map((p) => p.id));
  }

  /** Tries again the PDFs that failed. */
  async retry(): Promise<void> {
    const ids = this.failed().map((row) => row.id);
    if (!ids.length || this.phase() !== 'done') {
      return;
    }
    this.cancelled.set(false);
    this.set(ids, { state: 'pending' });
    this.phase.set('running');
    await this.run(ids);
  }

  /** Stops after the PDF in progress; what is already applied stays. */
  cancel(): void {
    if (this.phase() === 'running') {
      this.cancelled.set(true);
    }
  }

  close(): void {
    this.token++;
    this.cancelled.set(true);
    this.phase.set('closed');
  }

  /** What `undo` needs: the previous table of every applied PDF. */
  undoAll(): void {
    for (const [id, map] of this.previous) {
      this.store.setPageMap(id, map);
    }
    this.previous = new Map();
  }

  private async run(ids: readonly string[]): Promise<void> {
    const token = this.token;
    for (const id of ids) {
      if (token !== this.token) {
        return;
      }
      if (this.cancelled()) {
        this.set([id], { state: 'untouched' });
        continue;
      }
      this.set([id], { state: 'reading' });
      await this.one(id);
    }
    if (token === this.token) {
      this.phase.set('done');
    }
  }

  private async one(id: string): Promise<void> {
    const item = this.store.items().find((candidate) => candidate.id === id);
    if (!item?.bPdf) {
      this.set([id], { state: 'error' });
      return;
    }
    try {
      const [textsA, textsB] = [await this.text.pageTexts(item.aPdf), await this.text.pageTexts(item.bPdf)];
      if (!textsA || !textsB) {
        this.set([id], { state: 'error' });
        return;
      }
      if (!textsA.some((t) => t.trim()) || !textsB.some((t) => t.trim())) {
        this.set([id], { state: 'noText' });
        return;
      }
      const suggestion = suggestPageMap(textsA, textsB, null);
      const verdict = judgeSuggestion(textsA.length, textsB.length, suggestion);
      if (verdict.verdict === 'applied') {
        this.previous.set(id, item.pageMap);
        this.store.setPageMap(id, suggestion.map);
      }
      this.set([id], {
        state: verdict.verdict === 'applied' ? 'applied' : 'doubt',
        matched: verdict.matched,
        pagesA: textsA.length,
        pagesB: textsB.length,
      });
    } catch {
      this.set([id], { state: 'error' });
    }
  }

  private set(ids: readonly string[], patch: Partial<PageMapRow>): void {
    const wanted = new Set(ids);
    this.rows.update((rows) => rows.map((row) => (wanted.has(row.id) ? { ...row, ...patch } : row)));
  }
}
