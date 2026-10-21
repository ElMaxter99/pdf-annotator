/** Box in PDF points. `y` is the baseline (bottom edge); `height` is the font size. */
export interface AlignBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Returns the new `x`/`y` of every box so that the group is aligned on the given edge or centre.
 * Boxes keep the coordinate that is not involved (e.g. `left` only changes `x`).
 */
export function alignBoxes(boxes: readonly AlignBox[], mode: AlignMode): { x: number; y: number }[] {
  if (!boxes.length) {
    return [];
  }

  const left = Math.min(...boxes.map((b) => b.x));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.min(...boxes.map((b) => b.y));
  const top = Math.max(...boxes.map((b) => b.y + b.height));

  return boxes.map((box) => {
    switch (mode) {
      case 'left':
        return { x: round2(left), y: box.y };
      case 'right':
        return { x: round2(right - box.width), y: box.y };
      case 'center':
        return { x: round2((left + right) / 2 - box.width / 2), y: box.y };
      case 'bottom':
        return { x: box.x, y: round2(bottom) };
      case 'top':
        return { x: box.x, y: round2(top - box.height) };
      case 'middle':
        return { x: box.x, y: round2((bottom + top) / 2 - box.height / 2) };
    }
  });
}

export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * Spaces the boxes evenly between the two outermost ones along the axis (equal gaps between
 * edges). Needs at least three boxes; fewer are returned unchanged. Result order matches input.
 */
export function distributeBoxes(
  boxes: readonly AlignBox[],
  axis: DistributeAxis
): { x: number; y: number }[] {
  const unchanged = boxes.map((b) => ({ x: b.x, y: b.y }));
  if (boxes.length < 3) {
    return unchanged;
  }

  const start = (b: AlignBox) => (axis === 'horizontal' ? b.x : b.y);
  const size = (b: AlignBox) => (axis === 'horizontal' ? b.width : b.height);
  const order = boxes.map((_, i) => i).sort((a, b) => start(boxes[a]) - start(boxes[b]));

  const first = boxes[order[0]];
  const last = boxes[order[order.length - 1]];
  const span = start(last) + size(last) - start(first);
  const totalSize = boxes.reduce((sum, b) => sum + size(b), 0);
  const gap = (span - totalSize) / (boxes.length - 1);

  const result = unchanged;
  let cursor = start(first);
  for (const index of order) {
    const box = boxes[index];
    const position = round2(cursor);
    result[index] = axis === 'horizontal' ? { x: position, y: box.y } : { x: box.x, y: position };
    cursor += size(box) + gap;
  }
  return result;
}
