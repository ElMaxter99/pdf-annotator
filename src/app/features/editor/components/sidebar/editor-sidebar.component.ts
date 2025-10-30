import { Component, EventEmitter, Input, Output } from '@angular/core';

import { AnnotationTemplate } from '../../../../core/services/annotation-templates.service';

@Component({
  selector: 'app-editor-sidebar',
  templateUrl: './editor-sidebar.component.html',
  styleUrls: ['./editor-sidebar.component.scss'],
})
export class EditorSidebarComponent {
  @Input({ required: true }) fileDropActive!: boolean;
  @Input({ required: true }) coordsTextModel!: string;
  @Input({ required: true }) templateNameModel!: string;
  @Input({ required: true }) templates!: readonly AnnotationTemplate[];
  @Input({ required: true }) selectedTemplateId!: string | null;
  @Input({ required: true }) defaultTemplateId!: string;
  @Input({ required: true }) hasCoords!: boolean;

  @Output() readonly openPdfPicker = new EventEmitter<void>();
  @Output() readonly fileUploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() readonly fileDragOver = new EventEmitter<DragEvent>();
  @Output() readonly fileDragLeave = new EventEmitter<DragEvent>();
  @Output() readonly fileDrop = new EventEmitter<DragEvent>();

  @Output() readonly requestImportCoords = new EventEmitter<void>();
  @Output() readonly applyCoordsText = new EventEmitter<void>();
  @Output() readonly coordsTextModelChange = new EventEmitter<string>();
  @Output() readonly copyJson = new EventEmitter<void>();
  @Output() readonly downloadJson = new EventEmitter<void>();

  @Output() readonly templateNameModelChange = new EventEmitter<string>();
  @Output() readonly saveTemplate = new EventEmitter<void>();
  @Output() readonly selectedTemplateIdChange = new EventEmitter<string | null>();
  @Output() readonly loadTemplate = new EventEmitter<void>();
  @Output() readonly deleteTemplate = new EventEmitter<void>();

  onTemplateNameChange(value: string) {
    this.templateNameModelChange.emit(value);
  }

  onCoordsTextChange(value: string) {
    this.coordsTextModelChange.emit(value);
  }

  onTemplateSelectionChange(value: string) {
    this.selectedTemplateIdChange.emit(value || null);
  }
}
