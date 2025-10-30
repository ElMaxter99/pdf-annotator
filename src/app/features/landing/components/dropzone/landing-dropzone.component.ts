import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { TranslationPipe } from '../../../../shared/pipes/translation.pipe';

/**
 * Zona de subida accesible que encapsula toda la interacción de arrastrar y soltar PDF.
 * Expone un único evento con el fichero seleccionado para mantener la lógica en la página.
 */
@Component({
  selector: 'app-landing-dropzone',
  standalone: true,
  imports: [CommonModule, TranslationPipe],
  templateUrl: './landing-dropzone.component.html',
  styleUrls: ['./landing-dropzone.component.scss'],
})
export class LandingDropzoneComponent {
  readonly fileDropActive = signal(false);

  @Output() readonly fileSelected = new EventEmitter<File>();

  @ViewChild('pdfFileInput', { static: false })
  pdfFileInputRef?: ElementRef<HTMLInputElement>;

  openPdfFilePicker() {
    const input = this.pdfFileInputRef?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, button')) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.openPdfFilePicker();
    }
  }

  onFileUploadKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Space') {
      return;
    }
    event.preventDefault();
    this.openPdfFilePicker();
  }

  onFileDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.fileDropActive.set(true);
  }

  onFileDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node) {
      if (event.currentTarget.contains(event.relatedTarget)) {
        return;
      }
    }
    this.fileDropActive.set(false);
  }

  onFileDrop(event: DragEvent) {
    event.preventDefault();
    this.fileDropActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.fileSelected.emit(file);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.fileSelected.emit(file);
    input.value = '';
  }
}
