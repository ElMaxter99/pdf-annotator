import { Injectable } from '@angular/core';

/**
 * Stores a PDF file selected in the landing section so the editor module can
 * consume it after navigation. Keeps the data in memory to avoid relying on
 * the navigation extras history state.
 */
@Injectable({ providedIn: 'root' })
export class EditorFileQueueService {
  private pendingFile: File | null = null;

  setPendingFile(file: File) {
    this.pendingFile = file;
  }

  consumePendingFile(): File | null {
    const file = this.pendingFile;
    this.pendingFile = null;
    return file ?? null;
  }
}
