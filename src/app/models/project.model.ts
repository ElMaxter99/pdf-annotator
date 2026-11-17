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
  | 'too-big';

export interface ProjectStoredItem {
  readonly id: string;
  readonly meta: unknown;
  readonly a: Uint8Array;
  readonly b: Uint8Array | null;
}

export type ProjectFailure = { readonly error: ProjectErrorCode };

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
    | { project: ProjectSummary; readOnly: boolean; items: ProjectStoredItem[] }
    | { locked: ProjectLockInfo }
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
}

export interface ActiveProject {
  readonly ref: string;
  readonly name: string;
  readonly readOnly: boolean;
}
