import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnnotationTemplate } from '../../../../core/services/annotation-templates.service';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

@Component({
  selector: 'app-editor-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslationPipe],
  templateUrl: './editor-sidebar.component.html',
  styleUrls: ['./editor-sidebar.component.scss'],
})
export class EditorSidebarComponent {
  @Input() fileDropActive = false;
  @Input() templateName = '';
  @Input() selectedTemplateId: string | null = null;
  @Input() defaultTemplateId = '';
  @Input() templates: readonly AnnotationTemplate[] = [];
  @Input() coordsText = '';
  @Input() hasAnnotations = false;

  @Output() templateNameChange = new EventEmitter<string>();
  @Output() selectedTemplateIdChange = new EventEmitter<string | null>();
  @Output() coordsTextChange = new EventEmitter<string>();
  @Output() requestOpenPdf = new EventEmitter<void>();
  @Output() uploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() pdfSelected = new EventEmitter<Event>();
  @Output() pdfDrop = new EventEmitter<DragEvent>();
  @Output() pdfDragOver = new EventEmitter<DragEvent>();
  @Output() pdfDragLeave = new EventEmitter<DragEvent>();
  @Output() triggerImport = new EventEmitter<void>();
  @Output() applyCoords = new EventEmitter<void>();
  @Output() saveTemplate = new EventEmitter<void>();
  @Output() loadTemplate = new EventEmitter<void>();
  @Output() deleteTemplate = new EventEmitter<void>();
  @Output() copyJson = new EventEmitter<void>();
  @Output() downloadJson = new EventEmitter<void>();
  @Output() coordsFileSelected = new EventEmitter<Event>();

  @ViewChild('pdfFileInput', { static: false }) pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('coordsFileInput', { static: false }) coordsFileInputRef?: ElementRef<HTMLInputElement>;
}
