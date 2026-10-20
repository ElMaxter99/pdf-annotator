import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import type { WorkspacePageComponent } from '../../workspace.page';
import { AnnotationEditorComponent } from '../annotation-editor/annotation-editor.component';

@Component({
  selector: 'app-workspace-viewer',
  standalone: true,
  templateUrl: './workspace-viewer.component.html',
  styleUrls: ['./workspace-viewer.component.scss'],
  imports: [CommonModule, AnnotationEditorComponent],
})
export class WorkspaceViewerComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false }) annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer', { static: false }) pdfViewerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewEditor', { static: false }) private previewEditor?: AnnotationEditorComponent;
  @ViewChild('editEditor', { static: false }) private editEditor?: AnnotationEditorComponent;

  get previewEditorRef(): ElementRef<HTMLDivElement> | undefined {
    return this.previewEditor?.editorRef;
  }

  get editEditorRef(): ElementRef<HTMLDivElement> | undefined {
    return this.editEditor?.editorRef;
  }

  get previewFontDropdownRef(): ElementRef<HTMLDivElement> | undefined {
    return this.previewEditor?.fontDropdownRef;
  }

  get editFontDropdownRef(): ElementRef<HTMLDivElement> | undefined {
    return this.editEditor?.fontDropdownRef;
  }

  get previewFontSearchRef(): ElementRef<HTMLInputElement> | undefined {
    return this.previewEditor?.fontSearchRef;
  }

  get editFontSearchRef(): ElementRef<HTMLInputElement> | undefined {
    return this.editEditor?.fontSearchRef;
  }
}
