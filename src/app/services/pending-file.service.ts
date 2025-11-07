import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PendingFileService {
  private readonly pendingFile = signal<File | null>(null);

  setPendingFile(file: File): void {
    this.pendingFile.set(file);
  }

  consumePendingFile(): File | null {
    const file = this.pendingFile();
    this.pendingFile.set(null);
    return file;
  }
}
