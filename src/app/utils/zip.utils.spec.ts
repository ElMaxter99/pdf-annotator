import { crc32, createZip } from './zip.utils';

describe('zip.utils', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a zip with the expected signatures and entry count', () => {
    const zip = createZip([
      { name: 'a.json', data: new TextEncoder().encode('{"a":1}') },
      { name: 'b.json', data: new TextEncoder().encode('{}') },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
  });
});
