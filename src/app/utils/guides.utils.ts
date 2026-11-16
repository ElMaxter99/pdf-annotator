import type { GuideSettings } from '../models/guide-settings.model';

export type OverlayGuide = {
  orientation: 'horizontal' | 'vertical';
  position: number;
  highlighted?: boolean;
};

export type OverlayRect = { left: number; top: number; width: number; height: number };

export type SnapBounds = { minLeft: number; maxLeft: number; minTop: number; maxTop: number };

export function projectYPoint(
  point: number,
  height: number,
  scale: number,
  usePdfCoordinates: boolean,
) {
  const pdfHeight = height / scale;
  const clamped = Math.max(0, Math.min(point, pdfHeight));
  if (usePdfCoordinates) {
    return height - clamped * scale;
  }
  return clamped * scale;
}

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  settings: GuideSettings,
  width: number,
  height: number,
  scale: number,
) {
  if (!settings.showGrid) {
    return;
  }

  const spacingPx = Math.max(settings.gridSize, 0.1) * scale;
  if (spacingPx < 4) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.09)';
  ctx.lineWidth = 1;

  for (let x = spacingPx; x < width; x += spacingPx) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, height);
    ctx.stroke();
  }

  for (let y = spacingPx; y < height; y += spacingPx) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(width, Math.round(y) + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawRulers(
  ctx: CanvasRenderingContext2D,
  settings: GuideSettings,
  width: number,
  height: number,
  scale: number,
) {
  if (!settings.showRulers) {
    return;
  }

  const rulerSize = 22;
  const majorStep = Math.max(50 * scale, 40);
  const minorStep = Math.max(10 * scale, 8);
  const usePdfCoordinates = settings.usePdfCoordinates;
  const pdfHeight = height / scale;
  const formatValue = (value: number) => (Math.round(value * 10) / 10).toString();

  ctx.save();

  ctx.fillStyle = 'rgba(10, 10, 18, 0.55)';
  ctx.fillRect(0, 0, width, rulerSize);
  ctx.fillRect(0, 0, rulerSize, height);

  ctx.strokeStyle = 'rgba(94, 234, 212, 0.35)';
  ctx.lineWidth = 1;

  for (let x = 0; x <= width; x += minorStep) {
    const isMajor = Math.abs(x % majorStep) < 1e-6;
    const tickHeight = isMajor ? rulerSize : rulerSize * 0.6;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, 0);
    ctx.lineTo(Math.round(x) + 0.5, tickHeight);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += minorStep) {
    const isMajor = Math.abs(y % majorStep) < 1e-6;
    const tickWidth = isMajor ? rulerSize : rulerSize * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) + 0.5);
    ctx.lineTo(tickWidth, Math.round(y) + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(245, 245, 245, 0.7)';
  ctx.font = '10px "Segoe UI", sans-serif';
  ctx.textBaseline = 'top';

  for (let x = majorStep; x < width; x += majorStep) {
    const value = x / scale;
    ctx.fillText(formatValue(value), x + 4, 4);
  }

  ctx.save();
  ctx.rotate(-Math.PI / 2);
  for (let y = majorStep; y < height; y += majorStep) {
    const rawUnits = usePdfCoordinates ? (height - y) / scale : y / scale;
    ctx.fillText(formatValue(rawUnits), -y - 24, 4);
  }
  ctx.fillText(formatValue(usePdfCoordinates ? pdfHeight : 0), -24, 4);
  ctx.fillText(formatValue(usePdfCoordinates ? 0 : pdfHeight), -height - 24, 4);
  ctx.restore();

  ctx.restore();
}

export function drawStaticGuides(
  ctx: CanvasRenderingContext2D,
  settings: GuideSettings,
  width: number,
  height: number,
  scale: number,
) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.25)';

  if (settings.snapToMargins) {
    const marginPx = Math.max(settings.marginSize, 0) * scale;
    if (marginPx > 0 && marginPx < width) {
      ctx.beginPath();
      ctx.moveTo(Math.round(marginPx) + 0.5, 0);
      ctx.lineTo(Math.round(marginPx) + 0.5, height);
      ctx.moveTo(Math.round(width - marginPx) + 0.5, 0);
      ctx.lineTo(Math.round(width - marginPx) + 0.5, height);
      ctx.stroke();
    }

    if (marginPx > 0 && marginPx < height) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(marginPx) + 0.5);
      ctx.lineTo(width, Math.round(marginPx) + 0.5);
      ctx.moveTo(0, Math.round(height - marginPx) + 0.5);
      ctx.lineTo(width, Math.round(height - marginPx) + 0.5);
      ctx.stroke();
    }
  }

  if (settings.snapToCenters) {
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(centerX) + 0.5, 0);
    ctx.lineTo(Math.round(centerX) + 0.5, height);
    ctx.moveTo(0, Math.round(centerY) + 0.5);
    ctx.lineTo(width, Math.round(centerY) + 0.5);
    ctx.stroke();
  }

  if (settings.snapToCustom) {
    settings.snapPointsX.forEach((point) => {
      const linePx = point * scale;
      if (linePx >= 0 && linePx <= width) {
        ctx.beginPath();
        ctx.moveTo(Math.round(linePx) + 0.5, 0);
        ctx.lineTo(Math.round(linePx) + 0.5, height);
        ctx.stroke();
      }
    });

    settings.snapPointsY.forEach((point) => {
      const linePx = projectYPoint(point, height, scale, settings.usePdfCoordinates);
      if (linePx >= 0 && linePx <= height) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(linePx) + 0.5);
        ctx.lineTo(width, Math.round(linePx) + 0.5);
        ctx.stroke();
      }
    });
  }

  ctx.restore();
}

export function drawActiveGuides(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  showAlignment: boolean,
  rect: OverlayRect | null,
  guides: readonly OverlayGuide[],
) {
  if (!rect) {
    return;
  }

  ctx.save();
  ctx.lineWidth = 1;

  guides.forEach((guide) => {
    if (!showAlignment && !guide.highlighted) {
      return;
    }
    const color = guide.highlighted ? 'rgba(94, 234, 212, 0.85)' : 'rgba(94, 234, 212, 0.35)';
    ctx.strokeStyle = color;
    ctx.setLineDash(guide.highlighted ? [4, 4] : [8, 6]);
    if (guide.orientation === 'vertical') {
      const x = Math.min(Math.max(guide.position, 0), width);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    } else {
      const y = Math.min(Math.max(guide.position, 0), height);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
      ctx.stroke();
    }
  });

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.75)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(Math.round(rect.left) + 0.5, Math.round(rect.top) + 0.5, rect.width, rect.height);
  ctx.restore();
}

export function computeSnapping(input: {
  baseLeft: number;
  baseTop: number;
  bounds: SnapBounds;
  settings: GuideSettings;
  scale: number;
  width: number;
  height: number;
  elementWidth: number;
  elementHeight: number;
  fontSizePx: number;
}): { left: number; top: number; guides: OverlayGuide[] } {
  const {
    baseLeft,
    baseTop,
    bounds,
    settings,
    scale,
    width,
    height,
    elementWidth,
    elementHeight,
    fontSizePx,
  } = input;
  const tolerance = Math.max(settings.snapTolerance, 0);
  const usePdfCoordinates = settings.usePdfCoordinates;
  const baselineOffset = Number.isFinite(fontSizePx) ? fontSizePx : 0;
  const pdfBaselineOffset = usePdfCoordinates ? baselineOffset : 0;

  type Candidate = { candidate: number; line: number; delta: number };

  const verticalCandidates: Candidate[] = [];
  const horizontalCandidates: Candidate[] = [];

  const pushVertical = (candidate: number, line: number) => {
    if (!Number.isFinite(candidate) || !Number.isFinite(line)) {
      return;
    }
    const clampedCandidate = Math.min(Math.max(candidate, bounds.minLeft), bounds.maxLeft);
    const clampedLine = Math.min(Math.max(line, 0), width);
    verticalCandidates.push({
      candidate: clampedCandidate,
      line: clampedLine,
      delta: Math.abs(clampedCandidate - baseLeft),
    });
  };

  const pushHorizontal = (candidate: number, line: number) => {
    if (!Number.isFinite(candidate) || !Number.isFinite(line)) {
      return;
    }
    const clampedCandidate = Math.min(Math.max(candidate, bounds.minTop), bounds.maxTop);
    const clampedLine = Math.min(Math.max(line, 0), height);
    horizontalCandidates.push({
      candidate: clampedCandidate,
      line: clampedLine,
      delta: Math.abs(clampedCandidate - baseTop),
    });
  };

  if (settings.snapToMargins) {
    const marginPx = Math.max(settings.marginSize, 0) * scale;
    if (marginPx > 0) {
      pushVertical(marginPx, marginPx);
      pushVertical(width - marginPx - elementWidth, width - marginPx);
      pushHorizontal(marginPx, marginPx);
      pushHorizontal(height - marginPx - elementHeight, height - marginPx);
    }
  }

  if (settings.snapToCenters) {
    const centerX = width / 2;
    const centerY = height / 2;
    pushVertical(centerX - elementWidth / 2, centerX);
    pushHorizontal(centerY - elementHeight / 2, centerY);
  }

  if (settings.snapToGrid) {
    const spacingPx = Math.max(settings.gridSize, 0.1) * scale;
    if (spacingPx >= 2) {
      const snappedLeft = Math.round(baseLeft / spacingPx) * spacingPx;
      const snappedTop = Math.round(baseTop / spacingPx) * spacingPx;
      pushVertical(snappedLeft, snappedLeft);
      pushHorizontal(snappedTop, snappedTop);
    }
  }

  if (settings.snapToCustom) {
    settings.snapPointsX.forEach((point) => {
      const linePx = point * scale;
      pushVertical(linePx, linePx);
    });
    settings.snapPointsY.forEach((point) => {
      const linePx = projectYPoint(point, height, scale, usePdfCoordinates);
      const candidateTop = linePx - pdfBaselineOffset;
      pushHorizontal(candidateTop, linePx);
    });
  }

  let snappedLeft = Math.min(Math.max(baseLeft, bounds.minLeft), bounds.maxLeft);
  let snappedTop = Math.min(Math.max(baseTop, bounds.minTop), bounds.maxTop);

  const bestVertical = verticalCandidates
    .filter((cand) => cand.delta <= tolerance)
    .sort((a, b) => a.delta - b.delta)[0];
  if (bestVertical) {
    snappedLeft = bestVertical.candidate;
  }

  const bestHorizontal = horizontalCandidates
    .filter((cand) => cand.delta <= tolerance)
    .sort((a, b) => a.delta - b.delta)[0];
  if (bestHorizontal) {
    snappedTop = bestHorizontal.candidate;
  }

  const guideMap = new Map<string, OverlayGuide>();
  const includeGuide = (
    orientation: 'vertical' | 'horizontal',
    cand: Candidate,
    highlighted: boolean,
  ) => {
    const key = `${orientation}-${cand.line.toFixed(2)}`;
    const existing = guideMap.get(key);
    if (existing && existing.highlighted) {
      return;
    }
    if (!highlighted && !settings.showAlignment) {
      return;
    }
    if (!highlighted && cand.delta > tolerance * 1.5) {
      return;
    }
    guideMap.set(key, {
      orientation,
      position: cand.line,
      highlighted,
    });
  };

  verticalCandidates.forEach((cand) => {
    const highlighted = !!bestVertical && Math.abs(cand.candidate - bestVertical.candidate) < 0.5;
    includeGuide('vertical', cand, highlighted);
  });

  horizontalCandidates.forEach((cand) => {
    const highlighted =
      !!bestHorizontal && Math.abs(cand.candidate - bestHorizontal.candidate) < 0.5;
    includeGuide('horizontal', cand, highlighted);
  });

  return { left: snappedLeft, top: snappedTop, guides: Array.from(guideMap.values()) };
}
