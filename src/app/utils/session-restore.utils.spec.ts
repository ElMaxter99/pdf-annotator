import {
  clampRestoredPage,
  shouldScheduleSessionSave,
  validRestoredScale,
  type SessionSaveState,
} from './session-restore.utils';

describe('session-restore.utils', () => {
  describe('validRestoredScale', () => {
    it('acepta escalas dentro del rango', () => {
      expect(validRestoredScale(1.5)).toBe(1.5);
      expect(validRestoredScale(0.25)).toBe(0.25);
      expect(validRestoredScale(8)).toBe(8);
    });

    it('rechaza fuera de rango, no finitas y no numéricas', () => {
      expect(validRestoredScale(0.1)).toBeNull();
      expect(validRestoredScale(9)).toBeNull();
      expect(validRestoredScale(NaN)).toBeNull();
      expect(validRestoredScale(Infinity)).toBeNull();
      expect(validRestoredScale('2')).toBeNull();
      expect(validRestoredScale(undefined)).toBeNull();
    });
  });

  describe('clampRestoredPage', () => {
    it('acota a [1, numPages]', () => {
      expect(clampRestoredPage(3, 5)).toBe(3);
      expect(clampRestoredPage(99, 5)).toBe(5);
      expect(clampRestoredPage(-4, 5)).toBe(1);
      expect(clampRestoredPage(2.6, 5)).toBe(3);
    });

    it('vuelve a la página 1 con valores inválidos', () => {
      expect(clampRestoredPage(NaN, 5)).toBe(1);
      expect(clampRestoredPage('x', 5)).toBe(1);
      expect(clampRestoredPage(0, 5)).toBe(1);
    });

    it('no baja de 1 con documentos vacíos', () => {
      expect(clampRestoredPage(4, 0)).toBe(1);
    });
  });

  describe('shouldScheduleSessionSave', () => {
    const base: SessionSaveState = {
      hasFile: true,
      hasDocument: true,
      hasBrowser: true,
      batchActive: false,
      hasAnnotations: true,
      canUndo: false,
    };

    it('guarda con anotaciones o con historial', () => {
      expect(shouldScheduleSessionSave(base)).toBeTrue();
      expect(
        shouldScheduleSessionSave({ ...base, hasAnnotations: false, canUndo: true }),
      ).toBeTrue();
    });

    it('no pisa la sesión anterior si no hay nada que guardar', () => {
      expect(
        shouldScheduleSessionSave({ ...base, hasAnnotations: false, canUndo: false }),
      ).toBeFalse();
    });

    it('no guarda en modo lote, sin archivo, sin documento o sin navegador', () => {
      expect(shouldScheduleSessionSave({ ...base, batchActive: true })).toBeFalse();
      expect(shouldScheduleSessionSave({ ...base, hasFile: false })).toBeFalse();
      expect(shouldScheduleSessionSave({ ...base, hasDocument: false })).toBeFalse();
      expect(shouldScheduleSessionSave({ ...base, hasBrowser: false })).toBeFalse();
    });
  });
});
