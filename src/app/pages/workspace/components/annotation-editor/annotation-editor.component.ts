import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslationPipe } from '../../../../i18n/translation.pipe';
import { PageField } from '../../../../models/annotation.model';
import type { WorkspacePageComponent } from '../../workspace.page';

export type AnnotationEditorMode = 'preview' | 'edit';

@Component({
  selector: 'app-annotation-editor',
  standalone: true,
  templateUrl: './annotation-editor.component.html',
  imports: [CommonModule, FormsModule, TranslationPipe],
  host: { style: 'display: contents' },
})
export class AnnotationEditorComponent {
  @Input({ required: true }) vm!: WorkspacePageComponent;
  @Input({ required: true }) mode!: AnnotationEditorMode;
  @Input({ required: true }) field!: PageField;
  @Input({ required: true }) leftPx = 0;
  @Input({ required: true }) topPx = 0;

  @ViewChild('editorRoot', { static: false }) editorRef?: ElementRef<HTMLDivElement>;
  @ViewChild('fontDropdown', { static: false }) fontDropdownRef?: ElementRef<HTMLDivElement>;
  @ViewChild('fontSearch', { static: false }) fontSearchRef?: ElementRef<HTMLInputElement>;

  get isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** In edit mode a locked annotation cannot be modified until unlocked. */
  get locked(): boolean {
    return this.isEdit && !!this.field.locked;
  }

  get hexValue(): string {
    return this.isEdit ? this.vm.editHexInput() : this.vm.previewHexInput();
  }

  get rgbValue(): string {
    return this.isEdit ? this.vm.editRgbInput() : this.vm.previewRgbInput();
  }

  onColorPicker(value: string) {
    this.isEdit ? this.vm.onEditColorPicker(value) : this.vm.onPreviewColorPicker(value);
  }

  onHexInput(value: string) {
    this.isEdit ? this.vm.setEditColorFromHex(value) : this.vm.setPreviewColorFromHex(value);
  }

  onRgbInput(value: string) {
    this.isEdit ? this.vm.setEditColorFromRgb(value) : this.vm.setPreviewColorFromRgb(value);
  }

  confirm() {
    this.isEdit ? this.vm.confirmEdit() : this.vm.confirmPreview();
  }

  cancel() {
    this.isEdit ? this.vm.cancelEdit() : this.vm.cancelPreview();
  }
}
