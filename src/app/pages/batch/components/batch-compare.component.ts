import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import { TranslationService } from '../../../i18n/translation.service';
import type { PageAnnotations, PageField } from '../../../models/annotation.model';
import type { BatchItem } from '../../../services/batch-store.service';
import { ToastService } from '../../../services/toast.service';
import { cloneAnnotationPages, updateFieldInPages } from '../../../utils/annotation-pages.utils';
import { PreviewSettingsService } from '../../../services/preview-settings.service';
import { resolveFieldPreview } from '../../../utils/preview-values.utils';
import { boxesOverlap, fieldBox, formatPageSize } from '../../../utils/page-size.utils';

export type CoordSet = 'A' | 'B';
export type CompareMode = 'original' | 'new' | 'side' | 'overlay';
type Pane = 'orig' | 'new';

interface Sets {
  a: PageAnnotations[];
  b: PageAnnotations[];
}

interface PaneView {
  width: number;
  height: number;
}

interface FieldView {
  index: number;
  field: PageField;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  misplaced: boolean;
}

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const HISTORY_LIMIT = 100;

/** Original / new / side by side / overlay view of one PDF with draggable annotations. */
@Component({
  selector: 'app-batch-compare',
  standalone: true,
  imports: [TranslationPipe],
  templateUrl: './batch-compare.component.html',
  styleUrls: ['./batch-compare.component.scss'],
})
export class BatchCompareComponent implements OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly preview = inject(PreviewSettingsService);
  private readonly i18n = inject(TranslationService);

  readonly item = input.required<BatchItem>();
  readonly saved = output<{ layout: PageAnnotations[] | null; template: PageAnnotations[] | null; next: boolean }>();

  private readonly origCanvas = viewChild<ElementRef<HTMLCanvasElement>>('origCanvas');
  private readonly newCanvas = viewChild<ElementRef<HTMLCanvasElement>>('newCanvas');
  private readonly origScroll = viewChild<ElementRef<HTMLElement>>('origScroll');
  private readonly newScroll = viewChild<ElementRef<HTMLElement>>('newScroll');

  readonly mode = signal<CompareMode>('side');
  readonly syncScroll = signal(true);
  readonly showOutlines = signal(true);
  readonly overlayOpacity = signal(50);
  readonly pageNumber = signal(1);
  readonly scales = signal<Record<Pane, number>>({ orig: 1, new: 1 });
  readonly activePane = signal<Pane>('new');
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly views = signal<Record<Pane, PaneView | null>>({ orig: null, new: null });
  readonly selected = signal<number | null>(null);
  readonly layout = signal<PageAnnotations[]>([]);
  /** Coordinates A (the template) and which of the two sets the fields drag. */
  readonly tpl = signal<PageAnnotations[]>([]);
  readonly edit = signal<CoordSet>('A');
  readonly dirty = signal(false);
  private readonly textBoxes = signal<readonly (readonly [number, number, number, number])[]>([]);

  private undoStack: Sets[] = [];
  private redoStack: Sets[] = [];
  readonly historyVersion = signal(0);
  readonly canUndo = computed(() => this.historyVersion() >= 0 && this.undoStack.length > 0);
  readonly canRedo = computed(() => this.historyVersion() >= 0 && this.redoStack.length > 0);

  private docs: Record<Pane, PDFDocumentProxy | null> = { orig: null, new: null };
  private renderToken = 0;
  private loadToken = 0;
  private scrollLock = false;
  private drag: {
    index: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    before: Sets;
    pane: Pane;
  } | null = null;

  readonly pageCount = computed(() =>
    Math.max(this.item().pageCount, this.item().newPageCount ?? 0, 1)
  );
  readonly hasOrigPage = computed(() => this.pageNumber() <= this.item().pageCount);
  readonly hasNewPage = computed(() => this.pageNumber() <= (this.item().newPageCount ?? 0));
  readonly origSizeLabel = computed(() => formatPageSize(this.item().pageSize));
  readonly newSizeLabel = computed(() => {
    const size = this.item().newPageSize;
    return size ? formatPageSize(size) : '';
  });

  /** Without a version B only the original PDF and its coordinates (A) are shown. */
  readonly hasNew = computed(() => !!this.item().newPdf);
  readonly originalFields = computed(() => this.buildFields('orig'));
  readonly newFields = computed(() => this.buildFields('new'));
  readonly listedFields = computed(() => (this.hasNew() ? this.newFields() : this.originalFields()));
  readonly misplacedCount = computed(() => this.newFields().filter((f) => f.misplaced).length);
  readonly zoomLabel = computed(() => {
    const scales = this.scales();
    return `${Math.round(scales[this.activeScalePane()] * 100)} %`;
  });

  constructor() {
    effect(() => {
      const item = this.item();
      this.layout.set(cloneAnnotationPages(item.layout ?? []));
      this.tpl.set(cloneAnnotationPages(item.template ?? []));
      this.undoStack = [];
      this.redoStack = [];
      this.historyVersion.update((v) => v + 1);
      this.dirty.set(false);
      this.selected.set(null);
      this.pageNumber.set(1);
      void this.loadDocuments(item);
    });
    effect(() => {
      const hasNew = this.hasNew();
      untracked(() => {
        this.mode.set(hasNew ? 'side' : 'original');
        this.edit.set(hasNew ? 'B' : 'A');
      });
    });
    effect(() => {
      // Re-render whenever page, zoom or documents change.
      this.pageNumber();
      this.scales();
      this.loading();
      void this.renderAll();
    });
  }

  ngOnDestroy() {
    this.loadToken += 1;
    this.destroyDocs();
  }

  private activeScalePane(): Pane {
    return this.mode() === 'original' ? 'orig' : this.mode() === 'new' ? 'new' : this.activePane();
  }

  setMode(mode: CompareMode) {
    this.mode.set(mode);
  }

  zoom(delta: number) {
    const pane = this.activeScalePane();
    this.scales.update((current) => {
      const next = { ...current };
      const value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((current[pane] + delta) * 100) / 100));
      next[pane] = value;
      if (this.syncScroll() || this.mode() === 'overlay') {
        next.orig = value;
        next.new = value;
      }
      return next;
    });
  }

  goToPage(delta: number) {
    this.selected.set(null);
    this.pageNumber.update((p) => Math.min(this.pageCount(), Math.max(1, p + delta)));
  }

  onScroll(source: Pane, event: Event) {
    if (!this.syncScroll() || this.scrollLock || this.mode() !== 'side') return;
    const from = event.target as HTMLElement;
    const to = (source === 'orig' ? this.newScroll() : this.origScroll())?.nativeElement;
    if (!to) return;
    this.scrollLock = true;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => (this.scrollLock = false));
  }

  // ---- fields -------------------------------------------------------------------------------

  private buildFields(pane: Pane): FieldView[] {
    const view = this.views()[pane];
    if (!view) return [];
    const scale = this.scales()[pane];
    const source = pane === 'orig' ? this.tpl() : this.layout();
    const page = source.find((p) => p.num === this.pageNumber());
    if (!page) return [];
    const misplaced = pane === 'new' ? this.textBoxes() : [];
    const ctx = this.preview.context();
    return page.fields.map((field, index) => {
      const text = resolveFieldPreview(field, ctx).text;
      const box = fieldBox(field, text);
      const isMisplaced =
        pane === 'new' &&
        (box[0] < 0 ||
          box[1] < 0 ||
          box[2] > view.width / scale ||
          box[3] > view.height / scale ||
          misplaced.some((t) => boxesOverlap(this.shrink(box), t)));
      return {
        index,
        field,
        text,
        left: box[0] * scale,
        top: view.height - box[3] * scale,
        width: (box[2] - box[0]) * scale,
        height: (box[3] - box[1]) * scale,
        fontSize: field.fontSize * scale,
        misplaced: isMisplaced,
      };
    });
  }

  private shrink(box: readonly [number, number, number, number]): [number, number, number, number] {
    return [box[0] + 1, box[1] + 1, box[2] - 1, box[3] - 1];
  }

  select(index: number | null) {
    this.selected.set(index);
  }

  /** The pane whose fields can be moved: A before there is a version B, then the chosen set. */
  canEdit(pane: Pane): boolean {
    return pane === 'orig' ? this.edit() === 'A' : this.hasNew() && this.edit() === 'B';
  }

  setEdit(set: CoordSet) {
    if (set === 'B' && !this.hasNew()) return;
    this.selected.set(null);
    this.edit.set(set);
  }

  private snapshot(): Sets {
    return { a: cloneAnnotationPages(this.tpl()), b: cloneAnnotationPages(this.layout()) };
  }

  private restore(sets: Sets) {
    this.tpl.set(sets.a);
    this.layout.set(sets.b);
  }

  private markDirty(_pane: Pane) {
    this.dirty.set(true);
  }

  /** Starts version B from the coordinates A, as many times as needed. */
  copyAToB() {
    if (!this.hasNew()) return;
    const before = this.snapshot();
    this.layout.set(cloneAnnotationPages(this.tpl()));
    this.pushHistory(before);
    this.markDirty('new');
    this.edit.set('B');
  }

  /** Goes back to work on the coordinates A. */
  backToA() {
    this.setEdit('A');
  }

  onFieldPointerDown(event: PointerEvent, view: FieldView, pane: Pane = 'new') {
    if (event.button !== 0) return;
    event.preventDefault();
    this.selected.set(view.index);
    this.activePane.set(pane);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = {
      index: view.index,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.field.x,
      originY: view.field.y,
      moved: false,
      before: this.snapshot(),
      pane,
    };
  }

  onFieldPointerMove(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    const scale = this.scales()[drag.pane];
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (!drag.moved && Math.hypot(dx, dy) * scale < 3) return;
    drag.moved = true;
    this.setFieldPosition(drag.pane, drag.index, drag.originX + dx, drag.originY - dy);
  }

  onFieldPointerUp() {
    const drag = this.drag;
    this.drag = null;
    if (drag?.moved) {
      this.pushHistory(drag.before);
      this.markDirty(drag.pane);
    }
  }

  onFieldKeydown(event: KeyboardEvent, view: FieldView, pane: Pane = 'new') {
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const before = this.snapshot();
    this.setFieldPosition(pane, view.index, view.field.x + move[0], view.field.y + move[1]);
    this.pushHistory(before);
    this.markDirty(pane);
  }

  private setFieldPosition(pane: Pane, index: number, x: number, y: number) {
    const roundTo = (value: number) => Math.round(value * 100) / 100;
    const target = pane === 'orig' ? this.tpl : this.layout;
    const pageIndex = target().findIndex((p) => p.num === this.pageNumber());
    if (pageIndex < 0) return;
    target.update((pages) => {
      const current = pages[pageIndex]?.fields[index];
      return current
        ? updateFieldInPages(pageIndex, index, { ...current, x: roundTo(x), y: roundTo(y) }, pages)
        : pages;
    });
  }

  private pushHistory(before: Sets) {
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.historyVersion.update((v) => v + 1);
  }

  undo() {
    const previous = this.undoStack.pop();
    if (!previous) return;
    this.redoStack.push(this.snapshot());
    this.restore(previous);
    this.historyVersion.update((v) => v + 1);
    this.dirty.set(true);
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.historyVersion.update((v) => v + 1);
    this.dirty.set(true);
  }

  onKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
    } else if (ctrl && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.redo();
    } else if (event.altKey && ['1', '2', '3', '4'].includes(event.key)) {
      event.preventDefault();
      this.setMode((['original', 'new', 'side', 'overlay'] as const)[Number(event.key) - 1]);
    }
  }

  private changed(now: PageAnnotations[], saved: PageAnnotations[] | null | undefined): boolean {
    return JSON.stringify(now) !== JSON.stringify(saved ?? []);
  }

  save(next: boolean) {
    this.saved.emit({
      layout: this.changed(this.layout(), this.item().layout) ? cloneAnnotationPages(this.layout()) : null,
      template: this.changed(this.tpl(), this.item().template) ? cloneAnnotationPages(this.tpl()) : null,
      next,
    });
    this.dirty.set(false);
  }

  // ---- pdf.js ---------------------------------------------------------------------------------

  private destroyDocs() {
    for (const pane of ['orig', 'new'] as const) {
      void this.docs[pane]?.destroy();
      this.docs[pane] = null;
    }
  }

  private async loadDocuments(item: BatchItem) {
    const token = ++this.loadToken;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.destroyDocs();
    try {
      const { pdfjsLib } = await import('../../../utils/pdfjs-setup');
      const open = async (blob: Blob | undefined) =>
        blob
          ? pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
          : null;
      const [orig, next] = await Promise.all([open(item.pdf), open(item.newPdf)]);
      if (token !== this.loadToken) {
        void orig?.destroy();
        void next?.destroy();
        return;
      }
      this.docs = { orig, new: next };
    } catch (error) {
      console.error('No se pudieron abrir los PDF para comparar.', error);
      if (token === this.loadToken) this.loadFailed.set(true);
    } finally {
      if (token === this.loadToken) this.loading.set(false);
    }
  }

  private async renderAll() {
    if (this.loading() || this.loadFailed()) return;
    const token = ++this.renderToken;
    const page = this.pageNumber();
    const scales = this.scales();
    await Promise.all([
      this.renderPane('orig', page, scales.orig, token),
      this.renderPane('new', page, scales.new, token),
    ]);
  }

  private async renderPane(pane: Pane, pageNumber: number, scale: number, token: number) {
    const doc = this.docs[pane];
    const canvas = (pane === 'orig' ? this.origCanvas() : this.newCanvas())?.nativeElement;
    if (!doc || !canvas || pageNumber > doc.numPages) {
      this.views.update((v) => ({ ...v, [pane]: null }));
      if (pane === 'new') this.textBoxes.set([]);
      return;
    }
    const page = await doc.getPage(pageNumber);
    if (token !== this.renderToken) return;
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    try {
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    } catch {
      return;
    }
    if (token !== this.renderToken) return;
    this.views.update((v) => ({ ...v, [pane]: { width: canvas.width, height: canvas.height } }));
    if (pane === 'new') {
      await this.readTextBoxes(page);
    }
  }

  private async readTextBoxes(page: Awaited<ReturnType<PDFDocumentProxy['getPage']>>) {
    try {
      const content = await page.getTextContent();
      const boxes: [number, number, number, number][] = [];
      for (const raw of content.items) {
        const entry = raw as { str?: string; transform?: number[]; width?: number; height?: number };
        if (!entry.str?.trim() || !entry.transform) continue;
        const [, , , d, e, f] = entry.transform;
        const height = entry.height || Math.abs(d) || 10;
        boxes.push([e, f, e + (entry.width ?? 0), f + height]);
      }
      this.textBoxes.set(boxes);
    } catch {
      this.textBoxes.set([]);
    }
  }

  fieldLabel(view: FieldView): string {
    return view.text || view.field.mapField || this.i18n.translate('batch.compare.emptyField');
  }

  trackIndex = (_: number, view: FieldView) => view.index;

  notifyMisplaced() {
    const count = this.misplacedCount();
    if (count > 0) {
      this.toast.warning(this.i18n.translate('batch.compare.misplacedToast', { count }));
    }
  }
}
