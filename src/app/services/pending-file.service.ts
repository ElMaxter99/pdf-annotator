import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PendingFileService {
  private readonly pendingFile = signal<File | null>(null);
  private readonly activeDocumentLoaded = signal(false);

  setPendingFile(file: File): void {
    this.pendingFile.set(file);
    this.activeDocumentLoaded.set(false);
  }

  consumePendingFile(): File | null {
    const file = this.pendingFile();
    this.pendingFile.set(null);
    return file;
  }

  hasPendingFile(): boolean {
    return this.pendingFile() !== null;
  }

  markActiveDocumentLoaded(): void {
    this.activeDocumentLoaded.set(true);
  }

  clearActiveDocument(): void {
    this.activeDocumentLoaded.set(false);
  }

  hasActiveDocument(): boolean {
    return this.activeDocumentLoaded();
  }
}
