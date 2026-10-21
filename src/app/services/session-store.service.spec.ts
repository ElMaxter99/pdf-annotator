import { MAX_SESSION_PDF_BYTES, SavedSession, SessionStoreService } from './session-store.service';

describe('SessionStoreService', () => {
  const service = new SessionStoreService();

  const session = (overrides: Partial<SavedSession> = {}): SavedSession => ({
    name: 'doc.pdf',
    pdf: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
    coords: [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a', fontSize: 12, color: '#000000', type: 'text' }] }],
    pageIndex: 2,
    scale: 1.25,
    savedAt: 1_700_000_000_000,
    ...overrides,
  });

  beforeEach(async () => service.clear());
  afterAll(async () => service.clear());

  it('returns nothing when no session was saved', async () => {
    expect(await service.load()).toBeNull();
    expect(await service.summary()).toBeNull();
  });

  it('saves and restores a session', async () => {
    expect(await service.save(session())).toBeTrue();
    const loaded = await service.load();
    expect(loaded?.name).toBe('doc.pdf');
    expect(loaded?.pageIndex).toBe(2);
    expect(loaded?.scale).toBe(1.25);
    expect(loaded?.coords[0].fields[0].mapField).toBe('a');
    expect(await loaded?.pdf.text()).toBe('%PDF-1.4');
  });

  it('summarises name, annotation count and date', async () => {
    await service.save(session());
    expect(await service.summary()).toEqual({
      name: 'doc.pdf',
      annotationCount: 1,
      savedAt: 1_700_000_000_000,
    });
  });

  it('overwrites the previous session and can clear it', async () => {
    await service.save(session({ name: 'uno.pdf' }));
    await service.save(session({ name: 'dos.pdf' }));
    expect((await service.load())?.name).toBe('dos.pdf');
    await service.clear();
    expect(await service.load()).toBeNull();
  });

  it('does not store PDFs above the size limit', async () => {
    const big = { size: MAX_SESSION_PDF_BYTES + 1 } as Blob;
    expect(await service.save(session({ pdf: big }))).toBeFalse();
    expect(await service.load()).toBeNull();
  });
});
