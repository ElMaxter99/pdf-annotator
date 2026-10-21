import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import type { WorkspacePageComponent } from '../../workspace.page';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import type { AlignMode, DistributeAxis } from '../../../../utils/alignment.utils';
import { AnnotationEditorComponent } from '../annotation-editor/annotation-editor.component';

@Component({
  selector: 'app-workspace-viewer',
  standalone: true,
  templateUrl: './workspace-viewer.component.html',
  styleUrls: ['./workspace-viewer.component.scss'],
  imports: [CommonModule, AnnotationEditorComponent, TranslationPipe],
})
export class WorkspaceViewerComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  readonly alignModes: readonly { id: AlignMode; icon: string }[] = [
    { id: 'left', icon: '⇤' },
    { id: 'center', icon: '↔' },
    { id: 'right', icon: '⇥' },
    { id: 'top', icon: '⤒' },
    { id: 'middle', icon: '↕' },
    { id: 'bottom', icon: '⤓' },
  ];

  readonly distributeModes: readonly { id: DistributeAxis; icon: string }[] = [
    { id: 'horizontal', icon: '⇹' },
    { id: 'vertical', icon: '⇳' },
  ];

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
