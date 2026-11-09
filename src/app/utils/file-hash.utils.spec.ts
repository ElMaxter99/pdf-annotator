import { hashBlob } from './file-hash.utils';

describe('hashBlob', () => {
  it('gives the same fingerprint to identical content and another to different content', async () => {
    const a = await hashBlob(new Blob(['hola']));
    const b = await hashBlob(new Blob(['hola']));
    const c = await hashBlob(new Blob(['hola!']));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
