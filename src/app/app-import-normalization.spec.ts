import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { AnnotationTemplatesService, AnnotationTemplate } from './annotation-templates.service';
import { PageAnnotations } from './models/annotation.model';
import { Language, TranslationService } from './i18n/translation.service';

describe('App import normalization', () => {
  class AnnotationTemplatesServiceStub {
    readonly defaultTemplateId = 'stub-default-template';
    private readonly templates: AnnotationTemplate[] = [
      {
        id: this.defaultTemplateId,
        name: 'Default',
        createdAt: 0,
        pages: [],
      },
    ];

    readonly storeLastCoordsSpy = jasmine.createSpy<(pages: readonly PageAnnotations[]) => void>(
      'storeLastCoords'
    );

    getTemplates(): AnnotationTemplate[] {
      return this.templates.map((template) => ({
        ...template,
        pages: template.pages.map((page) => ({
          num: page.num,
          fields: page.fields.map((field) => ({ ...field })),
        })),
      }));
    }

    saveTemplate(): AnnotationTemplate | null {
      return null;
    }

    deleteTemplate(): void {}

    storeLastCoords(pages: readonly PageAnnotations[]): void {
      this.storeLastCoordsSpy(pages);
    }

    loadLastCoords(): PageAnnotations[] | null {
      return null;
    }

  }

  class TranslationServiceStub {
    readonly supportedLanguages: readonly Language[] = ['es-ES'];

    translate(key: string): string {
      return key;
    }

    setLanguage(): void {}

    getCurrentLanguage(): Language {
      return this.supportedLanguages[0];
    }

    language: any;
  }

  let alertSpy: jasmine.Spy<(message?: string) => void>;
  let consoleErrorSpy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        { provide: AnnotationTemplatesService, useClass: AnnotationTemplatesServiceStub },
        { provide: TranslationService, useClass: TranslationServiceStub },
      ],
    }).compileComponents();

    alertSpy = spyOn(window, 'alert').and.stub();
    consoleErrorSpy = spyOn(console, 'error').and.stub();
  });

  it('normalizes imported coordinates with inconsistent values', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    app.coordsTextModel = JSON.stringify(
      {
        pages: [
          {
            num: '2',
            fields: [
              {
                x: '10.234',
                y: '20.789',
                mapField: '  customer . address [ 0 ]  ',
                fontSize: '12.3456',
                color: '  #FF00AA  ',
                type: 'TEXT',
                value: ['   Hello   ', '', null],
              },
              {
                x: '30',
                y: 'NaN',
                mapField: '   ',
                fontSize: '-5',
                color: '',
                type: 'number',
                value: '  123.456 ',
                decimals: '2',
                appender: '  kg ',
              },
              {
                x: '50.555',
                y: '60.444',
                mapField: '',
                fontSize: '0',
                color: 'rgba(255, 128, 0, 0.5)',
                type: 'NUMBER',
                value: ' 987.654 ',
                decimals: '3.7',
                appender: '  kg ',
              },
            ],
          },
          {
            num: '1',
            fields: [
              {
                x: '5',
                y: '15',
                mapField: '   ',
                fontSize: 0,
                color: '#abc',
                type: 'radio',
                value: false,
              },
              {
                x: '15.999',
                y: '25.111',
                mapField: ['', ' order . total '],
                fontSize: '16',
                color: 'rgb(34, 51, 68)',
                type: 'NUMBER',
                value: '',
                decimals: '2',
                appender: '\tUSD ',
              },
            ],
          },
          {
            num: '0',
            fields: [
              {
                x: 1,
                y: 1,
                mapField: 'should be skipped',
              },
            ],
          },
          'not-an-object',
          null,
        ],
      },
      null,
      2
    );

    app.applyCoordsText();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(app.coords()).toEqual([
      {
        num: 1,
        fields: [
          {
            x: 5,
            y: 15,
            mapField: 'false',
            fontSize: 14,
            color: '#aabbcc',
            type: 'radio',
            value: 'false',
          },
          {
            x: 16,
            y: 25.11,
            mapField: 'order.total',
            fontSize: 16,
            color: '#223344',
            type: 'number',
            decimals: 2,
            appender: '\tUSD ',
          },
        ],
      },
      {
        num: 2,
        fields: [
          {
            x: 10.23,
            y: 20.79,
            mapField: 'customer.address[0]',
            fontSize: 12.35,
            color: '#ff00aa',
            type: 'text',
            value: 'Hello',
          },
          {
            x: 50.56,
            y: 60.44,
            mapField: '987.654',
            fontSize: 14,
            color: '#ff8000',
            type: 'number',
            value: '987.654',
            decimals: 4,
            appender: '  kg ',
          },
        ],
      },
    ]);
  });

  it('keeps the current coordinates and alerts when JSON is malformed', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const initialCoords: PageAnnotations[] = [
      {
        num: 3,
        fields: [
          {
            x: 1,
            y: 2,
            mapField: 'field',
            fontSize: 14,
            color: '#000000',
            type: 'text',
            value: 'value',
          },
        ],
      },
    ];

    app.coords.set(initialCoords);
    app.coordsTextModel = '{"pages": [invalid]';

    app.applyCoordsText();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(app.coords()).toEqual(initialCoords);
  });

  it('keeps the current coordinates and alerts when pages collection is invalid', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    const initialCoords: PageAnnotations[] = [
      {
        num: 1,
        fields: [
          {
            x: 10,
            y: 20,
            mapField: 'existing',
            fontSize: 14,
            color: '#000000',
            type: 'text',
            value: 'initial',
          },
        ],
      },
    ];

    app.coords.set(initialCoords);
    app.coordsTextModel = '{"pages": {"1": {"num": 1, "fields": []}}}';

    app.applyCoordsText();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(app.coords()).toEqual(initialCoords);
  });
});
