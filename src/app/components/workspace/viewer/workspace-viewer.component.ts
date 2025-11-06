import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkspacePageComponent } from '../../../pages/workspace/workspace.page';
import { TranslationPipe } from '../../../i18n/translation.pipe';

@Component({
  selector: 'app-workspace-viewer',
  standalone: true,
  templateUrl: './workspace-viewer.component.html',
  styleUrls: ['./workspace-viewer.component.scss'],
  imports: [CommonModule, FormsModule, TranslationPipe],
})
export class WorkspaceViewerComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false }) annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer', { static: false }) pdfViewerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewEditor', { static: false }) previewEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editEditor', { static: false }) editEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewFontDropdown', { static: false })
  previewFontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editFontDropdown', { static: false })
  editFontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewFontSearch', { static: false })
  previewFontSearchRef?: ElementRef<HTMLInputElement>;
  @ViewChild('editFontSearch', { static: false })
  editFontSearchRef?: ElementRef<HTMLInputElement>;
}
