import type { ProjectExportInfo, ProjectLimits, ProjectSummary } from '../models/project.model';

/** «1,3 GB», «840 MB», «12 KB». */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(rounded).replace('.', ',')} ${units[unit]}`;
}

/** `warn` from 100 PDFs or 1 GB, `full` at 200 PDFs or 2 GB (nothing more can be added). */
export function projectSize(
  project: Pick<ProjectSummary, 'pdfs' | 'bytes'>,
  limits: ProjectLimits,
): 'ok' | 'warn' | 'full' {
  if (project.pdfs >= limits.maxPdfs || project.bytes >= limits.maxBytes) {
    return 'full';
  }
  return project.pdfs >= limits.warnPdfs || project.bytes >= limits.warnBytes ? 'warn' : 'ok';
}

/** Peso estimado del archivo `.pdfannotator`: PDFs de A, PDFs de B (si se llevan) y los datos del lote. */
export function exportEstimate(
  info: Pick<ProjectExportInfo, 'bytesA' | 'bytesB' | 'bytesMeta'>,
  includeB: boolean,
): number {
  return info.bytesA + info.bytesMeta + (includeB ? info.bytesB : 0);
}

/** Porcentaje entero 0–100 de un avance `done` de `total` (0 si aún no hay total). */
export function percentOf(done: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((100 * done) / total))) : 0;
}

/** Nombre de carpeta sin el prefijo de los nombres reservados (solo quita lo que Windows rechaza). */
export function cleanFolderName(name: string): string {
  const part = name
    .replace(/[\\/]+/g, ' ')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 80);
  return part === '.' || part === '..' ? '' : part;
}

/** Misma regla que `safeSegments` del proceso principal: lo que quedaría como nombre de carpeta (vista previa). */
export function folderSlug(name: string): string {
  const part = cleanFolderName(name);
  return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(part) ? `_${part}` : part;
}

/** Ruta nueva al renombrar la carpeta: solo cambia el último tramo, la subcarpeta se conserva. */
export function renamedRef(ref: string, name: string): string {
  const slug = folderSlug(name);
  return slug ? [...ref.split('/').slice(0, -1), slug].join('/') : '';
}
