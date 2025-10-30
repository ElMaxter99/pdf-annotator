import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { AnnotationTemplate } from '../../../../core/services/annotation-templates.service';

@Component({
  selector: 'app-editor-sidebar',
  standalone: false,
  templateUrl: './editor-sidebar.component.html',
  styleUrls: ['./editor-sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
/**
 * Sidebar component wrapping upload interactions, template management and JSON editor bindings.
 */
export class EditorSidebarComponent {
  @Input() fileDropActive = false;
  @Input() coordsText = '';
  @Input() templates: readonly AnnotationTemplate[] = [];
  @Input() templateName = '';
  @Input() selectedTemplateId: string | null = null;
  @Input() defaultTemplateId!: string;
  @Input() hasAnnotations = false;

  @Output() requestPdfUpload = new EventEmitter<void>();
  @Output() uploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() fileDragOver = new EventEmitter<DragEvent>();
  @Output() fileDragLeave = new EventEmitter<DragEvent>();
  @Output() fileDrop = new EventEmitter<DragEvent>();
  @Output() pdfSelected = new EventEmitter<Event>();
  @Output() coordsTextChange = new EventEmitter<string>();
  @Output() applyCoordsText = new EventEmitter<void>();
  @Output() triggerImportCoords = new EventEmitter<void>();
  @Output() coordsFileSelected = new EventEmitter<Event>();
  @Output() saveTemplate = new EventEmitter<void>();
  @Output() loadTemplate = new EventEmitter<void>();
  @Output() deleteTemplate = new EventEmitter<void>();
  @Output() templateNameChange = new EventEmitter<string>();
  @Output() selectedTemplateChange = new EventEmitter<string | null>();
  @Output() copyJson = new EventEmitter<void>();
  @Output() downloadJson = new EventEmitter<void>();

  @ViewChild('pdfFileInput', { static: false }) private pdfFileInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('coordsFileInput', { static: false }) private coordsFileInputRef?: ElementRef<HTMLInputElement>;

  openFilePicker() {
    const input = this.pdfFileInputRef?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  openCoordsFilePicker() {
    const input = this.coordsFileInputRef?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  onTemplateNameInput(value: string) {
    this.templateNameChange.emit(value);
  }

  onSelectedTemplateChange(value: string) {
    this.selectedTemplateChange.emit(value || null);
  }
}
