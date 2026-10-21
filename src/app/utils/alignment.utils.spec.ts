import { alignBoxes, AlignBox, distributeBoxes } from './alignment.utils';

describe('alignBoxes', () => {
  const boxes: AlignBox[] = [
    { x: 10, y: 100, width: 40, height: 10 },
    { x: 30, y: 200, width: 100, height: 20 },
    { x: 60, y: 150, width: 20, height: 12 },
  ];

  it('aligns to the left edge of the group', () => {
    expect(alignBoxes(boxes, 'left').map((p) => p.x)).toEqual([10, 10, 10]);
  });

  it('aligns right edges (width aware)', () => {
    // group right edge = 130
    expect(alignBoxes(boxes, 'right').map((p) => p.x)).toEqual([90, 30, 110]);
  });

  it('centres horizontally on the middle of the group', () => {
    // group spans 10..130 → centre 70
    expect(alignBoxes(boxes, 'center').map((p) => p.x)).toEqual([50, 20, 60]);
  });

  it('aligns bottoms on the lowest baseline', () => {
    expect(alignBoxes(boxes, 'bottom').map((p) => p.y)).toEqual([100, 100, 100]);
  });

  it('aligns tops on the highest top edge (height aware)', () => {
    // highest top = 200 + 20 = 220
    expect(alignBoxes(boxes, 'top').map((p) => p.y)).toEqual([210, 200, 208]);
  });

  it('centres vertically', () => {
    // group spans 100..220 → centre 160
    expect(alignBoxes(boxes, 'middle').map((p) => p.y)).toEqual([155, 150, 154]);
  });

  it('only changes the coordinate involved', () => {
    expect(alignBoxes(boxes, 'left').map((p) => p.y)).toEqual([100, 200, 150]);
    expect(alignBoxes(boxes, 'top').map((p) => p.x)).toEqual([10, 30, 60]);
  });

  it('handles empty input and a single box', () => {
    expect(alignBoxes([], 'left')).toEqual([]);
    expect(alignBoxes([boxes[0]], 'center')).toEqual([{ x: 10, y: 100 }]);
  });
});

describe('distributeBoxes', () => {
  it('spaces boxes with equal gaps horizontally, keeping the outer ones', () => {
    const boxes: AlignBox[] = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 30, height: 10 },
      { x: 90, y: 0, width: 10, height: 10 },
    ];
    // span 100, widths 50 → gap 25
    expect(distributeBoxes(boxes, 'horizontal')).toEqual([
      { x: 0, y: 0 },
      { x: 35, y: 0 },
      { x: 90, y: 0 },
    ]);
  });

  it('works on unsorted input and preserves the input order of the result', () => {
    const boxes: AlignBox[] = [
      { x: 90, y: 5, width: 10, height: 10 },
      { x: 0, y: 6, width: 10, height: 10 },
      { x: 20, y: 7, width: 30, height: 10 },
    ];
    expect(distributeBoxes(boxes, 'horizontal')).toEqual([
      { x: 90, y: 5 },
      { x: 0, y: 6 },
      { x: 35, y: 7 },
    ]);
  });

  it('distributes vertically using the box height', () => {
    const boxes: AlignBox[] = [
      { x: 1, y: 0, width: 10, height: 10 },
      { x: 2, y: 10, width: 10, height: 20 },
      { x: 3, y: 100, width: 10, height: 10 },
    ];
    // span 110, heights 40 → gap 35
    expect(distributeBoxes(boxes, 'vertical')).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 45 },
      { x: 3, y: 100 },
    ]);
  });

  it('leaves fewer than three boxes untouched', () => {
    const two: AlignBox[] = [
      { x: 0, y: 0, width: 5, height: 5 },
      { x: 50, y: 9, width: 5, height: 5 },
    ];
    expect(distributeBoxes(two, 'horizontal')).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 9 },
    ]);
    expect(distributeBoxes([], 'vertical')).toEqual([]);
  });
});
