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

  /** True while a file is waiting to be opened by the workspace (does not consume it). */
  hasPendingFile(): boolean {
    return this.pendingFile() !== null;
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
