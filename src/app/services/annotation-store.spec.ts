import { PageField } from '../models/annotation.model';
import { addFieldToPages } from '../utils/annotation-pages.utils';
import { AnnotationStore } from './annotation-store';

const field = (mapField: string): PageField => ({
  x: 1,
  y: 2,
  mapField,
  fontSize: 12,
  color: '#000000',
  type: 'text',
});

describe('AnnotationStore', () => {
  let store: AnnotationStore;
  const add = (text: string) =>
    store.applyChange(() => store.coords.update((pages) => addFieldToPages(1, field(text), pages)));

  beforeEach(() => {
    store = new AnnotationStore();
    store.setFieldComparator((a, b) => a.mapField === b.mapField);
  });

  it('starts empty with no history', () => {
    expect(store.coords()).toEqual([]);
    expect(store.canUndo()).toBeFalse();
    expect(store.canRedo()).toBeFalse();
    expect(store.undo()).toBeFalse();
    expect(store.redo()).toBeFalse();
  });

  it('records history only for real changes', () => {
    expect(add('a')).toBeTrue();
    expect(store.applyChange(() => store.coords.update((pages) => [...pages]))).toBeFalse();
    expect(store.canUndo()).toBeTrue();
    store.undo();
    expect(store.canUndo()).toBeFalse();
  });

  it('undoes and redoes in order', () => {
    add('a');
    add('b');
    expect(store.coords()[0].fields.length).toBe(2);

    expect(store.undo()).toBeTrue();
    expect(store.coords()[0].fields.map((f) => f.mapField)).toEqual(['a']);
    expect(store.canRedo()).toBeTrue();

    expect(store.undo()).toBeTrue();
    expect(store.coords()).toEqual([]);

    expect(store.redo()).toBeTrue();
    expect(store.redo()).toBeTrue();
    expect(store.coords()[0].fields.map((f) => f.mapField)).toEqual(['a', 'b']);
    expect(store.canRedo()).toBeFalse();
  });

  it('clears the redo stack when a new change is made', () => {
    add('a');
    store.undo();
    expect(store.canRedo()).toBeTrue();
    add('b');
    expect(store.canRedo()).toBeFalse();
  });

  it('resets history without touching the annotations', () => {
    add('a');
    store.resetHistory();
    expect(store.canUndo()).toBeFalse();
    expect(store.coords()[0].fields.length).toBe(1);
  });

  it('snapshots are detached copies', () => {
    add('a');
    const snap = store.snapshot();
    snap[0].fields[0].mapField = 'x';
    expect(store.coords()[0].fields[0].mapField).toBe('a');
  });
});
