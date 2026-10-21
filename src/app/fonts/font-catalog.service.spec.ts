import { TestBed } from '@angular/core/testing';
import { DEFAULT_FONT_ID, FontCatalogService } from './font-catalog.service';

describe('FontCatalogService', () => {
  let service: FontCatalogService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FontCatalogService);
  });

  const addCustom = (id: string, name: string) =>
    service.customFonts.set([
      { id, name, cssName: `${name}-${id}`, data: new Uint8Array([1, 2, 3]) },
    ]);

  it('offers the standard families and no custom fonts by default', () => {
    const options = service.fontOptions();
    expect(options.some((o) => o.id === DEFAULT_FONT_ID)).toBeTrue();
    expect(options.every((o) => o.type === 'standard')).toBeTrue();
  });

  it('only exposes custom fonts while the feature is enabled', () => {
    addCustom('f1', 'MiFuente');
    expect(service.fontOptions().some((o) => o.type === 'custom')).toBeFalse();

    service.customFontsFeatureEnabled.set(true);
    const custom = service.fontOptions().find((o) => o.type === 'custom');
    expect(custom?.id).toBe('custom:f1');
    expect(custom?.descriptor).toEqual({ kind: 'custom', fontId: 'f1' });
    expect(custom?.cssFamily).toBe('"MiFuente-f1"');
  });

  it('falls back to the default font for unknown ids', () => {
    expect(service.getFontOptionById('nope').id).toBe(DEFAULT_FONT_ID);
    expect(service.getFontOptionById('standard:courier').id).toBe('standard:courier');
    expect(service.resolveCssFontFamily('nope')).toContain('Helvetica');
  });

  it('matches loose font names from imported JSON', () => {
    // Characterization: `Arial` also appears in Helvetica's CSS stack, which is matched first.
    expect(service.resolveImportedFontFamily('Arial')).toBe('standard:helvetica');
    expect(service.resolveImportedFontFamily('times new roman')).toBe('standard:times-new-roman');
    expect(service.resolveImportedFontFamily('standard:courier')).toBe('standard:courier');
    expect(service.resolveImportedFontFamily({ name: 'Times New Roman' })).toBe(
      'standard:times-new-roman'
    );
    expect(service.resolveImportedFontFamily({ type: 'standard', name: 'arial-narrow' })).toBe(
      'standard:arial'
    );
    expect(service.resolveImportedFontFamily('Georgia, serif')).toBeDefined();
    expect(service.resolveImportedFontFamily('Totally Unknown Font')).toBeUndefined();
    expect(service.resolveImportedFontFamily()).toBeUndefined();
  });

  it('resolves custom fonts by name when enabled', () => {
    service.customFontsFeatureEnabled.set(true);
    addCustom('f1', 'DejaVuSerif-Bold');
    expect(service.resolveImportedFontFamily('DejaVuSerif-Bold')).toBe('custom:f1');
  });

  it('collects font candidates from the many shapes a field can use', () => {
    const candidates = service.collectFontFamilyCandidates({
      fontFamily: 'Arial',
      style: { fontFamily: 'Courier' },
      font: { name: 'Times New Roman' },
      typography: { name: 'Georgia' },
      meta: { font: { family: 'Verdana' } },
    });
    expect(candidates).toContain('Arial');
    expect(candidates).toContain('Courier');
    expect(candidates).toContain('Times New Roman');
    expect(candidates).toContain('Georgia');
    expect(candidates).toContain('Verdana');
  });
});
