import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_ANNOTATION_SNAP_DISTANCE,
  normalizeSnapDistance,
} from '../utils/annotation-snap.utils';

const KEY = 'pdf-annotator.editorSettings';

/**
 * Basic editor settings (Opciones › Editor; also in the workspace's Advanced tab). Saved in the browser and
 * read as untrusted.
 */
@Injectable({ providedIn: 'root' })
export class EditorSettingsService {
  /** Magnet between annotations while dragging (P-153 to P-155). On by default. */
  readonly snapToAnnotations = signal(true);
  /** Distance (screen px) at which an annotation jumps to another one's X or Y. */
  readonly snapDistance = signal(DEFAULT_ANNOTATION_SNAP_DISTANCE);

  constructor() {
    this.load();
  }

  setSnapToAnnotations(on: boolean): void {
    this.snapToAnnotations.set(!!on);
    this.save();
  }

  setSnapDistance(px: number): void {
    this.snapDistance.set(normalizeSnapDistance(px));
    this.save();
  }

  reset(): void {
    this.snapToAnnotations.set(true);
    this.snapDistance.set(DEFAULT_ANNOTATION_SNAP_DISTANCE);
    this.save();
  }

  private load(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const rec = data as Record<string, unknown>;
      if (typeof rec['snapToAnnotations'] === 'boolean') {
        this.snapToAnnotations.set(rec['snapToAnnotations']);
      }
      this.snapDistance.set(normalizeSnapDistance(rec['snapDistance']));
    } catch {
      /* sin almacenamiento o datos dañados: valores por defecto */
    }
  }

  private save(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(
        KEY,
        JSON.stringify({
          snapToAnnotations: this.snapToAnnotations(),
          snapDistance: this.snapDistance(),
        }),
      );
    } catch {
      /* ignorar */
    }
  }
}
