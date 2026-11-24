import { Injectable, signal } from '@angular/core';
import {
  JSON_COPY_KEY,
  JSON_COPY_STRICT,
  JsonCopyFormat,
  normalizeJsonCopyFormat,
} from '../utils/json-copy-format.utils';

/**
 * Formato en el que se escribe el JSON al copiarlo y al descargar el lote (P-160 a P-162). Es uno solo para toda la
 * app: se guarda en el navegador y se lee como dato no confiable.
 */
@Injectable({ providedIn: 'root' })
export class JsonCopyFormatService {
  readonly format = signal<JsonCopyFormat>(this.load());

  set(patch: Partial<JsonCopyFormat>): void {
    const next = normalizeJsonCopyFormat({ ...this.format(), ...patch });
    this.format.set(next);
    try {
      localStorage.setItem(JSON_COPY_KEY, JSON.stringify(next));
    } catch {
      /* sin almacenamiento */
    }
  }

  private load(): JsonCopyFormat {
    try {
      const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(JSON_COPY_KEY);
      return normalizeJsonCopyFormat(raw ? JSON.parse(raw) : null);
    } catch {
      return { ...JSON_COPY_STRICT };
    }
  }
}
