export interface GuideSettings {
  showGrid: boolean;
  gridSize: number;
  showRulers: boolean;
  showAlignment: boolean;
  snapToGrid: boolean;
  snapToMargins: boolean;
  snapToCenters: boolean;
  snapToCustom: boolean;
  marginSize: number;
  snapTolerance: number;
  snapPointsX: readonly number[];
  snapPointsY: readonly number[];
  usePdfCoordinates: boolean;
}

export const DEFAULT_GUIDE_SETTINGS: GuideSettings = {
  showGrid: true,
  gridSize: 10,
  showRulers: true,
  showAlignment: true,
  snapToGrid: true,
  snapToMargins: true,
  snapToCenters: true,
  snapToCustom: false,
  marginSize: 18,
  snapTolerance: 8,
  snapPointsX: [],
  snapPointsY: [],
  usePdfCoordinates: false,
};

export function cloneGuideSettings(settings: GuideSettings): GuideSettings {
  return {
    ...settings,
    snapPointsX: [...settings.snapPointsX],
    snapPointsY: [...settings.snapPointsY],
  };
}

function arraysEqual(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return a.every((value, index) => value === b[index]);
}

export function differsFromDefaultGuideSettings(settings: GuideSettings): boolean {
  const defaults = DEFAULT_GUIDE_SETTINGS;

  return (
    settings.showGrid !== defaults.showGrid ||
    settings.gridSize !== defaults.gridSize ||
    settings.showRulers !== defaults.showRulers ||
    settings.showAlignment !== defaults.showAlignment ||
    settings.snapToGrid !== defaults.snapToGrid ||
    settings.snapToMargins !== defaults.snapToMargins ||
    settings.snapToCenters !== defaults.snapToCenters ||
    settings.snapToCustom !== defaults.snapToCustom ||
    settings.marginSize !== defaults.marginSize ||
    settings.snapTolerance !== defaults.snapTolerance ||
    settings.usePdfCoordinates !== defaults.usePdfCoordinates ||
    !arraysEqual(settings.snapPointsX, defaults.snapPointsX) ||
    !arraysEqual(settings.snapPointsY, defaults.snapPointsY)
  );
}
