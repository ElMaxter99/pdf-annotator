import { Injectable, signal } from '@angular/core';

/**
 * Permite compartir el archivo PDF inicial entre la landing y el editor.
 * La landing almacena el fichero y el editor lo consume en cuanto inicia.
 */
@Injectable({ providedIn: 'root' })
export class EditorBootstrapService {
  private readonly pendingFileSignal = signal<File | null>(null);

  setPendingFile(file: File) {
    this.pendingFileSignal.set(file);
  }

  consumePendingFile(): File | null {
    const file = this.pendingFileSignal();
    this.pendingFileSignal.set(null);
    return file ?? null;
  }
}
