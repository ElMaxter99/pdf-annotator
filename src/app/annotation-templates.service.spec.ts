import { TestBed } from '@angular/core/testing';
import {
  AnnotationTemplate,
  AnnotationTemplatesService,
} from './annotation-templates.service';
import { PageAnnotations } from './models/annotation.model';

const TEMPLATES_KEY = 'pdf-annotator.templates';

class MockStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

class QuotaExceededStorage extends MockStorage {
  override setItem(): void {
    throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
  }
}

describe('AnnotationTemplatesService', () => {
  const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  let service: AnnotationTemplatesService;
  let storage: MockStorage;

  function overrideLocalStorage(value: Storage | undefined) {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    storage = new MockStorage();
    overrideLocalStorage(storage);

    TestBed.configureTestingModule({
      providers: [AnnotationTemplatesService],
    });

    service = TestBed.inject(AnnotationTemplatesService);
  });

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, 'localStorage', originalLocalStorageDescriptor);
    } else {
      overrideLocalStorage(undefined);
    }
  });

  function createTemplate(id: string, name: string): AnnotationTemplate {
    return {
      id,
      name,
      createdAt: Date.now(),
      pages: [],
    };
  }

  it('should return the default template first even when stored templates exist', () => {
    const existingTemplate = createTemplate('stored-id', 'Guardada');
    storage.setItem(TEMPLATES_KEY, JSON.stringify([existingTemplate]));

    const templates = service.getTemplates();

    expect(templates[0].id).toBe(service.defaultTemplateId);
    expect(templates[1]).toEqual(jasmine.objectContaining({ id: 'stored-id', name: 'Guardada' }));
  });

  it('should normalize template names and update existing templates', () => {
    const initialPages: PageAnnotations[] = [{ num: 1, fields: [] }];
    const updatedPages: PageAnnotations[] = [{ num: 2, fields: [] }];

    const created = service.saveTemplate('  Plantilla Personalizada  ', initialPages);
    expect(created).not.toBeNull();
    expect(created!.name).toBe('Plantilla Personalizada');

    const updated = service.saveTemplate('plantilla personalizada', updatedPages);
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created!.id);
    expect(updated!.pages).toEqual(updatedPages);
    expect(updated!.name).toBe('plantilla personalizada');

    const storedRaw = storage.getItem(TEMPLATES_KEY);
    expect(storedRaw).toBeTruthy();
    const storedTemplates = JSON.parse(storedRaw!) as AnnotationTemplate[];
    expect(storedTemplates.length).toBe(1);
    expect(storedTemplates[0].name).toBe('plantilla personalizada');
    expect(storedTemplates[0].pages).toEqual(updatedPages);
  });

  it('should return null when saving without localStorage support', () => {
    overrideLocalStorage(undefined);

    const result = service.saveTemplate('Sin almacenamiento', []);

    expect(result).toBeNull();
  });

  it('should handle quota exceeded errors without throwing', () => {
    const quotaStorage = new QuotaExceededStorage();
    overrideLocalStorage(quotaStorage);
    const warnSpy = spyOn(console, 'warn');

    const result = service.saveTemplate('Quota', []);

    expect(result).not.toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Storage quota exceeded, persistence disabled for key:',
      TEMPLATES_KEY
    );
  });
});
