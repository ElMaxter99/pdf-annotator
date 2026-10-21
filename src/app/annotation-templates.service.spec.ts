import { AnnotationTemplatesService } from './annotation-templates.service';

describe('AnnotationTemplatesService', () => {
  afterEach(() => localStorage.clear());

  it('removes the legacy copy of the last annotations on startup', () => {
    localStorage.setItem('pdf-annotator.last-coords', '[{"num":1,"fields":[]}]');
    localStorage.setItem('pdf-annotator.language', 'en');

    new AnnotationTemplatesService();

    expect(localStorage.getItem('pdf-annotator.last-coords')).toBeNull();
    expect(localStorage.getItem('pdf-annotator.language')).toBe('en'); // unrelated data stays
  });

  it('still starts with only the default template', () => {
    const service = new AnnotationTemplatesService();
    expect(service.getTemplates().map((t) => t.id)).toEqual([service.defaultTemplateId]);
  });
});
