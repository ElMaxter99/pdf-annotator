import { Injectable, signal } from '@angular/core';
import type { PageAnnotations, PageField } from '../models/annotation.model';
import { areAnnotationPagesEqual, cloneAnnotationPages } from '../utils/annotation-pages.utils';

/**
 * Holds the annotations of the open document together with their undo/redo history.
 * Provided per workspace page (not root) so every visit starts from a clean state.
 */
const COALESCE_WINDOW_MS = 800;

@Injectable()
export class AnnotationStore {
  readonly coords = signal<PageAnnotations[]>([]);

  private readonly undoStack = signal<PageAnnotations[][]>([]);
  private readonly redoStack = signal<PageAnnotations[][]>([]);
  private fieldsEqual: (a: PageField, b: PageField) => boolean = () => false;
  private lastCoalesce: { key: string; at: number } | null = null;

  /** Defines when two fields count as equal (i.e. when an edit is a real change). */
  setFieldComparator(comparator: (a: PageField, b: PageField) => boolean): void {
    this.fieldsEqual = comparator;
  }

  canUndo(): boolean {
    return this.undoStack().length > 0;
  }

  canRedo(): boolean {
    return this.redoStack().length > 0;
  }

  snapshot(pages: readonly PageAnnotations[] = this.coords()): PageAnnotations[] {
    return cloneAnnotationPages(pages);
  }

  /**
   * Runs the mutation and records history only when the annotations really changed.
   * Changes sharing a `coalesceKey` within `COALESCE_WINDOW_MS` (e.g. repeated arrow-key nudges)
   * count as a single undo step.
   */
  applyChange(mutator: () => void, options: { coalesceKey?: string } = {}): boolean {
    const previous = this.snapshot();
    mutator();
    const changed = !areAnnotationPagesEqual(previous, this.coords(), this.fieldsEqual);
    if (!changed) {
      return false;
    }

    const now = Date.now();
    const key = options.coalesceKey;
    const merge =
      !!key &&
      this.lastCoalesce?.key === key &&
      now - this.lastCoalesce.at < COALESCE_WINDOW_MS &&
      this.undoStack().length > 0;

    if (!merge) {
      this.undoStack.update((stack) => [...stack, previous]);
    }
    this.redoStack.set([]);
    this.lastCoalesce = key ? { key, at: now } : null;
    return true;
  }

  /** Returns false when there is nothing to undo. */
  undo(): boolean {
    const states = this.undoStack();
    if (!states.length) {
      return false;
    }

    this.lastCoalesce = null;
    const previous = states[states.length - 1];
    const current = this.snapshot();
    this.undoStack.update((stack) => stack.slice(0, -1));
    this.redoStack.update((stack) => [...stack, current]);
    this.coords.set(this.snapshot(previous));
    return true;
  }

  /** Returns false when there is nothing to redo. */
  redo(): boolean {
    const states = this.redoStack();
    if (!states.length) {
      return false;
    }

    this.lastCoalesce = null;
    const next = states[states.length - 1];
    const current = this.snapshot();
    this.redoStack.update((stack) => stack.slice(0, -1));
    this.undoStack.update((stack) => [...stack, current]);
    this.coords.set(this.snapshot(next));
    return true;
  }

  resetHistory(): void {
    this.lastCoalesce = null;
    this.undoStack.set([]);
    this.redoStack.set([]);
  }
}
