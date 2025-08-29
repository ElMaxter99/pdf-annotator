import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import * as pdfjsLib from 'pdfjs-dist';

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type Coord = {
  page: number;
  x: number;
  y: number;
  value: string;
  size: number;
  color: string;
};

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.html',
  imports: [CommonModule, FormsModule],
  styleUrl: './app.scss',
})
export class App {
  pdfDoc: PDFDocumentProxy | null = null;
  pageIndex = signal(1);
  scale = signal(1.5);

  coords = signal<Coord[]>([]);
  preview = signal<Coord | null>(null);

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;

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
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    const overlay = this.overlayCanvasRef?.nativeElement;
    if (overlay) {
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  private domToPdfCoords(evt: MouseEvent) {
    const canvas = this.pdfCanvasRef?.nativeElement;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const xPx = evt.clientX - rect.left;
    const yPx = evt.clientY - rect.top;

    const scale = this.scale();
    const pdfX = xPx / scale;
    const pdfY = (canvas.height - yPx) / scale;

    return { x: +pdfX.toFixed(2), y: +pdfY.toFixed(2) };
  }

  onHitboxClick(evt: MouseEvent) {
    // si el click viene de la preview → ignorar
    const target = evt.target as HTMLElement;
    if (target.closest('.preview')) return;

    if (!this.pdfDoc) return;
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
    const entry = this.preview();
    if (!entry || !entry.value.trim()) {
      this.preview.set(null);
      return;
    }
    this.coords.update((arr) => [...arr, entry]);
    this.preview.set(null);
    this.redrawAllForPage();
  }

  cancelPreview() {
    this.preview.set(null);
  }

  drawMarker(c: Coord) {
    const overlay = this.overlayCanvasRef?.nativeElement;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    const scale = this.scale();
    const x = c.x * scale;
    const y = overlay.height - c.y * scale;

    ctx.save();
    ctx.font = `${c.size}px sans-serif`;
    ctx.fillStyle = c.color;
    ctx.fillText(c.value, x, y);
    ctx.restore();
  }

  redrawAllForPage() {
    const overlay = this.overlayCanvasRef?.nativeElement;
    const ctx = overlay?.getContext('2d');
    if (!overlay || !ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);
    this.coords()
      .filter((c) => c.page === this.pageIndex())
      .forEach((c) => this.drawMarker(c));
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
    this.scale.update((s) => Math.max(0.25, +(s - 0.25).toFixed(2)));
    await this.render();
    this.redrawAllForPage();
  }

  clearAll() {
    this.coords.set([]);
    this.redrawAllForPage();
  }

  copyJSON() {
    const text = JSON.stringify(this.coords(), null, 2);
    navigator.clipboard.writeText(text).catch(() => {});
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
