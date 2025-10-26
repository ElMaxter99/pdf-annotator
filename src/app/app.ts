import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, signal, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = pdfjsWorker;

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

    this.preview.set({
      page: this.pageIndex(),
      x: pt.x,
      y: pt.y,
      value: '',
      size: 14,
      color: '#000000',
    });
  }

  confirmPreview() {
    const p = this.preview();
    if (!p || !p.value.trim()) {
      this.preview.set(null);
      return;
    }
    this.coords.update((arr) => [...arr, p]);
    this.preview.set(null);
    this.redrawAllForPage();
  }

  cancelPreview() {
    this.preview.set(null);
  }

  startEditing(idx: number, c: Coord) {
    this.editing.set({ index: idx, coord: { ...c } });
    this.preview.set(null);
  }

  confirmEdit() {
    const e = this.editing();
    if (!e) return;
    this.coords.update((arr) => arr.map((a, i) => (i === e.index ? e.coord : a)));
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
        const el = document.createElement('div');
        el.className = 'annotation';
        el.textContent = c.value;
        el.style.left = left + 'px';
        el.style.top = top - c.size + 'px';
        el.style.fontSize = c.size + 'px';
        el.style.color = c.color;
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
  }
  async zoomOut() {
    this.scale.update((s) => Math.max(0.25, +(this.scale() - 0.25).toFixed(2)));
    await this.render();
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
