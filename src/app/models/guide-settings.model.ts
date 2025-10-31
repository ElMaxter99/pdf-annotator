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
