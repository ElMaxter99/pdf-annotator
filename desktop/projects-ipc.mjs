// Puente IPC de los proyectos locales: valida todo lo que llega de la web y delega en `projects.mjs`.
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  acquireRemoteLock,
  folderReachable,
  listRemote,
  localDirty,
  projectStatus,
  readState,
  releaseRemoteLock,
  remoteDirOf,
  renewRemoteLock,
  syncProject,
  validateFolder,
  writeState,
} from './project-sync.mjs';
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
  // Carpeta enlazada (fase 3): se guarda solo la ruta; lo que contiene se trata como no confiable.
  const linkFile = path.join(app.getPath('userData'), 'projects-sync.json');
  const loadLink = () => {
    try {
      const saved = JSON.parse(readFileSync(linkFile, 'utf8')).folder;
      if (typeof saved === 'string' && path.isAbsolute(saved)) return saved;
    } catch {
      /* sin carpeta enlazada */
    }
    return null;
  };
  let link = loadLink();
  /** Última carpeta que el usuario eligió y se comprobó: «Vincular» actúa sobre ella, no sobre una ruta de la web. */
  let chosen = null;
  /** Subidas en segundo plano (al cerrar un proyecto o cada pocos minutos) que están en curso. */
  const pushing = new Set();
  const isSynced = (dir) => {
    const state = link ? readState(dir) : null;
    return state && !state.paused ? state : null;
  };
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
    guarded(async (input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      const readOnly = input?.readOnly === true;
      let offline = false;
      if (!readOnly) {
        const lock = acquireLock(dir, host, token, { force: input?.force === true });
        if (!lock.ok) return { locked: lock.holder };
        if (isSynced(dir)) {
          if (folderReachable(link)) {
            const rdir = remoteDirOf(link, ref);
            const remote = await acquireRemoteLock(rdir, host, token, {
              force: input?.force === true,
            });
            if (!remote.ok) {
              releaseLock(dir, token);
              return { locked: remote.holder, remote: true };
            }
            // Si otro equipo subió una revisión y aquí no hay cambios, se baja antes de editar.
            try {
              if (projectStatus(link, ref, dir, token).state === 'pull')
                await syncProject(link, root, ref, { host, token });
            } catch {
              /* se abre con lo que hay; la tarjeta mostrará el estado */
            }
          } else offline = true;
        }
        held.add(ref);
      }
      const project = summarize(root, dir, ref, token);
      if (!project) throw new ProjectError('not-a-project');
      return { project, readOnly, offline, items: readItems(dir) };
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
      let ok = renewLock(dir, host, token);
      if (ok && isSynced(dir) && folderReachable(link)) {
        try {
          ok = renewRemoteLock(remoteDirOf(link, ref), host, token);
        } catch {
          /* la carpeta no responde: se sigue con el bloqueo local */
        }
      }
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
      if (isSynced(dir)) void backgroundPush(ref, dir, true);
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
      rmSync(path.join(dir, '.sync.json'), { force: true });
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

  // ───────────── Sincronizar con una carpeta enlazada (fase 3) ─────────────
  const notify = (payload) => {
    try {
      getWindow()?.webContents?.send('projects:sync-event', payload);
    } catch {
      /* la ventana se cerró */
    }
  };
  const errorOf = (error) =>
    error instanceof ProjectError
      ? { error: error.code, ...(error.detail === undefined ? {} : { detail: error.detail }) }
      : { error: error?.code === 'ENOSPC' ? 'disk-full' : 'io' };
  /** Sube en segundo plano; si `release` es true suelta después el bloqueo remoto. No bloquea el cierre del proyecto. */
  const backgroundPush = async (ref, dir, release) => {
    if (!link || pushing.has(ref)) return;
    pushing.add(ref);
    try {
      if (!folderReachable(link)) throw new ProjectError('folder-missing');
      if (localDirty(dir, readState(dir)) && !running) {
        running = { op: 'sync', cancel: false };
        try {
          await syncProject(link, root, ref, { host, token, held: !release });
        } finally {
          running = null;
        }
      }
      notify({ ref, state: 'done' });
    } catch (error) {
      notify({ ref, state: 'error', ...errorOf(error) });
    } finally {
      pushing.delete(ref);
      if (release && link && folderReachable(link)) {
        try {
          releaseRemoteLock(remoteDirOf(link, ref), token);
        } catch {
          /* se queda para que caduque */
        }
      }
    }
  };

  const localProjects = () => {
    try {
      return listProjects(root, token);
    } catch {
      return [];
    }
  };
  handle(
    'sync:status',
    guarded(() => {
      if (!link) return { linked: false };
      const reachable = folderReachable(link);
      const projects = localProjects();
      const statuses = {};
      for (const project of projects) {
        const { dir } = resolveRef(root, project.ref);
        statuses[project.ref] = projectStatus(link, project.ref, dir, token);
        if (pushing.has(project.ref))
          statuses[project.ref] = { ...statuses[project.ref], busy: true };
      }
      const local = new Set(projects.map((p) => p.ref));
      const available = reachable ? listRemote(link).filter((r) => !local.has(r.ref)) : [];
      return { linked: true, folder: link, reachable, statuses, available };
    }),
  );
  handle(
    'sync:choose',
    guarded(async () => {
      const result = await dialog.showOpenDialog(getWindow() ?? undefined, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: link ?? app.getPath('home'),
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      chosen = null;
      const checked = validateFolder(result.filePaths[0], root);
      chosen = checked.folder;
      const projects = localProjects();
      const remote = listRemote(chosen);
      const local = new Set(projects.map((p) => p.ref));
      return {
        folder: chosen,
        free: checked.free,
        local: projects.length,
        remote: remote.filter((r) => !local.has(r.ref)).length,
        bytes: projects.reduce((sum, p) => sum + p.bytes, 0),
      };
    }),
  );
  handle(
    'sync:link',
    guarded((input) => {
      if (input?.accepted !== true || !chosen) throw new ProjectError('not-linked');
      validateFolder(chosen, root);
      link = chosen;
      writeFileSync(linkFile, JSON.stringify({ folder: link }));
      return { folder: link };
    }),
  );
  handle(
    'sync:unlink',
    guarded(() => {
      link = null;
      chosen = null;
      rmSync(linkFile, { force: true });
      return { ok: true };
    }),
  );
  /** Primera sincronización: sube los proyectos de este equipo y/o baja los de la carpeta. */
  handle(
    'sync:all',
    guarded(async (input) => {
      if (!link) throw new ProjectError('not-linked');
      const mode = ['both', 'down', 'manual', 'sync'].includes(input?.mode) ? input.mode : 'manual';
      if (mode === 'manual') return { synced: 0, failed: [], conflicts: [] };
      const projects = localProjects();
      const local = new Set(projects.map((p) => p.ref));
      const jobs = [];
      for (const project of projects) {
        const { dir } = resolveRef(root, project.ref);
        const synced = !!readState(dir);
        if ((mode === 'both' && !synced) || (mode === 'sync' && synced && !readState(dir).paused))
          jobs.push({ ref: project.ref, name: project.name });
      }
      if (mode !== 'sync') {
        for (const remote of listRemote(link))
          if (!local.has(remote.ref)) jobs.push({ ref: remote.ref, name: remote.name });
      }
      const out = { synced: 0, failed: [], conflicts: [] };
      await exclusive('sync', async () => {
        let done = 0;
        for (const job of jobs) {
          send({ op: 'sync', done, total: jobs.length, name: job.name });
          if (running?.cancel) throw new ProjectError('canceled');
          try {
            const result = await syncProject(
              link,
              root,
              job.ref,
              { host, token, held: held.has(job.ref) },
              { shouldCancel: () => running?.cancel === true },
            );
            if (result.conflict) out.conflicts.push(job.ref);
            else out.synced += 1;
          } catch (error) {
            if (error instanceof ProjectError && error.code === 'canceled') throw error;
            out.failed.push({ ref: job.ref, ...errorOf(error) });
          }
          done += 1;
        }
        send({ op: 'sync', done, total: jobs.length });
      });
      return out;
    }),
  );
  /** `sync` (también para descargar), `pause`, `resume` o `stop` (dejar de sincronizar este proyecto). */
  handle(
    'sync:project',
    guarded(async (input) => {
      if (!link) throw new ProjectError('not-linked');
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      const action = asText(input?.action, 12);
      if (action === 'stop') {
        if (held.has(ref) && isSynced(dir)) releaseRemoteLock(remoteDirOf(link, ref), token);
        rmSync(path.join(dir, '.sync.json'), { force: true });
        return { ok: true };
      }
      if (action === 'pause' || action === 'resume') {
        const state = readState(dir);
        if (!state) throw new ProjectError('not-synced');
        writeState(dir, { ...state, paused: action === 'pause' });
        return { ok: true };
      }
      if (action !== 'sync') throw new ProjectError('bad-action');
      const resolution = ['mine', 'theirs', 'later'].includes(input?.resolution)
        ? input.resolution
        : undefined;
      const out = await exclusive('sync', () =>
        syncProject(
          link,
          root,
          ref,
          { host, token, held: held.has(ref), resolution },
          hooksFor('sync'),
        ),
      );
      return out;
    }),
  );
  handle(
    'sync:reveal',
    guarded((input) => {
      if (!link) throw new ProjectError('not-linked');
      const rdir = remoteDirOf(link, asText(input?.ref, 300));
      if (existsSync(rdir)) shell?.showItemInFolder?.(rdir);
      return { ok: true };
    }),
  );

  handle('projects:cancel', () => {
    if (running) running.cancel = true;
    return { ok: true };
  });

  return {
    /** Cada pocos minutos: sube los cambios de los proyectos abiertos que se sincronizan. */
    syncHeld() {
      for (const ref of held) {
        try {
          const { dir } = resolveRef(root, ref);
          if (isSynced(dir) && localDirty(dir, readState(dir)))
            void backgroundPush(ref, dir, false);
        } catch {
          /* ya no está */
        }
      }
    },
    releaseAll() {
      for (const ref of held) {
        try {
          const { dir } = resolveRef(root, ref);
          if (link && readState(dir) && folderReachable(link))
            releaseRemoteLock(remoteDirOf(link, ref), token);
          releaseLock(dir, token);
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
