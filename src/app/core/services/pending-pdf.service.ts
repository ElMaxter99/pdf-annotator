import { Injectable } from '@angular/core';

/**
 * Coordinates the PDF file selected on the landing page with the editor workspace.
 * The selected file is held in memory temporarily until the editor consumes it.
 */
@Injectable({ providedIn: 'root' })
export class PendingPdfService {
  private pendingFile: File | null = null;

  /**
   * Stores the PDF file selected before navigating to the editor.
   */
  setPendingFile(file: File) {
    this.pendingFile = file;
  }

  /**
   * Retrieves and clears the pending PDF file so it can only be used once.
   */
  consumePendingFile(): File | null {
    const file = this.pendingFile;
    this.pendingFile = null;
    return file ?? null;
  }

  /**
   * Checks whether the provided file is a PDF either by MIME type or file extension.
   */
  isPdfFile(file: File) {
    if (!file.type) {
      return file.name.toLowerCase().endsWith('.pdf');
    }

    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  }
}
