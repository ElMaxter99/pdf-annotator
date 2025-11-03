import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { App } from '../../app';
import { TranslationPipe } from '../../i18n/translation.pipe';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { JsonTreeComponent } from '../json-tree/json-tree.component';
import { PageThumbnailsComponent } from '../page-thumbnails/page-thumbnails.component';

@Component({
  selector: 'app-workspace',
  standalone: true,
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslationPipe,
    LanguageSelectorComponent,
    JsonTreeComponent,
    PageThumbnailsComponent,
  ],
})
export class WorkspaceComponent {
  @Input({ required: true }) vm!: App;

  @ViewChild('pdfCanvas', { static: false }) pdfCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas', { static: false }) overlayCanvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('annotationsLayer', { static: false }) annotationsLayerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('pdfViewer', { static: false }) pdfViewerRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewEditor') previewEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editEditor') editEditorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewFontDropdown', { static: false })
  previewFontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('editFontDropdown', { static: false })
  editFontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('previewFontSearch', { static: false })
  previewFontSearchRef?: ElementRef<HTMLInputElement>;
  @ViewChild('editFontSearch', { static: false })
  editFontSearchRef?: ElementRef<HTMLInputElement>;
  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('coordsFileInput', { static: false }) coordsFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('customFontInput', { static: false }) customFontInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('jsonEditor', { static: false }) jsonEditorRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('jsonTree', { static: false }) jsonTreeComponent?: JsonTreeComponent;

  get pdfFileInputElement(): HTMLInputElement | null {
    return this.pdfFileInputRef?.nativeElement ?? null;
  }

  get coordsFileInputElement(): HTMLInputElement | null {
    return this.coordsFileInputRef?.nativeElement ?? null;
  }

  get customFontInputElement(): HTMLInputElement | null {
    return this.customFontInputRef?.nativeElement ?? null;
  }

  get jsonEditorElement(): HTMLTextAreaElement | null {
    return this.jsonEditorRef?.nativeElement ?? null;
  }
}
