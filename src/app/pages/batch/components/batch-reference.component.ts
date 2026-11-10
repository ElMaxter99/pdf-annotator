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
  viewChild,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { TranslationPipe } from '../../../i18n/translation.pipe';
import type { PageField } from '../../../models/annotation.model';
import type { BatchItem } from '../../../services/batch-store.service';
import { PreviewSettingsService } from '../../../services/preview-settings.service';
import { fieldBox } from '../../../utils/page-size.utils';
import { resolveFieldPreview } from '../../../utils/preview-values.utils';

export interface ReferencePick {
  field: PageField;
  pageNum: number;
}

interface RefBox {
  field: PageField;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  text: string;
  used: boolean;
}

/** PDF A with its template: read-only reference shown next to the editable PDF B. */
@Component({
  selector: 'app-batch-reference',
  standalone: true,
  imports: [TranslationPipe],
  template: `
    <section class="ref" [attr.aria-label]="'batch.editor.refTitle' | t">
      <header class="ref__bar">
        <span class="ref__tag">A</span>
        <span class="ref__txt"><b>{{ 'batch.editor.aTitle' | t }}</b></span>
        <span class="ref__nav">
          <button type="button" class="ref__btn" id="ref-prev" (click)="go(-1)" [disabled]="page() <= 1"
            [attr.aria-label]="'controls.prev' | t">‹</button>
          <span id="ref-page">{{ page() }} / {{ pages() }}</span>
          <button type="button" class="ref__btn" id="ref-next" (click)="go(1)" [disabled]="page() >= pages()"
            [attr.aria-label]="'controls.next' | t">›</button>
          @if (linkable()) {
            <button type="button" class="ref__btn" id="ref-link" [class.on]="linked()"
              (click)="linked.set(!linked())" [attr.aria-pressed]="linked()"
              [attr.title]="'batch.editor.link' | t">⛓</button>
          }
        </span>
      </header>
      <div class="ref__scroll">
        <div class="ref__page" [style.width.px]="size().width" [style.height.px]="size().height">
          <canvas #canvas></canvas>
          @for (b of boxes(); track $index) {
            <button type="button" class="ref__fld" [class.is-focus]="b.field.mapField && b.field.mapField === focusKey()"
              [class.is-unused]="!b.used" [style.left.px]="b.left" [style.top.px]="b.top"
              [style.width.px]="b.width" [style.height.px]="b.height" [style.fontSize.px]="b.fontSize"
              [attr.title]="b.field.mapField || ''" (click)="pick.emit({ field: b.field, pageNum: page() })">{{ b.text }}</button>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host { display: block; flex: 0 0 auto; min-width: 0; }
    .ref { display: flex; flex-direction: column; gap: 8px; background: var(--panel); border: 1px solid var(--line, rgba(255,255,255,.14)); border-radius: 16px; padding: 10px; }
    .ref__bar { height: 48px; display: flex; align-items: center; gap: 10px; }
    .ref__tag { width: 28px; height: 28px; display: grid; place-items: center; font-size: 12px; font-weight: 700; border-radius: 999px; background: color-mix(in srgb, var(--text) 12%, transparent); flex: none; }
    .ref__txt { flex: 1; min-width: 0; display: flex; flex-direction: column; b { font-size: 14px; } small { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
    .ref__nav { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }
    .ref__btn { font: inherit; min-width: 32px; min-height: 32px; border-radius: 10px; border: 1px solid var(--line, rgba(255,255,255,.25)); background: transparent; color: var(--text); cursor: pointer;
      &[disabled] { opacity: .4; cursor: default; } &.on { background: var(--accent); color: var(--bg); } &:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; } }
    .ref__scroll { overflow: auto; max-height: calc(100vh - 220px); }
    .ref__page { position: relative; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.35); canvas { display: block; } }
    .ref__fld { position: absolute; box-sizing: border-box; border: 2px solid #0f9b8e; background: rgba(15,155,142,.16); border-radius: 3px; color: #0b3b36; line-height: 1; white-space: nowrap; overflow: hidden; display: flex; align-items: flex-end; padding: 0; cursor: pointer; font-family: inherit;
      &.is-unused { border-style: dashed; border-color: #d97706; background: rgba(217,119,6,.14); }
      &.is-focus { outline: 2px solid var(--accent); outline-offset: 1px; box-shadow: 0 0 0 4px rgba(94,234,212,.35); } }
  `,
})
export class BatchReferenceComponent implements OnDestroy {
  readonly item = input.required<BatchItem>();
  readonly scale = input(1.5);
  /** Width in px of the page of B: A is drawn at the same width whatever its real size. */
  readonly targetWidth = input(0);
  readonly focusKey = input<string | null>(null);
  /** Page being shown in B, to follow when the pages are linked. */
  readonly pageB = input(1);
  readonly pagesB = input(0);
  /** mapField names present in B: the rest are A fields not used yet. */
  readonly usedKeys = input<ReadonlySet<string>>(new Set());
  readonly pick = output<ReferencePick>();

  private readonly preview = inject(PreviewSettingsService);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private doc: PDFDocumentProxy | null = null;
  private token = 0;

  readonly page = signal(1);
  readonly pages = signal(1);
  readonly linked = signal(true);
  readonly size = signal({ width: 0, height: 0 });
  private readonly drawScale = signal(1.5);
  readonly linkable = computed(() => this.pages() === this.pagesB());
  private readonly loaded = signal(0);

  readonly boxes = computed<RefBox[]>(() => {
    this.loaded();
    const { width, height } = this.size();
    const scale = this.drawScale();
    const page = (this.item().template ?? []).find((p) => p.num === this.page());
    if (!page || !width) return [];
    const ctx = this.preview.context();
    const used = this.usedKeys();
    return page.fields.map((field) => {
      const text = resolveFieldPreview(field, ctx).text;
      const box = fieldBox(field, text);
      return {
        field,
        text,
        left: box[0] * scale,
        top: height - box[3] * scale,
        width: (box[2] - box[0]) * scale,
        height: (box[3] - box[1]) * scale,
        fontSize: field.fontSize * scale,
        used: !field.mapField || used.has(field.mapField),
      };
    });
  });

  constructor() {
    effect(() => {
      const blob = this.item().pdf;
      void this.open(blob);
    });
    effect(() => {
      if (this.linked() && this.linkable()) this.page.set(Math.min(this.pageB(), this.pages()));
    });
    effect(() => {
      this.page();
      this.scale();
      this.targetWidth();
      this.loaded();
      void this.render();
    });
  }

  ngOnDestroy() {
    this.token += 1;
    void this.doc?.destroy();
  }

  go(delta: number) {
    this.linked.set(false);
    this.page.update((p) => Math.min(this.pages(), Math.max(1, p + delta)));
  }

  private async open(blob: Blob) {
    const token = ++this.token;
    try {
      const { pdfjsLib } = await import('../../../utils/pdfjs-setup');
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
      if (token !== this.token) {
        void doc.destroy();
        return;
      }
      void this.doc?.destroy();
      this.doc = doc;
      this.pages.set(doc.numPages);
      this.loaded.update((n) => n + 1);
    } catch (error) {
      console.error('No se pudo abrir el PDF A.', error);
    }
  }

  private renderToken = 0;
  private async render() {
    const doc = this.doc;
    const canvas = this.canvas()?.nativeElement;
    if (!doc || !canvas) return;
    const token = ++this.renderToken;
    const page = await doc.getPage(Math.min(this.page(), doc.numPages));
    if (token !== this.renderToken) return;
    const base = page.getViewport({ scale: 1 }).width;
    const target = this.targetWidth();
    const drawScale = target > 0 && base > 0 ? target / base : this.scale();
    const viewport = page.getViewport({ scale: drawScale });
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    try {
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
    } catch {
      return;
    }
    if (token === this.renderToken) {
      this.drawScale.set(drawScale);
      this.size.set({ width: canvas.width, height: canvas.height });
    }
  }
}
