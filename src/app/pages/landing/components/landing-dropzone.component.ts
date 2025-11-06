import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { TranslationPipe } from '../../../i18n/translation.pipe';

@Component({
  selector: 'app-landing-dropzone',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  template: `
    <div
      class="landing__dropzone"
      role="button"
      tabindex="0"
      (click)="onOpenFilePicker()"
      (keydown)="fileUploadKeydown.emit($event)"
      (dragover)="fileDragOver.emit($event)"
      (dragleave)="fileDragLeave.emit($event)"
      (drop)="fileDrop.emit($event)"
      [class.landing__dropzone--active]="fileDropActive"
      [attr.aria-label]="'app.upload.title' | t"
    >
      <input #pdfFileInput type="file" accept="application/pdf" (change)="fileSelected.emit($event)" hidden />
      <div class="landing__icon" aria-hidden="true">📄</div>
      <div class="landing__text">
        <span class="landing__headline">{{ 'app.upload.title' | t }}</span>
        <span class="landing__subheadline">{{ 'app.upload.subtitle' | t }}</span>
      </div>
      <button type="button" class="landing__cta" (click)="onOpenFilePicker($event)">
        {{ 'app.landing.cta' | t }}
      </button>
      <span class="landing__hint">{{ 'app.upload.hint' | t }}</span>
    </div>
  `,
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
