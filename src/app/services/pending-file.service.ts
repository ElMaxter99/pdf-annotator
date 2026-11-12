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
  /** The single PDF last open in the workspace in this visit, to reopen it with «Adelante». */
  private lastOpened: { file: File; restore: PendingRestore } | null = null;

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

  /** Remembers what the workspace had open when leaving it (memory only, lost on reload). */
  rememberLastOpened(file: File, restore: PendingRestore): void {
    this.lastOpened = { file, restore };
  }

  forgetLastOpened(): void {
    this.lastOpened = null;
  }

  /** Queues the last PDF open in this visit again; false when there is none. */
  reopenLast(): boolean {
    if (!this.lastOpened) {
      return false;
    }
    this.setPendingFile(this.lastOpened.file, this.lastOpened.restore);
    return true;
  }
}
