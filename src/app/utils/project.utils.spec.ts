import { DEFAULT_LIMITS } from '../services/project-store.service';
import {
  exportEstimate,
  folderSlug,
  formatBytes,
  percentOf,
  projectSize,
  renamedRef,
} from './project.utils';

describe('project.utils', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(12 * 1024)).toBe('12 KB');
    expect(formatBytes(840 * 1024 * 1024)).toBe('840 MB');
    expect(formatBytes(1.3 * 1024 * 1024 * 1024)).toBe('1,3 GB');
  });

  it('warns from 100 PDFs or 1 GB and blocks at 200 PDFs or 2 GB', () => {
    const gb = 1024 * 1024 * 1024;
    expect(projectSize({ pdfs: 20, bytes: 10 }, DEFAULT_LIMITS)).toBe('ok');
    expect(projectSize({ pdfs: 100, bytes: 10 }, DEFAULT_LIMITS)).toBe('warn');
    expect(projectSize({ pdfs: 5, bytes: gb }, DEFAULT_LIMITS)).toBe('warn');
    expect(projectSize({ pdfs: 200, bytes: 10 }, DEFAULT_LIMITS)).toBe('full');
    expect(projectSize({ pdfs: 5, bytes: 2 * gb }, DEFAULT_LIMITS)).toBe('full');
  });

  it('estimates the exported file with or without the new versions (B)', () => {
    const info = { bytesA: 100, bytesB: 40, bytesMeta: 5 };
    expect(exportEstimate(info, true)).toBe(145);
    expect(exportEstimate(info, false)).toBe(105);
  });

  it('turns progress into a clamped whole percentage', () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(26, 34)).toBe(76);
    expect(percentOf(5, 3)).toBe(100);
    expect(percentOf(-1, 10)).toBe(0);
  });

  it('computes the folder name like the main process does', () => {
    expect(folderSlug('Cliente 2 · Facturas')).toBe('Cliente 2 · Facturas');
    expect(folderSlug('a:b/c?')).toBe('ab c');
    expect(folderSlug('CON')).toBe('_CON');
    expect(folderSlug('nul.txt')).toBe('_nul.txt');
    expect(folderSlug('  ...  ')).toBe('');
    expect(folderSlug('x'.repeat(100)).length).toBe(80);
  });

  it('renames only the last segment of the path', () => {
    expect(renamedRef('Álvaro/cliente2', 'Facturas 2027')).toBe('Álvaro/Facturas 2027');
    expect(renamedRef('cliente2', 'Facturas')).toBe('Facturas');
    expect(renamedRef('Álvaro/cliente2', '???')).toBe('');
  });
});
