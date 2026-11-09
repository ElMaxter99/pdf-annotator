/** File name without folders or extension. */
export function baseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function isJsonFile(file: { readonly name: string; readonly type?: string }): boolean {
  return file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';
}

/** Normalised key used to pair `albaran-0331.pdf` with `albaran-0331.json`. */
export function pairingKey(fileName: string): string {
  return baseName(fileName).trim().toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export interface BatchFileGroups<T extends { readonly name: string }> {
  readonly pdfs: T[];
  readonly jsons: T[];
  readonly others: T[];
}

export function groupBatchFiles<T extends { readonly name: string; readonly type?: string }>(
  files: readonly T[],
  isPdf: (file: T) => boolean
): BatchFileGroups<T> {
  const groups: BatchFileGroups<T> = { pdfs: [], jsons: [], others: [] };
  for (const file of files) {
    if (isPdf(file)) groups.pdfs.push(file);
    else if (isJsonFile(file)) groups.jsons.push(file);
    else groups.others.push(file);
  }
  return groups;
}

/** Pairs each JSON with the PDF that has the same base name. Unmatched JSON are returned apart. */
export function pairTemplates<P extends { readonly name: string }, J extends { readonly name: string }>(
  pdfs: readonly P[],
  jsons: readonly J[]
): { readonly pairs: { pdf: P; json: J }[]; readonly unmatched: J[] } {
  const byKey = new Map<string, P>();
  for (const pdf of pdfs) {
    byKey.set(pairingKey(pdf.name), pdf);
  }
  const pairs: { pdf: P; json: J }[] = [];
  const unmatched: J[] = [];
  const used = new Set<string>();
  for (const json of jsons) {
    const key = pairingKey(json.name);
    const pdf = byKey.get(key);
    if (pdf && !used.has(key)) {
      pairs.push({ pdf, json });
      used.add(key);
    } else {
      unmatched.push(json);
    }
  }
  return { pairs, unmatched };
}
