import { Injectable, signal } from '@angular/core';
import type { PageAnnotations } from '../models/annotation.model';

/** Annotations and view to apply once a restored PDF has loaded. */
export interface PendingRestore {
  readonly coords: PageAnnotations[];
  readonly pageIndex: number;
  readonly scale: number;
}

@Injectable({ providedIn: 'root' })
export class PendingFileService {
  private readonly pendingFile = signal<File | null>(null);
  private pendingRestore: PendingRestore | null = null;

  setPendingFile(file: File, restore: PendingRestore | null = null): void {
    this.pendingFile.set(file);
    this.pendingRestore = restore;
  }

  consumePendingFile(): File | null {
    const file = this.pendingFile();
    this.pendingFile.set(null);
    return file;
  }

  consumePendingRestore(): PendingRestore | null {
    const restore = this.pendingRestore;
    this.pendingRestore = null;
    return restore;
  }
}
