import { TestBed } from '@angular/core/testing';
import { EditorSettingsService } from './editor-settings.service';

describe('EditorSettingsService', () => {
  beforeEach(() => localStorage.removeItem('pdf-annotator.editorSettings'));
  afterEach(() => localStorage.removeItem('pdf-annotator.editorSettings'));

  it('starts with the magnet on at 6 px', () => {
    const s = TestBed.inject(EditorSettingsService);
    expect(s.snapToAnnotations()).toBeTrue();
    expect(s.snapDistance()).toBe(6);
  });

  it('saves and restores the values', () => {
    const s = TestBed.inject(EditorSettingsService);
    s.setSnapToAnnotations(false);
    s.setSnapDistance(10);
    TestBed.resetTestingModule();
    const again = TestBed.inject(EditorSettingsService);
    expect(again.snapToAnnotations()).toBeFalse();
    expect(again.snapDistance()).toBe(10);
  });

  it('ignores corrupted data and resets', () => {
    localStorage.setItem('pdf-annotator.editorSettings', '{"snapToAnnotations":"x","snapDistance":99}');
    const s = TestBed.inject(EditorSettingsService);
    expect(s.snapToAnnotations()).toBeTrue();
    expect(s.snapDistance()).toBe(6);
    s.setSnapToAnnotations(false);
    s.reset();
    expect(s.snapToAnnotations()).toBeTrue();
  });
});
