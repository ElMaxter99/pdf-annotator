import { TestBed } from '@angular/core/testing';
import { PageField } from '../models/annotation.model';
import { JsonShapeError } from '../utils/json-text.utils';
import {
  AnnotationImportService,
  emptyImportReport,
  hasImportIssues,
} from './annotation-import.service';

describe('AnnotationImportService', () => {
  let service: AnnotationImportService;
  const identity = (field: PageField) => field;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(AnnotationImportService);
  });

  describe('importFromText', () => {
    it('parses loose JSON and returns pages plus the report', () => {
      const { pages, report } = service.importFromText(
        "{ pages: [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a' }] }] }",
        identity,
      );
      expect(pages.length).toBe(1);
      expect(pages[0].fields.length).toBe(1);
      expect(hasImportIssues(report)).toBeFalse();
    });

    it('throws JsonShapeError when there is no pages list', () => {
      expect(() => service.importFromText('{ "foo": 1 }', identity)).toThrowError(JsonShapeError);
    });

    it('throws a parse error for broken syntax', () => {
      expect(() => service.importFromText('{ pages: [', identity)).toThrow();
    });
  });

  it('returns null when there is no pages collection', () => {
    expect(service.normalizeImportedCoordinates({ foo: 1 }, identity)).toBeNull();
    expect(service.normalizeImportedCoordinates('text', identity)).toBeNull();
  });

  it('inherits the global fontSize for fields without their own', () => {
    const result = service.normalizeImportedCoordinates(
      {
        fontSize: 11,
        pages: [
          {
            num: 1,
            fields: [
              { x: 1, y: 2, mapField: 'a' },
              { x: 1, y: 2, mapField: 'b', fontSize: 20 },
              { x: 1, y: 2, mapField: 'c', fontSize: -3 },
            ],
          },
        ],
      },
      identity
    );
    expect(result![0].fields.map((f) => f.fontSize)).toEqual([11, 20, 11]);
  });

  it('falls back to 14 without a valid global fontSize', () => {
    for (const fontSize of [undefined, 0, -5, 'x']) {
      const result = service.normalizeImportedCoordinates(
        { fontSize, pages: [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a' }] }] },
        identity
      );
      expect(result![0].fields[0].fontSize).toBe(14);
    }
  });

  it('accepts a bare array of pages', () => {
    const result = service.normalizeImportedCoordinates(
      [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a' }] }],
      identity
    );
    expect(result?.[0].fields[0].mapField).toBe('a');
  });

  it('coerces numbers and text, sorts pages and rounds coordinates', () => {
    const result = service.normalizeImportedCoordinates(
      {
        pages: [
          { num: '2', fields: [{ x: '10.456', y: '20', mapField: ' Hola \n mundo ', fontSize: '18.555', color: '#F00' }] },
          { num: 1, fields: [{ x: 1, y: 2, mapField: 'uno' }] },
        ],
      },
      identity
    );
    expect(result?.map((p) => p.num)).toEqual([1, 2]);
    const field = result![1].fields[0];
    expect(field.x).toBe(10.46);
    expect(field.mapField).toBe('Hola mundo');
    expect(field.fontSize).toBe(18.56);
    expect(field.color).toBe('#ff0000');
  });

  it('skips invalid pages and fields and falls back to defaults', () => {
    const result = service.normalizeImportedCoordinates(
      {
        pages: [
          { num: 0, fields: [{ x: 1, y: 1, mapField: 'no' }] },
          { num: 3.5, fields: [{ x: 1, y: 1, mapField: 'no' }] },
          { num: 4, fields: [] },
          { num: 5 },
          {
            num: 1,
            fields: [
              null,
              'str',
              { x: 'bad', y: 1, mapField: 'skip' },
              { x: 80, y: 550 },
              { x: 10, y: 10, mapField: 'ok', fontSize: -3, color: '  ', type: 'weird' },
              { x: 20, y: 20, type: 'check' },
            ],
          },
        ],
      },
      identity
    );
    expect(result?.length).toBe(1);
    const [ok, check] = result![0].fields;
    expect(result![0].fields.length).toBe(2);
    expect(ok.type).toBe('text');
    expect(ok.fontSize).toBe(14);
    expect(ok.color).toBe('#000000');
    expect(check.type).toBe('check');
  });

  it('keeps decimals and appender only for number fields', () => {
    const result = service.normalizeImportedCoordinates(
      [
        {
          num: 1,
          fields: [
            { x: 1, y: 1, mapField: '5', type: 'number', decimals: '2', appender: ' €' },
            { x: 2, y: 2, mapField: '5', type: 'text', decimals: 2, appender: ' €' },
          ],
        },
      ],
      identity
    );
    const [num, text] = result![0].fields;
    expect(num.decimals).toBe(2);
    expect(num.appender).toBe(' €');
    expect(text.decimals).toBeUndefined();
    expect(text.appender).toBeUndefined();
  });

  it('passes the raw style props to the field finisher', () => {
    const prepare = jasmine.createSpy('prepare').and.callFake((f: PageField) => f);
    service.normalizeImportedCoordinates(
      [{ num: 1, fields: [{ x: 1, y: 1, mapField: 'a', opacity: '0.5', backgroundColor: '#ffee00', fontFamily: 'Courier' }] }],
      prepare
    );
    const arg = prepare.calls.mostRecent().args[0] as PageField;
    expect(arg.opacity as unknown).toBe('0.5');
    expect(arg.backgroundColor).toBe('#ffee00');
    expect(arg.fontFamily).toBe('standard:courier');
  });

  it('keeps the date type and its format, and flags unusable formats', () => {
    const report = emptyImportReport();
    const result = service.normalizeImportedCoordinates(
      [
        {
          num: 1,
          fields: [
            { x: 1, y: 2, mapField: 'a', fontSize: 12, type: 'DATE', dateFormat: ' YYYY-MM-DD ' },
            { x: 1, y: 2, mapField: 'b', fontSize: 12, type: 'date', dateFormat: 'dd/mm/yyyy' },
            { x: 1, y: 2, mapField: 'c', fontSize: 12, type: 'text', dateFormat: 'YYYY' },
          ],
        },
      ],
      identity,
      report
    );
    const [a, b, c] = result![0].fields;
    expect(a.type).toBe('date');
    expect(a.dateFormat).toBe('YYYY-MM-DD');
    expect(b.dateFormat).toBeUndefined();
    expect(c.dateFormat).toBeUndefined();
    expect(report.invalidDateFormat).toBe(1);
  });

  describe('report', () => {
    it('stays empty for clean data', () => {
      const report = emptyImportReport();
      service.normalizeImportedCoordinates(
        [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a', fontSize: 12, opacity: 0.5 }] }],
        identity,
        report
      );
      expect(hasImportIssues(report)).toBeFalse();
    });

    it('counts skipped pages and fields without changing the result', () => {
      const report = emptyImportReport();
      const result = service.normalizeImportedCoordinates(
        [
          null,
          { num: 0, fields: [] },
          { num: 2 },
          {
            num: 1,
            fields: [null, 'str', { x: 'bad', y: 1, mapField: 'a' }, { x: 1, y: 2 }, { x: 5, y: 6, mapField: 'ok' }],
          },
        ],
        identity,
        report
      );
      expect(report.skippedPages).toBe(3);
      expect(report.skippedFields).toBe(4);
      expect(result?.length).toBe(1);
      expect(result![0].fields.length).toBe(1);
    });

    it('flags font sizes and opacities outside the editor limits but keeps the data', () => {
      const report = emptyImportReport();
      const result = service.normalizeImportedCoordinates(
        [
          {
            num: 1,
            fields: [
              { x: 1, y: 1, mapField: 'a', fontSize: 100, opacity: 0.05 },
              { x: 2, y: 2, mapField: 'b', fontSize: 4, opacity: 2 },
              { x: 3, y: 3, mapField: 'c', fontSize: 8, opacity: 1 },
            ],
          },
        ],
        identity,
        report
      );
      expect(report.fontSizeOutOfRange).toBe(2);
      expect(report.opacityOutOfRange).toBe(2);
      expect(result![0].fields.length).toBe(3);
      expect(result![0].fields[0].fontSize).toBe(100);
    });
  });

  it('imports locked and hidden flags (so an advanced export round-trips)', () => {
    const result = service.normalizeImportedCoordinates(
      [
        {
          num: 1,
          fields: [
            { x: 1, y: 1, mapField: 'a', locked: true, hidden: 'true' },
            { x: 2, y: 2, mapField: 'b', locked: false },
            { x: 3, y: 3, mapField: 'c', locked: 'yes', hidden: 1 },
          ],
        },
      ],
      identity
    );
    const [a, b, c] = result![0].fields;
    expect([a.locked, a.hidden]).toEqual([true, true]);
    expect([b.locked, b.hidden]).toEqual([false, false]);
    expect([c.locked, c.hidden]).toEqual([false, false]);
  });

  describe('coordenadas', () => {
    const one = (field: Record<string, unknown>) =>
      service.normalizeImportedCoordinates(
        { pages: [{ num: 1, fields: [{ mapField: 'a', ...field }] }] },
        identity,
      );

    it('acepta coordenadas negativas, cero y fuera de la página sin recortarlas', () => {
      const [f] = one({ x: -12.5, y: 0 })![0].fields;
      expect(f.x).toBe(-12.5);
      expect(f.y).toBe(0);
      const [big] = one({ x: 99999, y: 99999 })![0].fields;
      expect(big.x).toBe(99999);
    });

    it('redondea a dos decimales y acepta cadenas con espacios', () => {
      const [f] = one({ x: ' 10.005 ', y: '20.999' })![0].fields;
      expect(f.x).toBe(10.01);
      expect(f.y).toBe(21);
    });

    it('descarta NaN, Infinity, nulos, vacíos y valores no numéricos', () => {
      const report = { skippedPages: 0, skippedFields: 0, fontSizeOutOfRange: 0, opacityOutOfRange: 0, invalidDateFormat: 0 };
      const result = service.normalizeImportedCoordinates(
        {
          pages: [
            {
              num: 1,
              fields: [
                { x: NaN, y: 1, mapField: 'a' },
                { x: Infinity, y: 1, mapField: 'a' },
                { x: null, y: 1, mapField: 'a' },
                { x: '', y: 1, mapField: 'a' },
                { x: true, y: 1, mapField: 'a' },
                { x: [1], y: 1, mapField: 'a' },
                { y: 1, mapField: 'a' },
                { x: 1, mapField: 'a' },
              ],
            },
          ],
        },
        identity,
        report,
      );
      expect(result).toEqual([]);
      expect(report.skippedFields).toBe(8);
    });

    it('el número de página debe ser un entero ≥ 1 (admite cadenas)', () => {
      const result = service.normalizeImportedCoordinates(
        {
          pages: [
            { num: '3', fields: [{ x: 1, y: 1, mapField: 'a' }] },
            { num: -1, fields: [{ x: 1, y: 1, mapField: 'a' }] },
            { num: 'x', fields: [{ x: 1, y: 1, mapField: 'a' }] },
            { fields: [{ x: 1, y: 1, mapField: 'a' }] },
          ],
        },
        identity,
      );
      expect(result?.map((p) => p.num)).toEqual([3]);
    });

    it('un campo sin texto solo se conserva si es check o radio', () => {
      const result = service.normalizeImportedCoordinates(
        {
          pages: [
            {
              num: 1,
              fields: [
                { x: 1, y: 1 },
                { x: 2, y: 2, type: 'radio' },
                { x: 3, y: 3, type: 'check' },
                { x: 4, y: 4, type: 'number' },
              ],
            },
          ],
        },
        identity,
      );
      expect(result![0].fields.map((f) => f.type)).toEqual(['radio', 'check']);
    });

    it('un fontSize inválido usa el global y uno fuera de rango se avisa pero se conserva', () => {
      const report = { skippedPages: 0, skippedFields: 0, fontSizeOutOfRange: 0, opacityOutOfRange: 0, invalidDateFormat: 0 };
      const result = service.normalizeImportedCoordinates(
        {
          fontSize: 20,
          pages: [
            {
              num: 1,
              fields: [
                { x: 1, y: 1, mapField: 'a', fontSize: 'grande' },
                { x: 2, y: 2, mapField: 'b', fontSize: 100 },
                { x: 3, y: 3, mapField: 'c', fontSize: 5 },
              ],
            },
          ],
        },
        identity,
        report,
      );
      expect(result![0].fields.map((f) => f.fontSize)).toEqual([20, 100, 5]);
      expect(report.fontSizeOutOfRange).toBe(2);
    });

    it('las páginas repetidas se conservan por separado y quedan ordenadas', () => {
      const result = service.normalizeImportedCoordinates(
        {
          pages: [
            { num: 2, fields: [{ x: 1, y: 1, mapField: 'a' }] },
            { num: 2, fields: [{ x: 2, y: 2, mapField: 'b' }] },
            { num: 1, fields: [{ x: 3, y: 3, mapField: 'c' }] },
          ],
        },
        identity,
      );
      expect(result?.map((p) => p.num)).toEqual([1, 2, 2]);
    });

    it('datos que no son ni objeto ni lista devuelven null', () => {
      for (const data of [null, undefined, 5, 'texto', true, { pages: 'x' }]) {
        expect(service.normalizeImportedCoordinates(data, identity)).toBeNull();
      }
    });
  });
});
