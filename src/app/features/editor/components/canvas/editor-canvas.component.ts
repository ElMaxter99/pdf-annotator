import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { PageField } from '../../../../shared/models/annotation.model';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';
import { AnnotationFormComponent } from '../annotation-form/annotation-form.component';

export type PreviewState = { page: number; field: PageField } | null;
export type EditState = { pageIndex: number; fieldIndex: number; field: PageField } | null;

export interface CanvasElements {
  pdfCanvas: HTMLCanvasElement | null;
  overlayCanvas: HTMLCanvasElement | null;
  annotationsLayer: HTMLDivElement | null;
  pdfViewer: HTMLDivElement | null;
}

@Component({
  selector: 'app-editor-canvas',
  standalone: true,
  imports: [CommonModule, AnnotationFormComponent, TranslationPipe],
  templateUrl: './editor-canvas.component.html',
  styleUrls: ['./editor-canvas.component.scss'],
})
export class EditorCanvasComponent implements AfterViewInit, AfterViewChecked {
  @Input() pdfLoaded = false;
  @Input() preview: PreviewState = null;
  @Input() editing: EditState = null;
  @Input() scale = 1;
  @Input() previewHex = '';
  @Input() previewRgb = '';
  @Input() editHex = '';
  @Input() editRgb = '';

  @Output() registerElements = new EventEmitter<CanvasElements>();
  @Output() hitboxClick = new EventEmitter<MouseEvent>();
  @Output() previewKeydown = new EventEmitter<KeyboardEvent>();
  @Output() editKeydown = new EventEmitter<KeyboardEvent>();
  @Output() confirmPreview = new EventEmitter<void>();
  @Output() cancelPreview = new EventEmitter<void>();
  @Output() confirmEdit = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() duplicateAnnotation = new EventEmitter<void>();
  @Output() deleteAnnotation = new EventEmitter<void>();
  @Output() previewColorHexChange = new EventEmitter<string>();
  @Output() previewColorRgbChange = new EventEmitter<string>();
  @Output() previewColorPicker = new EventEmitter<string>();
  @Output() editColorHexChange = new EventEmitter<string>();
  @Output() editColorRgbChange = new EventEmitter<string>();
  @Output() editColorPicker = new EventEmitter<string>();

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false }) annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer', { static: false }) pdfViewerRef?: ElementRef<HTMLDivElement>;

  private emitted = false;

  ngAfterViewInit() {
    this.emitElements();
  }

  ngAfterViewChecked() {
    if (!this.emitted && this.pdfCanvasRef?.nativeElement) {
      this.emitElements();
    }
  }

  private emitElements() {
    this.registerElements.emit({
      pdfCanvas: this.pdfCanvasRef?.nativeElement ?? null,
      overlayCanvas: this.overlayCanvasRef?.nativeElement ?? null,
      annotationsLayer: this.annotationsLayerRef?.nativeElement ?? null,
      pdfViewer: this.pdfViewerRef?.nativeElement ?? null,
    });
    this.emitted = !!this.pdfCanvasRef?.nativeElement;
  }

  get canvasHeight() {
    return this.pdfCanvasRef?.nativeElement?.height ?? 0;
  }
}
