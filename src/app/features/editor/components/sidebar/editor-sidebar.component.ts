import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import { AnnotationTemplate } from '../../../../core/services/annotation-templates.service';

/**
 * Sidebar that exposes upload controls, template management and the JSON editor.
 */
@Component({
  selector: 'app-editor-sidebar',
  standalone: false,
  templateUrl: './editor-sidebar.component.html',
  styleUrls: ['./editor-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorSidebarComponent {
  @Input() fileDropActive = false;
  @Input() templateName = '';
  @Input() templates: readonly AnnotationTemplate[] = [];
  @Input() selectedTemplateId: string | null = null;
  @Input() defaultTemplateId: string | null = null;
  @Input() coordsText = '';
  @Input() hasCoords = false;

  @Output() requestPdfPicker = new EventEmitter<void>();
  @Output() fileUploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() fileDragOver = new EventEmitter<DragEvent>();
  @Output() fileDragLeave = new EventEmitter<DragEvent>();
  @Output() fileDrop = new EventEmitter<DragEvent>();

  @Output() importCoords = new EventEmitter<void>();
  @Output() applyCoords = new EventEmitter<void>();
  @Output() templateNameChange = new EventEmitter<string>();
  @Output() selectedTemplateIdChange = new EventEmitter<string | null>();
  @Output() saveTemplate = new EventEmitter<void>();
  @Output() loadTemplate = new EventEmitter<void>();
  @Output() deleteTemplate = new EventEmitter<void>();
  @Output() coordsTextChange = new EventEmitter<string>();
  @Output() copyJson = new EventEmitter<void>();
  @Output() downloadJson = new EventEmitter<void>();

  onTemplateNameChange(value: string) {
    this.templateNameChange.emit(value);
  }

  onSelectedTemplateChange(value: string) {
    this.selectedTemplateIdChange.emit(value || null);
  }

  trackTemplateById(_: number, template: AnnotationTemplate) {
    return template.id;
  }
}
