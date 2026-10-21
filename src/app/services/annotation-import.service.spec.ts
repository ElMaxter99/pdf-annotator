import { TestBed } from '@angular/core/testing';
import { PageField } from '../models/annotation.model';
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

  it('returns null when there is no pages collection', () => {
    expect(service.normalizeImportedCoordinates({ foo: 1 }, identity)).toBeNull();
    expect(service.normalizeImportedCoordinates('text', identity)).toBeNull();
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
});
