import type { ProjectLimits, ProjectSummary } from '../models/project.model';

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
