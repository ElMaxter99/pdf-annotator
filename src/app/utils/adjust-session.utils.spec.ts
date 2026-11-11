import {
  effectiveShift,
  fieldVisual,
  formatShift,
  hitAdjustField,
  isFieldMoved,
  recomputeFields,
  type AdjustField,
} from './adjust-session.utils';
import type { TextAnchor } from './text-anchors.utils';

const field = (over: Partial<AdjustField> = {}): AdjustField => ({
  key: '1:0',
  page: 1,
  fieldIndex: 0,
  name: 'total',
  x: 50,
  y: 250,
  fontSize: 12,
  shift: { dx: 10, dy: -5, confidence: 'high', anchorIds: [1] },
  override: null,
  manual: null,
  ...over,
});

describe('adjust-session.utils', () => {
  it('moves reliable fields and leaves low ones for the user', () => {
    expect(isFieldMoved(field())).toBeTrue();
    expect(
      isFieldMoved(field({ shift: { dx: 1, dy: 1, confidence: 'low', anchorIds: [1] } })),
    ).toBeFalse();
    expect(isFieldMoved(field({ shift: null }))).toBeFalse();
  });

  it('respects the choice of the user and manual moves', () => {
    expect(isFieldMoved(field({ override: false }))).toBeFalse();
    expect(effectiveShift(field({ override: false }))).toEqual({ dx: 0, dy: 0 });
    expect(effectiveShift(field({ manual: { dx: 3, dy: 4 } }))).toEqual({ dx: 3, dy: 4 });
  });

  it('recomputes shifts from the anchors that are on', () => {
    const anchor = (id: number, dy: number): TextAnchor => ({
      id,
      text: 't' + id,
      a: { x: 50, y: 250 + id },
      b: { x: 60, y: 250 + id + dy },
      dx: 10,
      dy,
      ambiguous: false,
    });
    const rows = [1, 2, 3].map((id) => ({
      key: `1:${id}`,
      page: 1,
      anchor: anchor(id, -8),
      on: id !== 3,
      outlier: false,
    }));
    const [result] = recomputeFields([field({ shift: null })], rows, 'near');
    expect(result.shift?.dy).toBe(-8);
    expect(result.shift?.anchorIds).toEqual([1, 2]);
  });

  it('formats the shift with arrows and ignores rounding to zero', () => {
    expect(formatShift(24, -32)).toBe('→ 24 pt · ↓ 32 pt');
    expect(formatShift(-5, 10.4)).toBe('← 5 pt · ↑ 10 pt');
    expect(formatShift(0.2, -0.1)).toBe('0 pt');
  });

  it('finds the field under a point at its proposed or original place', () => {
    const f = field({ x: 100, y: 100, shift: { dx: 50, dy: 0, confidence: 'high', anchorIds: [1] } });
    expect(hitAdjustField([f], 1, { x: 155, y: 104 }, 1)?.key).toBe(f.key);
    expect(hitAdjustField([f], 1, { x: 105, y: 104 }, 1)).toBeNull();
    expect(hitAdjustField([f], 1, { x: 105, y: 104 }, 1, true)?.key).toBe(f.key);
    expect(hitAdjustField([f], 2, { x: 155, y: 104 }, 1)).toBeNull();
  });

  it('classifies how a field is drawn', () => {
    expect(fieldVisual(field())).toBe('proposal');
    expect(fieldVisual(field({ shift: { dx: 1, dy: 1, confidence: 'estimated', anchorIds: [] } }))).toBe('estimated');
    expect(fieldVisual(field({ manual: { dx: 1, dy: 1 } }))).toBe('manual');
    expect(fieldVisual(field({ shift: { dx: 1, dy: 1, confidence: 'low', anchorIds: [1] } }))).toBe('low');
    expect(fieldVisual(field({ override: false }))).toBe('grey');
  });
});
