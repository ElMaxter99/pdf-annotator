import { AnnotationTemplate } from '../annotation-templates.service';
import { ZipEntry } from './zip.utils';

const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Safe base file name (no extension) for a template name. */
export function templateFileBase(name: string): string {
  const cleaned = name.replace(INVALID_CHARS, '-').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return cleaned.slice(0, 80).trim() || 'plantilla';
}

/** Unique `.json` names for the given templates: repeats become `name-2.json`, `name-3.json`… */
export function templateFileNames(templates: readonly { name: string }[]): string[] {
  const used = new Map<string, number>();
  return templates.map((template) => {
    const base = templateFileBase(template.name);
    const key = base.toLocaleLowerCase();
    const count = (used.get(key) ?? 0) + 1;
    used.set(key, count);
    return count === 1 ? `${base}.json` : `${base}-${count}.json`;
  });
}

/** One ZIP entry for a template; same JSON shape as «Descargar JSON». */
export function templateZipEntry(
  template: Pick<AnnotationTemplate, 'pages'>,
  fileName: string,
): ZipEntry {
  return {
    name: fileName,
    data: new TextEncoder().encode(JSON.stringify({ pages: template.pages }, null, 2)),
  };
}
