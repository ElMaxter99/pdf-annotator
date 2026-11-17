/** Proyectos locales de la app de escritorio: un cliente o trabajo = una carpeta visible en el disco con su lote. */

export interface ProjectLockInfo {
  readonly state: 'free' | 'mine' | 'other';
  /** Equipo que lo tiene abierto (solo con `state: 'other'` o `'mine'`). */
  readonly host?: string;
  readonly since?: number;
  /** Última señal del equipo que lo tiene abierto (ms desde 1970). */
  readonly seen?: number;
  /** Bloqueo caducado que se ha dejado atrás. */
  readonly stale?: { readonly host: string; readonly seen: number };
}

export interface ProjectSummary {
  /** Ruta relativa a la carpeta de proyectos, con «/» (p. ej. `Álvaro/cliente1`). */
  readonly ref: string;
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly pdfs: number;
  readonly bytes: number;
  /** PDFs del lote marcados como listos. */
  readonly done: number;
  readonly lock: ProjectLockInfo;
}

export interface ProjectLimits {
  readonly maxPdfs: number;
  readonly maxBytes: number;
  readonly warnPdfs: number;
  readonly warnBytes: number;
  readonly maxPdfBytes: number;
}

export type ProjectErrorCode =
  | 'root-missing'
  | 'denied'
  | 'io'
  | 'exists'
  | 'bad-name'
  | 'bad-ref'
  | 'bad-item'
  | 'not-a-project'
  | 'not-held'
  | 'pdf-too-big'
  | 'too-many-pdfs'
  | 'too-big'
  | 'empty'
  | 'busy'
  | 'not-an-archive'
  | 'corrupt'
  | 'unsafe'
  | 'newer-format'
  | 'in-use'
  | 'disk-full'
  | 'folder-missing'
  | 'folder-readonly'
  | 'folder-overlaps'
  | 'remote-incomplete'
  | 'cloud-pending'
  | 'ref-taken'
  | 'in-use-local'
  | 'not-linked'
  | 'not-synced'
  | 'bad-action';

export interface ProjectStoredItem {
  readonly id: string;
  readonly meta: unknown;
  readonly a: Uint8Array;
  readonly b: Uint8Array | null;
}

export type ProjectFailure = { readonly error: ProjectErrorCode; readonly detail?: unknown };

/** Lo que se llevaría un archivo exportado (para el diálogo de exportar). */
export interface ProjectExportInfo {
  readonly name: string;
  readonly lock: ProjectLockInfo;
  readonly pdfsA: number;
  readonly pdfsB: number;
  readonly bytesA: number;
  readonly bytesB: number;
  readonly bytesMeta: number;
}

/** PDF de un archivo importado que pesa más que el máximo por PDF. */
export interface ArchiveOversize {
  readonly id: string;
  readonly name: string;
  readonly which: 'a' | 'b';
  readonly bytes: number;
}

/** Resumen de un archivo `.pdfannotator` ya revisado entero por el proceso principal. */
export interface ArchiveInfo {
  readonly formatVersion: number;
  readonly appVersion: string;
  readonly exportedAt: number;
  readonly name: string;
  /** Subcarpeta sugerida (relativa a la carpeta de proyectos). */
  readonly ref: string;
  readonly createdAt: number;
  readonly pdfsA: number;
  readonly pdfsB: number;
  readonly bytes: number;
  readonly oversize: ArchiveOversize[];
}

/** Proyecto que ya existe con el mismo nombre/carpeta, y lo que se perdería al reemplazarlo. */
export interface ProjectConflict extends ProjectSummary {
  readonly onlyHere: number;
  readonly changedAfter: number;
}

export interface ProjectProgress {
  readonly op: 'export' | 'inspect' | 'import' | 'sync';
  readonly done: number;
  readonly total: number;
  /** Solo con `op: 'sync'` en una sincronización de varios proyectos: el que se está haciendo. */
  readonly name?: string;
}

/** Estado de sincronización de un proyecto con la carpeta enlazada (fase 3). */
export type SyncState = 'none' | 'sync' | 'pend' | 'pull' | 'other' | 'conflict' | 'off' | 'paused';

export interface SyncStatus {
  readonly state: SyncState;
  readonly rev?: number;
  readonly lastSync?: number;
  /** Archivos de la carpeta que no son del proyecto (copias en conflicto del servicio de sincronización). */
  readonly duplicates?: string[];
  readonly holder?: ProjectLockInfo;
  readonly kind?: 'both' | 'ref-taken';
  readonly remoteRev?: number;
  readonly by?: string;
  readonly at?: number;
  readonly busy?: boolean;
}

/** Proyecto que está en la carpeta enlazada y todavía no en este equipo. */
export interface SyncAvailable {
  readonly ref: string;
  readonly id: string;
  readonly name: string;
  readonly rev: number;
  readonly by: string;
  readonly at: number;
  readonly pdfs: number;
  readonly bytes: number;
}

export type SyncInfo =
  | { readonly linked: false }
  | {
      readonly linked: true;
      readonly folder: string;
      readonly reachable: boolean;
      readonly statuses: Record<string, SyncStatus>;
      readonly available: SyncAvailable[];
    };

export interface SyncPicked {
  readonly folder: string;
  readonly free: number | null;
  readonly local: number;
  readonly remote: number;
  readonly bytes: number;
}

export interface SyncConflictInfo {
  readonly kind: 'both' | 'ref-taken';
  readonly remoteRev: number;
  readonly by: string;
  readonly at: number;
  readonly mine: number;
  readonly theirs: number;
  readonly both: number;
}

export type SyncResolution = 'mine' | 'theirs' | 'later';
export type SyncPlan = 'both' | 'down' | 'manual' | 'sync';

export type SyncResult =
  | { action: 'push' | 'pull' | 'none' | 'later'; rev?: number; copy?: string }
  | { conflict: SyncConflictInfo };

export interface SyncAllResult {
  readonly synced: number;
  readonly failed: { ref: string; error: ProjectErrorCode; detail?: unknown }[];
  readonly conflicts: string[];
}

export interface SyncEvent {
  readonly ref: string;
  readonly state: 'done' | 'error';
  readonly error?: ProjectErrorCode;
  readonly detail?: unknown;
}

export type ImportMode = 'copy' | 'replace';

/** Puente de `desktop/preload.cjs` → `desktop/projects-ipc.mjs`. Todo devuelve `{ error }` en vez de lanzar. */
export interface ProjectsBridge {
  info(): Promise<{ root: string; host: string; limits: ProjectLimits }>;
  chooseRoot(): Promise<{ root: string } | { canceled: true } | ProjectFailure>;
  list(): Promise<{ projects: ProjectSummary[] } | ProjectFailure>;
  create(input: {
    name: string;
    subpath: string;
  }): Promise<{ project: ProjectSummary } | ProjectFailure>;
  open(input: {
    ref: string;
    force?: boolean;
    readOnly?: boolean;
  }): Promise<
    | { project: ProjectSummary; readOnly: boolean; offline?: boolean; items: ProjectStoredItem[] }
    | { locked: ProjectLockInfo; remote?: boolean }
    | ProjectFailure
  >;
  saveItem(input: {
    ref: string;
    id: string;
    meta: unknown;
    a?: Uint8Array;
    b?: Uint8Array | null;
  }): Promise<{ ok: true } | ProjectFailure>;
  removeItem(input: { ref: string; id: string }): Promise<{ ok: true } | ProjectFailure>;
  renew(input: { ref: string }): Promise<{ ok: boolean } | ProjectFailure>;
  release(input: { ref: string }): Promise<{ ok: true } | ProjectFailure>;
  rename(input: { ref: string; name: string }): Promise<{ ok: true } | ProjectFailure>;
  forget(input: { ref: string }): Promise<{ ok: true } | ProjectFailure>;
  exportInfo(input: { ref: string }): Promise<ProjectExportInfo | ProjectFailure>;
  exportProject(input: {
    ref: string;
    includeB: boolean;
  }): Promise<
    | { name: string; path: string; bytes: number; pdfs: number }
    | { canceled: true }
    | ProjectFailure
  >;
  reveal(): Promise<{ ok: true } | ProjectFailure>;
  importInspect(input: {
    path?: string;
  }): Promise<
    { file: string; fileName: string; info: ArchiveInfo } | { canceled: true } | ProjectFailure
  >;
  importRun(input: {
    name: string;
    subpath: string;
    mode?: ImportMode;
    skipOversize?: boolean;
  }): Promise<
    | { project: ProjectSummary; skipped: ArchiveOversize[]; backup: string | null }
    | { conflict: ProjectConflict }
    | { canceled: true }
    | ProjectFailure
  >;
  cancel(): Promise<{ ok: true }>;
  /** Ruta de un archivo soltado en la ventana (solo escritorio). */
  pathForFile(file: File): string;
  onProgress(callback: (progress: ProjectProgress) => void): () => void;
  // Carpeta enlazada (fase 3)
  syncStatus(): Promise<SyncInfo | ProjectFailure>;
  syncChoose(): Promise<SyncPicked | { canceled: true } | ProjectFailure>;
  syncLink(input: { accepted: boolean }): Promise<{ folder: string } | ProjectFailure>;
  syncUnlink(): Promise<{ ok: true } | ProjectFailure>;
  syncAll(input: { mode: SyncPlan }): Promise<SyncAllResult | { canceled: true } | ProjectFailure>;
  syncProject(input: {
    ref: string;
    action: 'sync' | 'pause' | 'resume' | 'stop';
    resolution?: SyncResolution;
  }): Promise<SyncResult | { ok: true } | { canceled: true } | ProjectFailure>;
  syncReveal(input: { ref: string }): Promise<{ ok: true } | ProjectFailure>;
  onSyncEvent(callback: (event: SyncEvent) => void): () => void;
}

export interface ActiveProject {
  readonly ref: string;
  readonly name: string;
  readonly readOnly: boolean;
}
