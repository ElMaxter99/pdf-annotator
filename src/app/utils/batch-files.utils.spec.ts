import { baseName, formatBytes, groupBatchFiles, pairTemplates, pairingKey } from './batch-files.utils';

describe('batch file utils', () => {
  it('strips folders and extension', () => {
    expect(baseName('a/b/albaran-0331.pdf')).toBe('albaran-0331');
    expect(baseName('.hidden')).toBe('.hidden');
    expect(pairingKey(' Albaran-0331.JSON ')).toBe('albaran-0331');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1.2 * 1024 * 1024)).toBe('1.2 MB');
    expect(formatBytes(31 * 1024 * 1024)).toBe('31 MB');
  });

  it('groups files by kind', () => {
    const files = [{ name: 'a.pdf' }, { name: 'a.json' }, { name: 'a.txt' }];
    const groups = groupBatchFiles(files, (f) => f.name.endsWith('.pdf'));
    expect(groups.pdfs.length).toBe(1);
    expect(groups.jsons.length).toBe(1);
    expect(groups.others.length).toBe(1);
  });

  it('pairs templates by base name and returns the unmatched ones', () => {
    const pdfs = [{ name: 'a.pdf' }, { name: 'b.pdf' }];
    const jsons = [{ name: 'A.json' }, { name: 'z.json' }];
    const { pairs, unmatched } = pairTemplates(pdfs, jsons);
    expect(pairs.map((p) => p.pdf.name)).toEqual(['a.pdf']);
    expect(unmatched.map((j) => j.name)).toEqual(['z.json']);
  });
});
