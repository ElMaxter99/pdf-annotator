const MIN_RESTORED_SCALE = 0.25;
const MAX_RESTORED_SCALE = 8;

/** Una escala restaurada solo se acepta si es finita y está en el rango de zoom permitido. */
export function validRestoredScale(scale: unknown): number | null {
  return typeof scale === 'number' &&
    Number.isFinite(scale) &&
    scale >= MIN_RESTORED_SCALE &&
    scale <= MAX_RESTORED_SCALE
    ? scale
    : null;
}

/** Página restaurada acotada a [1, numPages]; un valor inválido vuelve a la página 1. */
export function clampRestoredPage(pageIndex: unknown, numPages: number): number {
  const rounded = typeof pageIndex === 'number' ? Math.round(pageIndex) || 1 : 1;
  return Math.min(Math.max(1, numPages), Math.max(1, rounded));
}

export interface SessionSaveState {
  hasFile: boolean;
  hasDocument: boolean;
  hasBrowser: boolean;
  batchActive: boolean;
  hasAnnotations: boolean;
  canUndo: boolean;
}

/**
 * Si hay que programar el guardado de la última sesión. Un lote lleva su propia copia y no debe
 * pisar la última sesión de un PDF suelto; sin anotaciones ni historial no se pisa la anterior.
 */
export function shouldScheduleSessionSave(state: SessionSaveState): boolean {
  if (!state.hasFile || !state.hasDocument || !state.hasBrowser || state.batchActive) {
    return false;
  }
  return state.hasAnnotations || state.canUndo;
}
