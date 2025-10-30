import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PendingPdfService {
  private file: File | null = null;

  setFile(file: File) {
    this.file = file;
  }

  consumeFile(): File | null {
    const current = this.file;
    this.file = null;
    return current;
  }
}
