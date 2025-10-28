import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  signal,
  AfterViewChecked,
  HostListener,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import { Meta, Title } from '@angular/platform-browser';
import { TranslationPipe } from './i18n/translation.pipe';
import { Language, TranslationService } from './i18n/translation.service';
import { APP_AUTHOR, APP_NAME, APP_VERSION } from './app-version';
import './promise-with-resolvers.polyfill';
import './array-buffer-transfer.polyfill';

const PDF_WORKER_MODULE_SRC = '/assets/pdfjs/pdf.worker.entry.mjs';
const PDF_WORKER_TYPE_MODULE = 'module';

function supportsModuleWorkers(): boolean {
  if (
    typeof Worker === 'undefined' ||
    typeof Blob === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return false;
  }

  let url: string | null = null;

  try {
    const blob = new Blob([''], { type: 'application/javascript' });
    url = URL.createObjectURL(blob);
    const tester = new Worker(url, { type: 'module' });
    tester.terminate();
    return true;
  } catch {
    return false;
  } finally {
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}

const workerOptions = (pdfjsLib as any).GlobalWorkerOptions as {
  workerSrc?: string;
  workerType?: string;
};

if (supportsModuleWorkers()) {
  workerOptions.workerSrc = PDF_WORKER_MODULE_SRC;
  workerOptions.workerType = PDF_WORKER_TYPE_MODULE;
} else {
  workerOptions.workerSrc = undefined;
  workerOptions.workerType = undefined;
}

type PageField = {
  x: number;
  y: number;
  mapField: string;
  fontSize: number;
  color: string;
};

type PageAnnotations = { num: number; fields: PageField[] };

type PreviewState = { page: number; field: PageField } | null;

type EditState = { pageIndex: number; fieldIndex: number; field: PageField } | null;

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [CommonModule, FormsModule, TranslationPipe],
  styleUrls: ['./app.scss'],
})
export class App implements AfterViewChecked {
  pdfDoc: PDFDocumentProxy | null = null;
  pageIndex = signal(1);
  scale = signal(1.5);
  coords = signal<PageAnnotations[]>([]);
  preview = signal<PreviewState>(null);
  editing = signal<EditState>(null);
  previewHexInput = signal('#000000');
  previewRgbInput = signal('rgb(0, 0, 0)');
  editHexInput = signal('#000000');
  editRgbInput = signal('rgb(0, 0, 0)');
  coordsTextModel = JSON.stringify({ pages: [] }, null, 2);
  readonly version = APP_VERSION;
  readonly appName = APP_NAME;
  readonly appAuthor = APP_AUTHOR;
  readonly currentYear = new Date().getFullYear();
  private readonly translationService = inject(TranslationService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  readonly languages: readonly Language[] = this.translationService.supportedLanguages;
  languageModel: Language = this.translationService.getCurrentLanguage();

  private dragInfo: {
    pageIndex: number;
    fieldIndex: number;
    pointerId: number;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    fontSize: number;
    moved: boolean;
  } | null = null;
  private draggingElement: HTMLDivElement | null = null;
  private pdfByteSources = new Map<string, { bytes: Uint8Array; weight: number }>();

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false })
  annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewEditor') previewEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editEditor') editEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('coordsFileInput', { static: false }) coordsFileInputRef?: ElementRef<HTMLInputElement>;

  constructor() {
    this.setDocumentMetadata();
    this.syncCoordsTextModel();
  }

  onLanguageChange(language: string) {
    this.translationService.setLanguage(language as Language);
    this.languageModel = this.translationService.getCurrentLanguage();
  }

  private setDocumentMetadata() {
    const appTitle = APP_NAME;
    this.title.setTitle(appTitle);
    this.meta.updateTag({ property: 'og:title', content: appTitle });
    this.meta.updateTag({ name: 'twitter:title', content: appTitle });
  }

  ngAfterViewChecked() {
    if (this.preview()) {
      const previewEl = this.previewEditorRef?.nativeElement;
      if (previewEl) {
        const input = previewEl.querySelector('input[type="text"]') as HTMLInputElement | null;
        input?.focus();
      }
      return;
    }

    if (this.editing()) {
      const editEl = this.editEditorRef?.nativeElement;
      if (editEl) {
        const input = editEl.querySelector('input[type="text"]') as HTMLInputElement | null;
        input?.focus();
      }
    }
  }

  onEditorKeydown(event: KeyboardEvent, mode: 'preview' | 'edit') {
    const triggerAction = (action: 'confirm' | 'cancel') => {
      event.preventDefault();
      this.invokeEditorAction(mode, action);
    };

    switch (event.key) {
      case 'Enter':
        triggerAction('confirm');
        break;
      case 'Escape':
        triggerAction('cancel');
        break;
      default:
        break;
    }
  }

  private invokeEditorAction(mode: 'preview' | 'edit', action: 'confirm' | 'cancel') {
    if (mode === 'preview') {
      action === 'confirm' ? this.confirmPreview() : this.cancelPreview();
    } else {
      action === 'confirm' ? this.confirmEdit() : this.cancelEdit();
    }
  }

  get pageCount() {
    return this.pdfDoc?.numPages ?? 0;
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.pdfByteSources.clear();
    const buf = await file.arrayBuffer();
    const typed = new Uint8Array(buf);
    this.rememberPdfBytes(typed, 0);

    const loadingTask = pdfjsLib.getDocument({ data: typed });
    const loadedPdf = await loadingTask.promise;
    this.pdfDoc = loadedPdf;

    try {
      const canonicalData = await loadedPdf.getData();
      this.rememberPdfBytes(canonicalData, 1);
    } catch (error) {
      console.warn('No se pudo obtener una copia canonizada del PDF cargado.', error);
    }

    if (typeof loadedPdf.saveDocument === 'function') {
      try {
        const sanitizedData = await loadedPdf.saveDocument();
        const typedSanitized =
          sanitizedData instanceof Uint8Array ? sanitizedData : new Uint8Array(sanitizedData);
        this.rememberPdfBytes(typedSanitized, 2);
      } catch (error) {
        console.warn('No se pudo sanear el PDF cargado.', error);
      }
    }

    this.pageIndex.set(1);
    this.clearAll();
    this.preview.set(null);
    this.editing.set(null);
    await this.render();
  }

  async render() {
    if (!this.pdfDoc) {
      return;
    }

    const page: PDFPageProxy = await this.pdfDoc.getPage(this.pageIndex());
    const viewport = page.getViewport({ scale: this.scale() });

    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;
  }

  private domToPdfCoords(evt: MouseEvent) {
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const xPx = evt.clientX - rect.left;
    const yPx = evt.clientY - rect.top;
    const scale = this.scale();
    return { x: +(xPx / scale).toFixed(2), y: +((canvas.height - yPx) / scale).toFixed(2) };
  }

  onHitboxClick(evt: MouseEvent) {
    if (!this.pdfDoc || this.editing()) return;
    const pt = this.domToPdfCoords(evt);
    if (!pt) return;

    const defaultColor = '#000000';
    this.preview.set({
      page: this.pageIndex(),
      field: {
        x: pt.x,
        y: pt.y,
        mapField: '',
        fontSize: 14,
        color: defaultColor,
      },
    });
    this.updatePreviewColorState(defaultColor);
  }

  private normalizeColor(color: string) {
    if (color.startsWith('#')) {
      const hex =
        color.length === 4
          ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
          : color;
      return hex.toLowerCase();
    }

    const match = color.match(
      /^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i
    );
    if (!match) return color;

    const [, r, g, b] = match;
    const toHex = (value: string) => {
      const num = Math.max(0, Math.min(255, parseInt(value, 10)));
      return num.toString(16).padStart(2, '0');
    };

    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private normalizeHexInput(value: string) {
    const trimmed = value.trim();
    const match = trimmed.match(/^#?([a-f\d]{3}|[a-f\d]{6})$/i);
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    return `#${hex.toLowerCase()}`;
  }

  private parseRgbText(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const rgbMatch = trimmed.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    const fallbackMatch = trimmed.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
    const match = rgbMatch ?? fallbackMatch;
    if (!match) return null;
    const [, r, g, b] = match;
    const clamp = (num: number) => Math.max(0, Math.min(255, num));
    return {
      r: clamp(parseInt(r, 10)),
      g: clamp(parseInt(g, 10)),
      b: clamp(parseInt(b, 10)),
    };
  }

  private rgbToHex(rgb: { r: number; g: number; b: number }) {
    const toHex = (num: number) => num.toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  private parseColorComponents(color: string) {
    const hex = this.normalizeHexInput(color);
    if (hex) {
      return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
      };
    }

    const match = color.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
    if (!match) return null;
    return {
      r: Math.max(0, Math.min(255, parseInt(match[1], 10))),
      g: Math.max(0, Math.min(255, parseInt(match[2], 10))),
      b: Math.max(0, Math.min(255, parseInt(match[3], 10))),
    };
  }

  private toRgbString(color: string) {
    const comps = this.parseColorComponents(color);
    if (!comps) return '';
    return `rgb(${comps.r}, ${comps.g}, ${comps.b})`;
  }

  private ensureHex(color: string) {
    const normalized = this.normalizeColor(color);
    return normalized.startsWith('#') ? normalized : null;
  }

  private updatePreviewColorState(color: string) {
    const hex = this.ensureHex(color);
    if (hex) {
      this.previewHexInput.set(hex);
      this.previewRgbInput.set(this.toRgbString(hex));
    } else {
      this.previewHexInput.set(color.trim());
      this.previewRgbInput.set(this.toRgbString(color));
    }
  }

  private updateEditingColorState(color: string) {
    const hex = this.ensureHex(color);
    if (hex) {
      this.editHexInput.set(hex);
      this.editRgbInput.set(this.toRgbString(hex));
    } else {
      this.editHexInput.set(color.trim());
      this.editRgbInput.set(this.toRgbString(color));
    }
  }

  setPreviewColorFromHex(value: string) {
    this.previewHexInput.set(value);
    const normalized = this.normalizeHexInput(value);
    if (!normalized) return;
    this.preview.update((p) =>
      p ? { ...p, field: { ...p.field, color: normalized } } : p
    );
    this.updatePreviewColorState(normalized);
  }

  setPreviewColorFromRgb(value: string) {
    this.previewRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: hex } } : p));
    this.updatePreviewColorState(hex);
  }

  onPreviewColorPicker(value: string) {
    this.preview.update((p) => (p ? { ...p, field: { ...p.field, color: value } } : p));
    this.updatePreviewColorState(value);
  }

  setEditColorFromHex(value: string) {
    this.editHexInput.set(value);
    const normalized = this.normalizeHexInput(value);
    if (!normalized) return;
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: normalized } } : e));
    this.updateEditingColorState(normalized);
  }

  setEditColorFromRgb(value: string) {
    this.editRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: hex } } : e));
    this.updateEditingColorState(hex);
  }

  onEditColorPicker(value: string) {
    this.editing.update((e) => (e ? { ...e, field: { ...e.field, color: value } } : e));
    this.updateEditingColorState(value);
  }

  confirmPreview() {
    const p = this.preview();
    if (!p || !p.field.mapField.trim()) {
      this.preview.set(null);
      return;
    }
    const normalizedField: PageField = {
      ...p.field,
      color: this.normalizeColor(p.field.color),
    };
    this.coords.update((pages) => this.addFieldToPages(p.page, normalizedField, pages));
    this.syncCoordsTextModel();
    this.preview.set(null);
    this.redrawAllForPage();
  }

  cancelPreview() {
    this.preview.set(null);
  }

  startEditing(pageIndex: number, fieldIndex: number, field: PageField) {
    const normalized: PageField = { ...field, color: this.normalizeColor(field.color) };
    if (normalized.color !== field.color) {
      this.coords.update((pages) =>
        this.updateFieldInPages(pageIndex, fieldIndex, normalized, pages)
      );
      this.syncCoordsTextModel();
    }
    this.editing.set({ pageIndex, fieldIndex, field: { ...normalized } });
    this.updateEditingColorState(normalized.color);
    this.preview.set(null);
  }

  confirmEdit() {
    const e = this.editing();
    if (!e) return;
    const normalized: PageField = {
      ...e.field,
      color: this.normalizeColor(e.field.color),
    };
    this.coords.update((pages) =>
      this.updateFieldInPages(e.pageIndex, e.fieldIndex, normalized, pages)
    );
    this.syncCoordsTextModel();
    this.editing.set(null);
    this.redrawAllForPage();
  }

  cancelEdit() {
    this.editing.set(null);
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent) {
    const editState = this.editing();
    if (!editState) return;

    const modal = this.editEditorRef?.nativeElement;
    if (!modal) return;

    const target = event.target as Node | null;
    if (target && modal.contains(target)) {
      return;
    }

    this.cancelEdit();
  }

  deleteAnnotation() {
    const e = this.editing();
    if (!e) return;
    this.coords.update((pages) => this.removeFieldFromPages(e.pageIndex, e.fieldIndex, pages));
    this.syncCoordsTextModel();
    this.editing.set(null);
    this.redrawAllForPage();
  }

  private addFieldToPages(
    pageNum: number,
    field: PageField,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    const pageIndex = pages.findIndex((page) => page.num === pageNum);
    if (pageIndex >= 0) {
      return pages.map((page, idx) =>
        idx === pageIndex ? { ...page, fields: [...page.fields, field] } : page
      );
    }
    return [...pages, { num: pageNum, fields: [field] }].sort((a, b) => a.num - b.num);
  }

  private updateFieldInPages(
    pageIndex: number,
    fieldIndex: number,
    field: PageField,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    return pages.map((page, idx) => {
      if (idx !== pageIndex) {
        return page;
      }
      if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
        return page;
      }
      const updatedFields = page.fields.map((item, itemIdx) =>
        itemIdx === fieldIndex ? { ...field } : item
      );
      return { ...page, fields: updatedFields };
    });
  }

  private removeFieldFromPages(
    pageIndex: number,
    fieldIndex: number,
    pages: PageAnnotations[]
  ): PageAnnotations[] {
    return pages
      .map((page, idx) => {
        if (idx !== pageIndex) {
          return page;
        }
        if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
          return page;
        }
        const updatedFields = page.fields.filter((_, i) => i !== fieldIndex);
        return { ...page, fields: updatedFields };
      })
      .filter((page) => page.fields.length > 0);
  }

  redrawAllForPage() {
    const overlay = this.overlayCanvasRef?.nativeElement;
    overlay?.getContext('2d')?.clearRect(0, 0, overlay!.width, overlay!.height);

    const layer = this.annotationsLayerRef?.nativeElement;
    if (!layer) return;
    layer.innerHTML = '';

    const scale = this.scale();
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!pdfCanvas) return;

    this.coords()
      .map((page, pageIndex) => ({ page, pageIndex }))
      .filter(({ page }) => page.num === this.pageIndex())
      .forEach(({ page, pageIndex }) => {
        page.fields.forEach((field, fieldIndex) => {
          const left = field.x * scale;
          const top = pdfCanvas.height - field.y * scale;

          const el = document.createElement('div');
          el.className = 'annotation';
          el.textContent = field.mapField;
          el.style.left = `${left}px`;
          el.style.top = `${top - field.fontSize * scale}px`;
          el.style.fontSize = `${field.fontSize * scale}px`;
          el.style.color = field.color;
          el.style.fontFamily = 'Helvetica, Arial, sans-serif';

          el.onpointerdown = (evt) =>
            this.handleAnnotationPointerDown(evt, pageIndex, fieldIndex);
          layer.appendChild(el);
        });
      });
  }

  private handleAnnotationPointerDown(evt: PointerEvent, pageIndex: number, fieldIndex: number) {
    evt.preventDefault();
    evt.stopPropagation();
    const el = evt.currentTarget as HTMLDivElement | null;
    if (!el) return;

    const computedFontSize = parseFloat(getComputedStyle(el).fontSize || '0');
    this.dragInfo = {
      pageIndex,
      fieldIndex,
      pointerId: evt.pointerId,
      startX: evt.clientX,
      startY: evt.clientY,
      startLeft: parseFloat(el.style.left || '0'),
      startTop: parseFloat(el.style.top || '0'),
      fontSize: computedFontSize,
      moved: false,
    };

    this.draggingElement = el;
    el.setPointerCapture(evt.pointerId);
    el.classList.add('dragging');
    el.onpointermove = this.handleAnnotationPointerMove;
    el.onpointerup = this.handleAnnotationPointerUp;
    el.onpointercancel = this.handleAnnotationPointerUp;
  }

  private handleAnnotationPointerMove = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!el || !pdfCanvas) return;

    evt.preventDefault();
    const dx = evt.clientX - this.dragInfo.startX;
    const dy = evt.clientY - this.dragInfo.startY;
    const shouldMove = this.dragInfo.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    if (!shouldMove) return;

    this.dragInfo.moved = true;

    const tentativeLeft = this.dragInfo.startLeft + dx;
    const tentativeTop = this.dragInfo.startTop + dy;

    const minTop = -this.dragInfo.fontSize;
    const maxTop = pdfCanvas.height - this.dragInfo.fontSize;
    const maxLeft = Math.max(pdfCanvas.width - el.offsetWidth, 0);
    const clampedLeft = Math.min(Math.max(tentativeLeft, 0), maxLeft);
    const clampedTop = Math.min(Math.max(tentativeTop, minTop), maxTop);

    el.style.left = `${clampedLeft}px`;
    el.style.top = `${clampedTop}px`;
  };

  private handleAnnotationPointerUp = (evt: PointerEvent) => {
    if (!this.dragInfo || evt.pointerId !== this.dragInfo.pointerId) return;
    const el = this.draggingElement;
    if (!el) {
      this.dragInfo = null;
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    el.releasePointerCapture(evt.pointerId);
    el.classList.remove('dragging');
    el.onpointermove = null;
    el.onpointerup = null;
    el.onpointercancel = null;

    const drag = this.dragInfo;
    this.dragInfo = null;
    this.draggingElement = null;

    if (drag.moved) {
      const left = parseFloat(el.style.left || '0');
      const top = parseFloat(el.style.top || '0');
      this.updateAnnotationPosition(drag.pageIndex, drag.fieldIndex, left, top, drag.fontSize);
      this.redrawAllForPage();
    } else if (evt.type !== 'pointercancel') {
      const page = this.coords()[drag.pageIndex];
      const field = page?.fields[drag.fieldIndex];
      if (field) {
        this.startEditing(drag.pageIndex, drag.fieldIndex, field);
      }
    }
  };

  private updateAnnotationPosition(
    pageIndex: number,
    fieldIndex: number,
    leftPx: number,
    topPx: number,
    fontSizePx: number
  ) {
    const pdfCanvas = this.pdfCanvasRef?.nativeElement;
    if (!pdfCanvas) return;
    const scale = this.scale();
    const boundedLeft = Math.min(Math.max(leftPx, 0), pdfCanvas.width);
    const boundedTop = Math.min(Math.max(topPx, -fontSizePx), pdfCanvas.height - fontSizePx);
    const newX = +(boundedLeft / scale).toFixed(2);
    const newY = +((pdfCanvas.height - (boundedTop + fontSizePx)) / scale).toFixed(2);

    this.coords.update((pages) =>
      pages.map((page, idx) => {
        if (idx !== pageIndex) {
          return page;
        }
        if (fieldIndex < 0 || fieldIndex >= page.fields.length) {
          return page;
        }
        const updatedFields = page.fields.map((field, fIdx) =>
          fIdx === fieldIndex ? { ...field, x: newX, y: newY } : field
        );
        return { ...page, fields: updatedFields };
      })
    );
    this.syncCoordsTextModel();
  }

  async prevPage() {
    if (this.pageIndex() > 1) {
      this.pageIndex.update((v) => v - 1);
      await this.render();
      this.redrawAllForPage();
    }
  }

  async nextPage() {
    if (this.pdfDoc && this.pageIndex() < this.pdfDoc.numPages) {
      this.pageIndex.update((v) => v + 1);
      await this.render();
      this.redrawAllForPage();
    }
  }

  async zoomIn() {
    this.scale.update((s) => +(s + 0.25).toFixed(2));
    await this.render();
    this.redrawAllForPage();
  }

  async zoomOut() {
    this.scale.update((s) => Math.max(0.25, +(this.scale() - 0.25).toFixed(2)));
    await this.render();
    this.redrawAllForPage();
  }

  clearAll() {
    this.coords.set([]);
    this.syncCoordsTextModel();
    this.redrawAllForPage();
  }

  copyJSON() {
    navigator.clipboard.writeText(this.coordsTextModel).catch(() => {});
  }

  applyCoordsText() {
    const text = this.coordsTextModel.trim();

    if (!text) {
      this.coords.set([]);
      this.syncCoordsTextModel();
      this.preview.set(null);
      this.editing.set(null);
      this.redrawAllForPage();
      return;
    }

    try {
      const parsed = this.parseLooseJson(text);
      const normalized = this.normalizeImportedCoordinates(parsed);

      if (normalized === null) {
        throw new Error('Formato no válido');
      }

      this.coords.set(normalized);
      this.syncCoordsTextModel();
      this.preview.set(null);
      this.editing.set(null);
      this.redrawAllForPage();
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      alert('No se pudo importar el archivo JSON. Comprueba que el formato sea correcto.');
    }
  }

  triggerImportCoords() {
    const input = this.coordsFileInputRef?.nativeElement;
    if (input) {
      input.value = '';
      input.click();
    }
  }

  async onCoordsFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = this.parseLooseJson(text);
      const normalized = this.normalizeImportedCoordinates(parsed);
      if (normalized === null) {
        throw new Error('Formato no válido');
      }

      this.coords.set(normalized);
      this.syncCoordsTextModel();
      this.preview.set(null);
      this.editing.set(null);
      this.redrawAllForPage();
    } catch (error) {
      console.error('No se pudo importar el JSON de anotaciones.', error);
      alert('No se pudo importar el archivo JSON. Comprueba que el formato sea correcto.');
    } finally {
      input.value = '';
    }
  }

  downloadJSON() {
    const blob = new Blob([JSON.stringify({ pages: this.coords() }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coords.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async downloadAnnotatedPDF() {
    if (!this.pdfDoc) return;

    try {
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const loadOptions = {
        ignoreEncryption: true,
        updateMetadata: false,
        throwOnInvalidObject: false,
      } as const;

      const candidates = await this.getPdfByteCandidates();
      if (!candidates.length) {
        throw new Error('No se encontraron bytes de PDF para procesar.');
      }

      let pdf: any = null;
      let usedBytes: Uint8Array | null = null;
      const loadErrors: unknown[] = [];

      for (const candidate of candidates) {
        try {
          pdf = await PDFDocument.load(candidate, loadOptions);
          usedBytes = candidate;
          break;
        } catch (error) {
          loadErrors.push(error);
        }
      }

      if (!pdf || !usedBytes) {
        throw new Error(
          `No se pudo cargar el PDF original (${loadErrors.length} intentos fallidos).`
        );
      }

      this.rememberPdfBytes(usedBytes, 3);
      const font = await pdf.embedFont(StandardFonts.Helvetica);

      for (const pageAnnotations of this.coords()) {
        const page = pdf.getPage(pageAnnotations.num - 1);
        for (const field of pageAnnotations.fields) {
          const hex = field.color.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) / 255;
          const g = parseInt(hex.substring(2, 4), 16) / 255;
          const b = parseInt(hex.substring(4, 6), 16) / 255;

          page.drawText(field.mapField, {
            x: field.x,
            y: field.y,
            size: field.fontSize,
            color: rgb(r, g, b),
            font,
          });
        }
      }

      const pdfBytes = await pdf.save({ useObjectStreams: false });
      const blob = new Blob([this.toArrayBuffer(pdfBytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'annotated.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('No se pudo generar el PDF anotado.', error);
      alert(
        'No se pudo generar el PDF anotado. Revisa que el archivo sea válido o intenta con otra copia.'
      );
    }
  }

  private async getPdfByteCandidates(): Promise<Uint8Array[]> {
    if (this.pdfDoc) {
      if (typeof this.pdfDoc.saveDocument === 'function') {
        try {
          const sanitized = await this.pdfDoc.saveDocument();
          this.rememberPdfBytes(sanitized, 2);
        } catch (error) {
          console.warn('No se pudo obtener una versión saneada del PDF para exportar.', error);
        }
      }

      try {
        const rawData = await this.pdfDoc.getData();
        this.rememberPdfBytes(rawData, 1);
      } catch (error) {
        console.warn('No se pudo obtener los bytes originales del PDF para exportar.', error);
      }
    }

    if (this.pdfByteSources.size === 0) {
      return [];
    }

    return Array.from(this.pdfByteSources.values())
      .sort((a, b) => b.weight - a.weight)
      .map((entry) => entry.bytes.slice());
  }

  private toArrayBuffer(data: Uint8Array<ArrayBufferLike> | ArrayBuffer): ArrayBuffer {
    if (data instanceof Uint8Array) {
      const copy = new Uint8Array(data.byteLength);
      copy.set(data);
      return copy.buffer;
    }
    return data;
  }

  private rememberPdfBytes(data?: Uint8Array | ArrayBuffer | null, weight = 0) {
    if (!data) return;
    const typed = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!typed.length) return;
    const head = Array.from(typed.slice(0, 16)).join(',');
    const key = `${typed.length}:${head}`;
    const existing = this.pdfByteSources.get(key);
    if (!existing || weight >= existing.weight) {
      this.pdfByteSources.set(key, { bytes: typed.slice(), weight });
    }
  }

  private syncCoordsTextModel() {
    this.coordsTextModel = JSON.stringify({ pages: this.coords() }, null, 2);
  }

  private parseLooseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      const sanitized = this.escapeMultilineStrings(text);
      try {
        // eslint-disable-next-line no-new-func
        return Function('"use strict";return (' + sanitized + ')')();
      } catch (looseError) {
        throw looseError;
      }
    }
  }

  private escapeMultilineStrings(text: string): string {
    let sanitized = '';
    let mode: 'none' | 'single' | 'double' | 'template' = 'none';
    let escapeNext = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];

      if (escapeNext) {
        sanitized += char;
        escapeNext = false;
        continue;
      }

      if (mode === 'single') {
        if (char === '\\') {
          sanitized += char;
          escapeNext = true;
          continue;
        }

        if (char === '\n') {
          sanitized += '\\n';
          continue;
        }

        if (char === '\r') {
          continue;
        }

        sanitized += char;

        if (char === "'") {
          mode = 'none';
        }
        continue;
      }

      if (mode === 'double') {
        if (char === '\\') {
          sanitized += char;
          escapeNext = true;
          continue;
        }

        if (char === '\n') {
          sanitized += '\\n';
          continue;
        }

        if (char === '\r') {
          continue;
        }

        sanitized += char;

        if (char === '"') {
          mode = 'none';
        }
        continue;
      }

      if (mode === 'template') {
        sanitized += char;

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '`') {
          mode = 'none';
        }
        continue;
      }

      sanitized += char;

      if (char === "'") {
        mode = 'single';
        continue;
      }

      if (char === '"') {
        mode = 'double';
        continue;
      }

      if (char === '`') {
        mode = 'template';
      }
    }

    return sanitized;
  }

  private normalizeImportedCoordinates(data: unknown): PageAnnotations[] | null {
    const pagesData = this.extractPagesCollection(data);
    if (!Array.isArray(pagesData)) {
      return null;
    }

    const normalized: PageAnnotations[] = [];

    for (const rawPage of pagesData) {
      if (!rawPage || typeof rawPage !== 'object') {
        continue;
      }

      const pageNum = this.toFiniteNumber((rawPage as { num?: unknown }).num);
      if (!pageNum || !Number.isInteger(pageNum) || pageNum < 1) {
        continue;
      }

      const rawFields = (rawPage as { fields?: unknown }).fields;
      if (!Array.isArray(rawFields)) {
        continue;
      }

      const fields: PageField[] = [];

      for (const rawField of rawFields) {
        if (!rawField || typeof rawField !== 'object') {
          continue;
        }

        const { x, y, mapField, fontSize, color, value } = rawField as Record<string, unknown>;

        const normalizedMapField =
          this.normalizeFieldText(mapField) ?? this.normalizeFieldText(value);
        const normalizedX = this.toFiniteNumber(x);
        const normalizedY = this.toFiniteNumber(y);

        if (normalizedMapField === null || normalizedX === null || normalizedY === null) {
          continue;
        }

        const normalizedFontSize = this.toFiniteNumber(fontSize);
        const normalizedColor =
          typeof color === 'string' && color.trim() ? color.trim() : '#000000';

        const normalizedField: PageField = {
          x: Math.round(normalizedX * 100) / 100,
          y: Math.round(normalizedY * 100) / 100,
          mapField: normalizedMapField,
          fontSize:
            normalizedFontSize && normalizedFontSize > 0
              ? Math.round(normalizedFontSize * 100) / 100
              : 14,
          color: this.normalizeColor(normalizedColor),
        };

        fields.push(normalizedField);
      }

      if (fields.length) {
        normalized.push({ num: pageNum, fields });
      }
    }

    normalized.sort((a, b) => a.num - b.num);
    return normalized;
  }

  private extractPagesCollection(data: unknown): unknown {
    if (Array.isArray(data)) {
      return data;
    }

    if (data && typeof data === 'object') {
      const maybePages = (data as { pages?: unknown }).pages;
      if (Array.isArray(maybePages)) {
        return maybePages;
      }
    }

    return null;
  }

  private toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private normalizeFieldText(value: unknown): string | null {
    let source: string | null = null;

    if (typeof value === 'string') {
      source = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      source = String(value);
    } else if (typeof value === 'boolean') {
      source = value ? 'true' : 'false';
    }

    if (!source) {
      return null;
    }

    const collapsed = source
      .replace(/\r\n?/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!collapsed) {
      return null;
    }

    if (/[\.\[\]]/.test(collapsed)) {
      return collapsed.replace(/\s*([\.\[\]])\s*/g, '$1');
    }

    return collapsed;
  }
}
