import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { TranslationPipe } from '../../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-dropzone',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './landing-dropzone.component.html',
})
export class LandingDropzoneComponent {
  @Input({ required: true }) fileDropActive = false;

  @Output() fileSelected = new EventEmitter<Event>();
  @Output() fileUploadKeydown = new EventEmitter<KeyboardEvent>();
  @Output() fileDragOver = new EventEmitter<DragEvent>();
  @Output() fileDragLeave = new EventEmitter<DragEvent>();
  @Output() fileDrop = new EventEmitter<DragEvent>();
  @Output() openFilePicker = new EventEmitter<void>();

  @ViewChild('pdfFileInput', { static: false })
  private pdfFileInputRef?: ElementRef<HTMLInputElement>;

  triggerFilePicker() {
    const input = this.pdfFileInputRef?.nativeElement;
    if (!input) {
      return;
    }

    input.value = '';
    input.click();
  }

  onOpenFilePicker(event?: Event) {
    event?.stopPropagation();
    this.openFilePicker.emit();
  }
}
