// Puente IPC de los proyectos locales: valida todo lo que llega de la web y delega en `projects.mjs`.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARCHIVE_EXT,
  exportInfo,
  exportProject,
  importArchive,
  inspectArchive,
  isArchiveFile,
  replaceImpact,
} from './project-archive.mjs';
import {
  LIMITS,
  ProjectError,
  acquireLock,
  createProject,
  forgetProject,
  listProjects,
  lockState,
  readItems,
  releaseLock,
  removeItem,
  renameProject,
  renewLock,
  resolveRef,
  safeSegments,
  summarize,
  writeItem,
} from './projects.mjs';

export function setupProjectsIpc({ handle, app, dialog, shell, getWindow }) {
  const settingsFile = path.join(app.getPath('userData'), 'projects-root.json');
  /** Identifica esta ejecución de la app: dos ventanas o equipos nunca comparten el token. */
  const token = randomUUID();
  const host = os.hostname();
  /** Proyectos que esta ejecución tiene bloqueados (se liberan al salir). */
  const held = new Set();

  const defaultRoot = () => path.join(app.getPath('documents'), 'PDF Annotator');
  const loadRoot = () => {
    try {
      const saved = JSON.parse(readFileSync(settingsFile, 'utf8')).root;
      if (typeof saved === 'string' && path.isAbsolute(saved)) return saved;
    } catch {
      /* usa la carpeta por defecto */
    }
    return defaultRoot();
  };
  let root = loadRoot();
  const ensureRoot = () => {
    if (!existsSync(root) && root === defaultRoot()) mkdirSync(root, { recursive: true });
  };
  const guarded =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (error instanceof ProjectError) {
          if (error.code === 'canceled') return { canceled: true };
          return error.detail === undefined
            ? { error: error.code }
            : { error: error.code, detail: error.detail };
        }
        if (error?.code === 'ENOSPC') return { error: 'disk-full' };
        return { error: error?.code === 'EACCES' || error?.code === 'EPERM' ? 'denied' : 'io' };
      }
    };
  const asText = (value, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '');
  const bytesOf = (value) =>
    value instanceof Uint8Array || value instanceof ArrayBuffer
      ? Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value)
      : undefined;

  /** Escribir exige seguir teniendo el bloqueo: si otro equipo lo tomó, se suelta y se avisa (`not-held`). */
  const assertHeld = (ref, dir) => {
    if (!held.has(ref) || lockState(dir, token).state !== 'mine') {
      held.delete(ref);
      throw new ProjectError('not-held');
    }
  };

  // Exportar e importar: una sola operación a la vez; se puede cancelar y informa del progreso.
  let running = null;
  /** Último archivo revisado en el diálogo de importar: «Importar» actúa sobre él, no sobre una ruta de la web. */
  let inspected = null;
  /** Último archivo exportado: la única ruta que la web puede pedir que se muestre en la carpeta. */
  let lastExport = null;
  const send = (payload) => {
    try {
      getWindow()?.webContents?.send('projects:progress', payload);
    } catch {
      /* la ventana se cerró */
    }
  };
  const hooksFor = (op) => ({
    onProgress: (done, total) => send({ op, done, total }),
    shouldCancel: () => running?.cancel === true,
  });
  const exclusive = async (op, fn) => {
    if (running) throw new ProjectError('busy');
    running = { op, cancel: false };
    try {
      return await fn();
    } finally {
      running = null;
    }
  };
  const downloads = () => {
    try {
      return app.getPath('downloads');
    } catch {
      return app.getPath('documents');
    }
  };

  handle('projects:info', () => ({ root, host, limits: LIMITS }));
  handle(
    'projects:choose-root',
    guarded(async () => {
      const result = await dialog.showOpenDialog(getWindow() ?? undefined, {
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      root = result.filePaths[0];
      writeFileSync(settingsFile, JSON.stringify({ root }));
      return { root };
    }),
  );
  handle(
    'projects:list',
    guarded(() => {
      ensureRoot();
      return { projects: listProjects(root, token) };
    }),
  );
  handle(
    'projects:create',
    guarded((input) => {
      ensureRoot();
      return { project: createProject(root, asText(input?.name, 80), asText(input?.subpath, 300)) };
    }),
  );
  handle(
    'projects:open',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      const readOnly = input?.readOnly === true;
      if (!readOnly) {
        const lock = acquireLock(dir, host, token, { force: input?.force === true });
        if (!lock.ok) return { locked: lock.holder };
        held.add(ref);
      }
      const project = summarize(root, dir, ref, token);
      if (!project) throw new ProjectError('not-a-project');
      return { project, readOnly, items: readItems(dir) };
    }),
  );
  handle(
    'projects:save-item',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      assertHeld(ref, dir);
      const meta = input?.meta && typeof input.meta === 'object' ? input.meta : {};
      const b = input?.b === null ? null : bytesOf(input?.b);
      writeItem(dir, asText(input?.id, 64), meta, { a: bytesOf(input?.a), b });
      return { ok: true };
    }),
  );
  handle(
    'projects:remove-item',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      assertHeld(ref, dir);
      removeItem(dir, asText(input?.id, 64));
      return { ok: true };
    }),
  );
  handle(
    'projects:renew',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      if (!held.has(ref)) return { ok: false };
      const ok = renewLock(dir, host, token);
      if (!ok) held.delete(ref);
      return { ok };
    }),
  );
  handle(
    'projects:release',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      releaseLock(dir, token);
      held.delete(ref);
      return { ok: true };
    }),
  );
  handle(
    'projects:rename',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      assertHeld(ref, dir);
      renameProject(dir, asText(input?.name, 80));
      return { ok: true };
    }),
  );
  /** «Quitar de la lista»: deja los PDFs en el disco y solo borra la marca del proyecto. */
  handle(
    'projects:forget',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      if (held.has(ref)) releaseLock(dir, token);
      held.delete(ref);
      forgetProject(dir);
      return { ok: true };
    }),
  );

  handle(
    'projects:export-info',
    guarded((input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      const project = summarize(root, dir, ref, token);
      if (!project) throw new ProjectError('not-a-project');
      const info = exportInfo(dir);
      if (!info.pdfsA) throw new ProjectError('empty');
      return { name: project.name, lock: project.lock, ...info };
    }),
  );
  handle(
    'projects:export',
    guarded(async (input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      const project = summarize(root, dir, ref, token);
      if (!project) throw new ProjectError('not-a-project');
      const base = safeSegments(project.name.replace(/[\\/]+/g, ' '))[0] || 'proyecto';
      const picked = await dialog.showSaveDialog(getWindow() ?? undefined, {
        defaultPath: path.join(downloads(), `${base}${ARCHIVE_EXT}`),
        filters: [{ name: 'PDF Annotator', extensions: [ARCHIVE_EXT.slice(1)] }],
      });
      if (picked.canceled || !picked.filePath) return { canceled: true };
      const file = picked.filePath.toLowerCase().endsWith(ARCHIVE_EXT)
        ? picked.filePath
        : picked.filePath + ARCHIVE_EXT;
      const out = await exclusive('export', () =>
        exportProject(
          dir,
          file,
          { includeB: input?.includeB !== false, appVersion: app.getVersion?.() ?? '', ref },
          hooksFor('export'),
        ),
      );
      lastExport = file;
      return { name: path.basename(file), path: file, ...out };
    }),
  );
  handle(
    'projects:reveal',
    guarded(() => {
      if (lastExport && existsSync(lastExport)) shell?.showItemInFolder?.(lastExport);
      return { ok: true };
    }),
  );
  handle(
    'projects:import-inspect',
    guarded(async (input) => {
      let file = typeof input?.path === 'string' ? input.path : '';
      if (!file) {
        const picked = await dialog.showOpenDialog(getWindow() ?? undefined, {
          properties: ['openFile'],
          defaultPath: downloads(),
          filters: [{ name: 'PDF Annotator', extensions: [ARCHIVE_EXT.slice(1)] }],
        });
        if (picked.canceled || !picked.filePaths[0]) return { canceled: true };
        file = picked.filePaths[0];
      }
      if (!path.isAbsolute(file) || !isArchiveFile(file))
        throw new ProjectError('not-an-archive', undefined, path.basename(file).slice(0, 120));
      inspected = null;
      let info;
      try {
        info = await exclusive('inspect', () => inspectArchive(file, {}, hooksFor('inspect')));
      } catch (error) {
        if (error instanceof ProjectError && error.code === 'not-an-archive')
          throw new ProjectError('not-an-archive', undefined, path.basename(file).slice(0, 120));
        throw error;
      }
      inspected = { file, info };
      const { ids, ...rest } = info;
      return { file: file, fileName: path.basename(file), info: rest };
    }),
  );
  handle(
    'projects:import-run',
    guarded(async (input) => {
      if (!inspected) throw new ProjectError('not-an-archive');
      const { file, info } = inspected;
      const mode = input?.mode === 'copy' || input?.mode === 'replace' ? input.mode : undefined;
      const options = {
        name: asText(input?.name, 80),
        subpath: asText(input?.subpath, 300),
        mode,
        skipOversize: input?.skipOversize === true,
        token,
      };
      const out = await exclusive('import', async () => {
        const result = await importArchive(file, root, options, hooksFor('import'));
        return result;
      });
      if (out.conflict) {
        const { dir } = resolveRef(root, out.conflict.ref);
        return { conflict: { ...out.conflict, ...replaceImpact(dir, info) } };
      }
      return out;
    }),
  );
  handle('projects:cancel', () => {
    if (running) running.cancel = true;
    return { ok: true };
  });

  return {
    releaseAll() {
      for (const ref of held) {
        try {
          releaseLock(resolveRef(root, ref).dir, token);
        } catch {
          /* ya no está */
        }
      }
      held.clear();
    },
    renewAll() {
      for (const ref of held) {
        try {
          if (!renewLock(resolveRef(root, ref).dir, host, token)) held.delete(ref);
        } catch {
          /* ya no está */
        }
      }
    },
  };
}
