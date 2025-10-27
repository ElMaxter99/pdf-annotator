import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, signal, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.js';

type Coord = { page: number; x: number; y: number; value: string; size: number; color: string };
type EditState = { index: number; coord: Coord } | null;

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [CommonModule, FormsModule],
  styleUrls: ['./app.scss'],
})
export class App implements AfterViewChecked {
  pdfDoc: PDFDocumentProxy | null = null;
  pageIndex = signal(1);
  scale = signal(1.5);
  coords = signal<Coord[]>([]);
  preview = signal<Coord | null>(null);
  editing = signal<EditState>(null);
  previewHexInput = signal('#000000');
  previewRgbInput = signal('rgb(0, 0, 0)');
  editHexInput = signal('#000000');
  editRgbInput = signal('rgb(0, 0, 0)');

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false })
  annotationsLayerRef?: ElementRef<HTMLDivElement>;

  @ViewChild('previewEditor') previewEditorRef?: ElementRef<HTMLDivElement>;

  constructor() {
    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = '/assets/pdfjs/pdf.worker.min.mjs';
  }

  ngAfterViewChecked() {
    const previewEl = this.previewEditorRef?.nativeElement;
    if (previewEl) {
      const input = previewEl.querySelector('input[type="text"]') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }
  }

  get pageCount() {
    return this.pdfDoc?.numPages ?? 0;
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const buf = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: buf });
    this.pdfDoc = await loadingTask.promise;

    this.pageIndex.set(1);
    await this.render();
  }

  async render() {
    if (!this.pdfDoc) return;
    const page: PDFPageProxy = await this.pdfDoc.getPage(this.pageIndex());
    const viewport = page.getViewport({ scale: this.scale() });

    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    const overlay = this.overlayCanvasRef?.nativeElement;
    if (overlay) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    }

    this.redrawAllForPage();
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
    const target = evt.target as HTMLElement;
    if (target.classList.contains('annotation')) return;

    const pt = this.domToPdfCoords(evt);
    if (!pt) return;

    const defaultColor = '#000000';
    this.preview.set({
      page: this.pageIndex(),
      x: pt.x,
      y: pt.y,
      value: '',
      size: 14,
      color: defaultColor,
    });
    this.updatePreviewColorState(defaultColor);
  }

  private normalizeColor(color: string) {
    if (color.startsWith('#')) {
      const hex = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      return hex.toLowerCase();
    }

    const match = color.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\)$/i);
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
    this.preview.update((p) => (p ? { ...p, color: normalized } : p));
    this.updatePreviewColorState(normalized);
  }

  setPreviewColorFromRgb(value: string) {
    this.previewRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
    this.preview.update((p) => (p ? { ...p, color: hex } : p));
    this.updatePreviewColorState(hex);
  }

  onPreviewColorPicker(value: string) {
    this.preview.update((p) => (p ? { ...p, color: value } : p));
    this.updatePreviewColorState(value);
  }

  setEditColorFromHex(value: string) {
    this.editHexInput.set(value);
    const normalized = this.normalizeHexInput(value);
    if (!normalized) return;
    this.editing.update((e) =>
      e ? { ...e, coord: { ...e.coord, color: normalized } } : e,
    );
    this.updateEditingColorState(normalized);
  }

  setEditColorFromRgb(value: string) {
    this.editRgbInput.set(value);
    const rgb = this.parseRgbText(value);
    if (!rgb) return;
    const hex = this.rgbToHex(rgb);
    this.editing.update((e) =>
      e ? { ...e, coord: { ...e.coord, color: hex } } : e,
    );
    this.updateEditingColorState(hex);
  }

  onEditColorPicker(value: string) {
    this.editing.update((e) =>
      e ? { ...e, coord: { ...e.coord, color: value } } : e,
    );
    this.updateEditingColorState(value);
  }

  confirmPreview() {
    const p = this.preview();
    if (!p || !p.value.trim()) {
      this.preview.set(null);
      return;
    }
    const normalized: Coord = { ...p, color: this.normalizeColor(p.color) };
    this.coords.update((arr) => [...arr, normalized]);
    this.preview.set(null);
    this.redrawAllForPage();
  }

  cancelPreview() {
    this.preview.set(null);
  }

  startEditing(idx: number, c: Coord) {
    const normalized: Coord = { ...c, color: this.normalizeColor(c.color) };
    if (normalized.color !== c.color) {
      this.coords.update((arr) => arr.map((item, i) => (i === idx ? normalized : item)));
    }
    this.editing.set({ index: idx, coord: { ...normalized } });
    this.updateEditingColorState(normalized.color);
    this.preview.set(null);
  }

  confirmEdit() {
    const e = this.editing();
    if (!e) return;
    const normalized: Coord = { ...e.coord, color: this.normalizeColor(e.coord.color) };
    this.coords.update((arr) => arr.map((a, i) => (i === e.index ? normalized : a)));
    this.editing.set(null);
    this.redrawAllForPage();
  }

  cancelEdit() {
    this.editing.set(null);
  }

  deleteAnnotation() {
    const e = this.editing();
    if (!e) return;
    this.coords.update((arr) => arr.filter((_, i) => i !== e.index));
    this.editing.set(null);
    this.redrawAllForPage();
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
      .filter((c) => c.page === this.pageIndex())
      .forEach((c, idx) => {
        const left = c.x * scale;
        const top = pdfCanvas.height - c.y * scale;
        const fontSize = c.size * scale;

        const el = document.createElement('div');
        el.className = 'annotation';
        el.textContent = c.value;
        el.style.left = `${left}px`;
        el.style.top = `${top - fontSize}px`;
        el.style.fontSize = `${fontSize}px`;
        el.style.color = c.color;
        el.style.fontFamily = 'Helvetica';
        el.onclick = (evt) => {
          evt.stopPropagation();
          this.startEditing(idx, c);
        };
        layer.appendChild(el);
      });
  }

  async prevPage() {
    if (this.pageIndex() > 1) {
      this.pageIndex.update((v) => v - 1);
      await this.render();
    }
  }
  async nextPage() {
    if (this.pdfDoc && this.pageIndex() < this.pdfDoc.numPages) {
      this.pageIndex.update((v) => v + 1);
      await this.render();
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
    this.redrawAllForPage();
  }
  copyJSON() {
    navigator.clipboard.writeText(JSON.stringify(this.coords(), null, 2)).catch(() => {});
  }
  downloadJSON() {
    const blob = new Blob([JSON.stringify(this.coords(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'coords.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}
