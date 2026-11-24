import type { PageField } from '../../models/annotation.model';
import {
  AnnotationDragController,
  type AnnotationDragHost,
  horizontalBounds,
} from './annotation-drag.controller';

describe('horizontalBounds', () => {
  it('keeps an annotation inside the canvas', () => {
    expect(horizontalBounds(100, 600)).toEqual({ minLeft: 0, maxLeft: 500 });
  });

  it('never gives a negative maximum when the annotation is wider than the canvas', () => {
    expect(horizontalBounds(700, 600)).toEqual({ minLeft: 0, maxLeft: 0 });
    expect(horizontalBounds(-5, 600)).toEqual({ minLeft: 0, maxLeft: 600 });
  });
});

describe('AnnotationDragController', () => {
  function host(field: PageField | undefined, calls: string[]): AnnotationDragHost {
    const noop = () => undefined;
    return {
      layer: noop,
      canvas: noop,
      scale: () => 1,
      guidesEnabled: () => false,
      refreshOverlay: noop,
      applySnapping: (left, top) => ({ left, top, guides: [] }),
      annotationSnap: () => null,
      coords: () => [{ num: 1, fields: field ? [field] : [] }],
      styled: (f) => f,
      selection: () => null,
      clearSelection: noop,
      toggleSelection: noop,
      startEditing: (p, f) => calls.push(`edit ${p}/${f}`),
      clickOnGroupMember: noop,
      moveSelection: noop,
      setFieldPosition: noop,
      redrawAllForPage: noop,
    };
  }
  const evt = () =>
    ({ preventDefault: () => undefined, stopPropagation: () => undefined }) as PointerEvent;

  it('pressing a locked annotation opens its editor', () => {
    const calls: string[] = [];
    const field = { x: 1, y: 2, text: 'a' } as unknown as PageField;
    new AnnotationDragController(host(field, calls)).pointerDownLocked(evt(), 0, 0);
    expect(calls).toEqual(['edit 0/0']);
  });

  it('does nothing when the annotation no longer exists', () => {
    const calls: string[] = [];
    new AnnotationDragController(host(undefined, calls)).pointerDownLocked(evt(), 0, 0);
    expect(calls).toEqual([]);
  });
});
