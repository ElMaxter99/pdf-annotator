import { DEFAULT_GUIDE_SETTINGS, cloneGuideSettings } from '../models/guide-settings.model';
import { computeSnapping, projectYPoint } from './guides.utils';

describe('guides.utils', () => {
  it('projectYPoint respeta el modo de coordenadas y los límites', () => {
    expect(projectYPoint(10, 200, 2, false)).toBe(20);
    expect(projectYPoint(10, 200, 2, true)).toBe(180);
    expect(projectYPoint(1000, 200, 2, false)).toBe(200);
  });

  it('computeSnapping se ajusta al centro dentro de la tolerancia', () => {
    const settings = {
      ...cloneGuideSettings(DEFAULT_GUIDE_SETTINGS),
      snapToCenters: true,
      snapToGrid: false,
    };
    settings.snapTolerance = 10;
    const result = computeSnapping({
      baseLeft: 197,
      baseTop: 0,
      bounds: { minLeft: 0, maxLeft: 380, minTop: 0, maxTop: 580 },
      settings,
      scale: 1,
      width: 400,
      height: 600,
      elementWidth: 20,
      elementHeight: 20,
      fontSizePx: 12,
    });
    expect(result.left).toBe(190);
    expect(result.guides.some((g) => g.highlighted)).toBeTrue();
  });
});
