import { TestBed } from '@angular/core/testing';
import { PDFDocument } from 'pdf-lib';
import { PdfExportRequest, PdfExportService } from './pdf-export.service';
import { PageField } from '../models/annotation.model';

const field = (overrides: Partial<PageField> = {}): PageField => ({
  x: 50,
  y: 700,
  mapField: 'Hola mundo',
  fontSize: 14,
  color: '#000000',
  type: 'text',
  ...overrides,
});

async function blankPdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([595, 842]);
  }
  return doc.save();
}

describe('PdfExportService', () => {
  let service: PdfExportService;

  const request = (
    candidates: Uint8Array[],
    pages: PdfExportRequest['pages']
  ): PdfExportRequest => ({
    pdfByteCandidates: candidates,
    pages,
    customFonts: new Map(),
    defaultFontId: 'standard:helvetica',
    defaultOpacity: 1,
    styleField: (f) => f,
    renderText: (f) => f.mapField,
    resolveFont: () => ({ descriptor: { kind: 'standard', name: 'Helvetica' } }),
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfExportService);
  });

  it('stamps annotations and returns a valid PDF', async () => {
    const source = await blankPdf();
    const result = await service.exportAnnotatedPdf(
      request([source], [{ num: 1, fields: [field(), field({ type: 'check', mapField: '', y: 600 })] }])
    );

    expect(new TextDecoder().decode(result.bytes.slice(0, 5))).toBe('%PDF-');
    expect(result.bytes.length).toBeGreaterThan(source.length);
    expect(result.sourceBytes).toBe(source);
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
  });

  it('skips hidden fields and pages that do not exist', async () => {
    const source = await blankPdf();
    const warn = spyOn(console, 'warn');
    const result = await service.exportAnnotatedPdf(
      request(
        [source],
        [
          { num: 1, fields: [field({ hidden: true })] },
          { num: 5, fields: [field()] },
        ]
      )
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const reloaded = await PDFDocument.load(result.bytes);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('falls back to the next candidate when one cannot be loaded', async () => {
    const good = await blankPdf();
    const result = await service.exportAnnotatedPdf(
      request([new Uint8Array([1, 2, 3]), good], [{ num: 1, fields: [field()] }])
    );

    expect(result.sourceBytes).toBe(good);
  });

  it('fails when there are no usable candidates', async () => {
    await expectAsync(service.exportAnnotatedPdf(request([], []))).toBeRejected();
    await expectAsync(
      service.exportAnnotatedPdf(request([new Uint8Array([1, 2, 3])], []))
    ).toBeRejected();
  });
});
