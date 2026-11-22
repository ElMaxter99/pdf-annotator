// «Almacenamiento» (1.18 · S1, mesas P-125 y P-126): qué guarda la app de escritorio, dónde y cuánto ocupa.
// Lista cerrada de rutas decidida aquí, en el proceso principal: la web solo manda el identificador de una fila
// (`storage:size`, `storage:clear`, `storage:reveal`), nunca una ruta. Solo se vacían las cachés.
import { lstat, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Tiempo máximo para medir una carpeta: una enorme no bloquea el panel (se da el tamaño parcial). */
export const SIZE_BUDGET_MS = 8000;
/** Un temporal de la IA más reciente que esto puede ser de una petición en curso: no se borra. */
export const AI_TEMP_MIN_AGE_MS = 10 * 60 * 1000;
export const AI_TEMP_PREFIX = 'pdfann-ia-';

export const GROUPS = ['work', 'app', 'clearable'];

/** Carpeta de las descargas de actualizaciones (`<caché>/<updaterCacheDirName>`), o null si no se sabe el nombre. */
export const updatesDir = (cacheBase, dirName) => (dirName ? path.join(cacheBase, dirName) : null);

/** Ruta con la carpeta personal abreviada («~/…»), para enseñarla sin ruido. */
export function displayPath(p, home = os.homedir()) {
  if (!p) return '';
  const norm = path.normalize(p);
  const h = path.normalize(home);
  if (norm === h) return '~';
  return norm.startsWith(h + path.sep) ? `~${path.sep}${norm.slice(h.length + 1)}` : norm;
}

/**
 * Filas del panel. Cada una: `id`, `group` (`work` | `app` | `clearable`), `paths` (lo que se mide y, si
 * `clearable`, lo que se vacía), `open` (carpeta que abre «Abrir carpeta») y `clear` (`'electron'` = con las funciones
 * de Electron, `'files'` = borrando el contenido, `null` = no se vacía).
 */
export function storageEntries(ctx) {
  const { userData, projectsRoot, installDir, updatesDir: updates, tmpdir } = ctx;
  const u = (...names) => names.map((n) => path.join(userData, n));
  return [
    { id: 'projects', group: 'work', paths: projectsRoot ? [projectsRoot] : [], open: projectsRoot, clear: null },
    { id: 'editor-data', group: 'work', paths: u('IndexedDB', 'Local Storage'), open: userData, clear: null },
    { id: 'program', group: 'app', paths: installDir ? [installDir] : [], open: installDir, clear: null },
    {
      id: 'settings',
      group: 'app',
      paths: u('update-channel.json', 'projects-root.json', 'projects-sync.json', 'projects-sync-secret.bin', 'last-run-version', 'just-updated.json'),
      open: userData,
      clear: null,
    },
    { id: 'browser-cache', group: 'clearable', paths: u('Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'), open: userData, clear: 'electron' },
    { id: 'update-downloads', group: 'clearable', paths: updates ? [updates] : [], open: updates, clear: 'files' },
    { id: 'ai-temp', group: 'clearable', paths: [], open: tmpdir, clear: 'ai-temp' },
    { id: 'update-log', group: 'clearable', paths: u('update.log'), open: userData, clear: 'files' },
  ];
}

/** Tamaño en bytes de un archivo o carpeta (sin seguir enlaces). `{ bytes, partial }`; `partial` si se agotó el tiempo. */
export async function pathSize(target, { deadline = Date.now() + SIZE_BUDGET_MS } = {}) {
  let bytes = 0;
  let partial = false;
  const walk = async (p) => {
    if (Date.now() > deadline) {
      partial = true;
      return;
    }
    let st;
    try {
      st = await lstat(p);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) return;
    if (!st.isDirectory()) {
      bytes += st.size;
      return;
    }
    let names;
    try {
      names = await readdir(p);
    } catch {
      return;
    }
    for (const n of names) {
      if (partial) return;
      await walk(path.join(p, n));
    }
  };
  await walk(target);
  return { bytes, partial };
}

/** Temporales de la IA de esta máquina: carpetas `pdfann-ia-*` de la carpeta temporal (solo esas, nunca otras). */
export async function aiTempDirs(tmpdir, now = Date.now()) {
  let names;
  try {
    names = await readdir(tmpdir);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!n.startsWith(AI_TEMP_PREFIX) || n.includes(path.sep) || n.includes('/')) continue;
    const p = path.join(tmpdir, n);
    try {
      const st = await stat(p);
      if (st.isDirectory()) out.push({ path: p, old: now - st.mtimeMs >= AI_TEMP_MIN_AGE_MS });
    } catch {
      /* desapareció */
    }
  }
  return out;
}

/** Vacía el contenido de una carpeta (o borra un archivo) sin salirse de `base` ni seguir enlaces. Devuelve los bytes liberados. */
export async function emptyPath(target, base) {
  const norm = path.resolve(target);
  const root = path.resolve(base);
  if (norm !== root && !norm.startsWith(root + path.sep)) throw new Error('fuera de la lista');
  const before = (await pathSize(norm, { deadline: Date.now() + SIZE_BUDGET_MS * 4 })).bytes;
  let st;
  try {
    st = await lstat(norm);
  } catch {
    return 0;
  }
  if (st.isDirectory() && !st.isSymbolicLink()) {
    for (const n of await readdir(norm)) await rm(path.join(norm, n), { recursive: true, force: true });
  } else {
    await rm(norm, { force: true });
  }
  return before;
}

/**
 * Crea el servicio de almacenamiento. `deps`: `getContext()` (rutas de ahora), `clearElectronCache()` (async, funciones de
 * Electron), `openPath(p)` (`shell.openPath`), `exists(p)`.
 */
export function createStorage(deps) {
  const ctx = () => deps.getContext();
  const find = (id) => storageEntries(ctx()).find((e) => e.id === id);

  return {
    /** Lista de filas con su ruta para enseñar; sin tamaños (se piden uno a uno). */
    list() {
      const c = ctx();
      const home = c.home ?? os.homedir();
      return {
        entries: storageEntries(c).map((e) => {
          const shown = e.id === 'ai-temp' ? path.join(c.tmpdir, `${AI_TEMP_PREFIX}*`) : e.id === 'browser-cache' ? path.join(c.userData, 'Cache') : e.id === 'editor-data' ? path.join(c.userData, 'IndexedDB') : e.id === 'settings' ? c.userData : e.paths[0] ?? e.open ?? '';
          return {
            id: e.id,
            group: e.group,
            path: displayPath(shown, home),
            clearable: e.clear !== null,
            canOpen: Boolean(e.open),
          };
        }),
      };
    },
    /** `{ bytes, partial, exists }` de una fila. */
    async size(id) {
      const e = find(id);
      if (!e) return null;
      const deadline = Date.now() + SIZE_BUDGET_MS;
      let bytes = 0;
      let partial = false;
      let exists = false;
      if (e.id === 'ai-temp') {
        for (const d of await aiTempDirs(ctx().tmpdir)) {
          exists = true;
          const r = await pathSize(d.path, { deadline });
          bytes += r.bytes;
          partial ||= r.partial;
        }
      } else {
        for (const p of e.paths) {
          if (!(await deps.exists(p))) continue;
          exists = true;
          const r = await pathSize(p, { deadline });
          bytes += r.bytes;
          partial ||= r.partial;
        }
      }
      return { bytes, partial, exists };
    },
    /** Vacía una fila vaciable. Devuelve `{ freed }` o lanza si no se puede. */
    async clear(id) {
      const e = find(id);
      if (!e || e.clear === null) throw new Error('no se vacía');
      const c = ctx();
      if (e.clear === 'electron') {
        const before = (await this.size(id))?.bytes ?? 0;
        await deps.clearElectronCache();
        const after = (await this.size(id))?.bytes ?? 0;
        return { freed: Math.max(0, before - after) };
      }
      if (e.clear === 'ai-temp') {
        let freed = 0;
        for (const d of await aiTempDirs(c.tmpdir)) {
          if (!d.old) continue;
          freed += (await pathSize(d.path)).bytes;
          await rm(d.path, { recursive: true, force: true });
        }
        return { freed };
      }
      let freed = 0;
      for (const p of e.paths) {
        if (await deps.exists(p)) freed += await emptyPath(p, e.id === 'update-downloads' ? p : c.userData);
      }
      return { freed };
    },
    /** Abre la carpeta de una fila en el explorador. Devuelve '' si fue bien o el motivo si no. */
    async reveal(id) {
      const e = find(id);
      if (!e?.open) return 'unknown';
      if (!(await deps.exists(e.open))) return 'missing';
      return (await deps.openPath(e.open)) || '';
    },
  };
}
