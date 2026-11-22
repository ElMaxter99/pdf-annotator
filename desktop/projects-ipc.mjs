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
  importTarget,
  inspectArchive,
  isArchiveFile,
  replaceImpact,
} from './project-archive.mjs';
import {
  acquireRemoteLock,
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
import { cleanConfig, inspectHost, openSftpProvider, testConnection } from './sftp-connection.mjs';
import { localProvider } from './sync-provider.mjs';
import { createSecretStore } from './sync-secrets.mjs';
import {
  LIMITS,
  ProjectError,
  acquireLock,
  createProject,
  forgetProject,
  listProjects,
  lockState,
  moveProjectFolder,
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

export function setupProjectsIpc({ handle, app, dialog, shell, getWindow, safeStorage }) {
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
  // Destino de la sincronización: una carpeta del equipo (fase 3) o un servidor SFTP (fase 3b); solo uno a la vez.
  // Se guarda la configuración (sin secretos); lo que hay al otro lado se trata como no confiable.
  const linkFile = path.join(app.getPath('userData'), 'projects-sync.json');
  const secrets = createSecretStore({
    safeStorage,
    file: path.join(app.getPath('userData'), 'projects-sync-secret.bin'),
  });
  const loadLink = () => {
    try {
      const saved = JSON.parse(readFileSync(linkFile, 'utf8'));
      if (saved?.kind === 'sftp') {
        const config = cleanConfig(saved);
        if (config.host && config.username && config.fingerprint)
          return { kind: 'sftp', ...config };
      } else if (typeof saved?.folder === 'string' && path.isAbsolute(saved.folder)) {
        return { kind: 'folder', folder: saved.folder };
      }
    } catch {
      /* sin destino enlazado */
    }
    return null;
  };
  let link = loadLink();
  /** Última carpeta o servidor que el usuario eligió y se comprobó: «Vincular» actúa sobre ella, no sobre datos de la web. */
  let chosen = null;
  /** Última huella de servidor que el usuario vio en el diálogo «¿Es este tu servidor?». */
  let inspectedHost = null;
  /** Conexión SFTP abierta y último fallo (para no insistir en cada consulta de estado). */
  let connection = null;
  let connectFail = null;
  const closeConnection = async () => {
    const old = connection;
    connection = null;
    connectFail = null;
    await old?.close?.().catch?.(() => undefined);
  };
  /** Proveedor del destino enlazado; lanza si no se puede abrir (se reintenta cada 15 s como mucho). */
  const provider = async () => {
    if (!link) throw new ProjectError('not-linked');
    if (link.kind === 'folder') return localProvider(link.folder);
    if (connection && (await connection.reachable())) return connection;
    connection = null;
    if (connectFail && Date.now() - connectFail.at < 15000) throw connectFail.error;
    const secret = secrets.load() ?? {};
    if (link.authMode === 'password' && !secret.password) {
      connectFail = { at: Date.now(), error: new ProjectError('secret-needed') };
      throw connectFail.error;
    }
    try {
      connection = await openSftpProvider(link, secret);
      connectFail = null;
      return connection;
    } catch (error) {
      connectFail = { at: Date.now(), error };
      throw error;
    }
  };
  const tryProvider = async () => {
    try {
      return await provider();
    } catch {
      return null;
    }
  };
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
          const prov = await tryProvider();
          if (prov) {
            const remote = await acquireRemoteLock(prov, remoteDirOf(ref), host, token, {
              force: input?.force === true,
            });
            if (!remote.ok) {
              releaseLock(dir, token);
              return { locked: remote.holder, remote: true };
            }
            // Si otro equipo subió una revisión y aquí no hay cambios, se baja antes de editar.
            try {
              if ((await projectStatus(prov, ref, dir, token)).state === 'pull')
                await syncProject(prov, root, ref, { host, token });
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
    guarded(async (input) => {
      const { dir, ref } = resolveRef(root, asText(input?.ref, 300));
      if (!held.has(ref)) return { ok: false };
      let ok = renewLock(dir, host, token);
      if (ok && isSynced(dir)) {
        try {
          const prov = await tryProvider();
          if (prov) {
            ok = await renewRemoteLock(prov, remoteDirOf(ref), host, token);
            if (!ok) notify({ ref, state: 'error', error: 'lock-expired' });
          }
        } catch {
          /* el destino no responde: se sigue con el bloqueo local */
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
      // Abierto en el editor de este equipo o subiendo en segundo plano: no se toca la carpeta.
      if (held.has(ref)) throw new ProjectError('in-use-local');
      if (pushing.has(ref)) throw new ProjectError('busy');
      const lock = acquireLock(dir, host, token);
      if (!lock.ok) return { locked: lock.holder };
      let current = dir;
      let newRef = ref;
      let folderKept = false;
      try {
        const name = asText(input?.name, 80);
        // Primero la carpeta (si falla, nada ha cambiado) y después el nombre visible.
        if (input?.folder === true) {
          // La ruta es la clave de la sincronización: vinculado (aunque esté en pausa), la carpeta no cambia.
          if (link && readState(dir)) folderKept = true;
          else {
            newRef = moveProjectFolder(root, ref, name).ref;
            current = resolveRef(root, newRef).dir;
          }
        }
        renameProject(current, name);
      } finally {
        releaseLock(current, token);
      }
      return { ok: true, ref: newRef, folderKept };
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

  /** «Abrir carpeta»: solo carpetas del propio proyecto dentro de la raíz (resolveRef lo garantiza). */
  handle(
    'projects:reveal-folder',
    guarded(async (input) => {
      const { dir } = resolveRef(root, asText(input?.ref, 300));
      if (!existsSync(dir)) throw new ProjectError('folder-gone');
      const failure = await shell?.openPath?.(dir);
      if (failure) throw new ProjectError('open-failed');
      return { ok: true };
    }),
  );
  /** Dónde se importaría con ese nombre y subcarpeta (para avisar antes si la carpeta tiene restos). */
  handle(
    'projects:import-target',
    guarded((input) => importTarget(root, asText(input?.name, 80), asText(input?.subpath, 300))),
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

  // ───────────── Sincronizar con una carpeta o un servidor (fases 3 y 3b) ─────────────
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
  /** Progreso de una sincronización: archivos, bytes, velocidad y bytes totales previstos. */
  const syncHooks = () => {
    const started = Date.now();
    let bytes = 0;
    let plan = { bytes: 0 };
    let state = { done: 0, total: 0 };
    let lastSent = 0;
    const emit = (force) => {
      const now = Date.now();
      if (!force && now - lastSent < 250) return;
      lastSent = now;
      const seconds = Math.max(0.5, (now - started) / 1000);
      send({
        op: 'sync',
        ...state,
        bytes,
        bytesTotal: plan.bytes,
        speed: Math.round(bytes / seconds),
      });
    };
    return {
      onPlan: (value) => {
        plan = value;
      },
      onBytes: (n) => {
        bytes += n;
        emit(false);
      },
      onProgress: (done, total) => {
        state = { done, total };
        emit(true);
      },
      shouldCancel: () => running?.cancel === true,
    };
  };
  /** Sube en segundo plano; si `release` es true suelta después el bloqueo remoto. No bloquea el cierre del proyecto. */
  const backgroundPush = async (ref, dir, release) => {
    if (!link || pushing.has(ref)) return;
    pushing.add(ref);
    let prov = null;
    try {
      prov = await provider();
      if (localDirty(dir, readState(dir)) && !running) {
        running = { op: 'sync', cancel: false };
        try {
          await syncProject(prov, root, ref, { host, token, held: !release });
        } finally {
          running = null;
        }
      }
      notify({ ref, state: 'done' });
    } catch (error) {
      notify({ ref, state: 'error', ...errorOf(error) });
    } finally {
      pushing.delete(ref);
      if (release && prov) {
        try {
          await releaseRemoteLock(prov, remoteDirOf(ref), token);
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
  /** Lo que la web puede saber del servidor: nunca la contraseña ni la frase de paso, solo si hay una guardada. */
  const serverInfo = () =>
    link?.kind === 'sftp'
      ? {
          host: link.host,
          port: link.port,
          username: link.username,
          path: link.path,
          authMode: link.authMode,
          keyFile: link.keyFile,
          fingerprint: link.fingerprint,
          hostKeyType: link.hostKeyType,
          credentialSaved: secrets.saved(),
          credentialInSession: secrets.hasSession(),
          secureStore: secrets.available(),
        }
      : undefined;
  const failureOf = () => {
    const error = connectFail?.error;
    return error instanceof ProjectError ? error.code : undefined;
  };
  handle(
    'sync:status',
    guarded(async (input) => {
      if (!link) return { linked: false };
      // Una petición explícita («Sincronizar ahora», «Reintentar») no espera al enfriamiento de los reintentos.
      if (input?.fresh === true) connectFail = null;
      const prov = await tryProvider();
      const reachable = !!prov;
      const projects = localProjects();
      const statuses = {};
      for (const project of projects) {
        const { dir } = resolveRef(root, project.ref);
        statuses[project.ref] = prov
          ? await projectStatus(prov, project.ref, dir, token).catch(() => ({ state: 'off' }))
          : readState(dir)
            ? { state: 'off', rev: readState(dir).baseRev, lastSync: readState(dir).lastSync }
            : { state: 'none' };
        if (pushing.has(project.ref))
          statuses[project.ref] = { ...statuses[project.ref], busy: true };
      }
      const local = new Set(projects.map((p) => p.ref));
      const available = prov
        ? (await listRemote(prov).catch(() => [])).filter((r) => !local.has(r.ref))
        : [];
      return {
        linked: true,
        kind: link.kind,
        folder: link.kind === 'folder' ? link.folder : undefined,
        label: link.kind === 'folder' ? link.folder : `${link.username}@${link.host}:${link.path}`,
        server: serverInfo(),
        reachable,
        offlineReason: reachable ? undefined : failureOf(),
        statuses,
        available,
      };
    }),
  );
  handle(
    'sync:choose',
    guarded(async () => {
      if (link && link.kind !== 'folder') throw new ProjectError('already-linked');
      const result = await dialog.showOpenDialog(getWindow() ?? undefined, {
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: link?.folder ?? app.getPath('home'),
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      chosen = null;
      const checked = validateFolder(result.filePaths[0], root);
      chosen = { kind: 'folder', folder: checked.folder };
      const projects = localProjects();
      const remote = await listRemote(localProvider(checked.folder));
      const local = new Set(projects.map((p) => p.ref));
      return {
        folder: checked.folder,
        free: checked.free,
        local: projects.length,
        remote: remote.filter((r) => !local.has(r.ref)).length,
        bytes: projects.reduce((sum, p) => sum + p.bytes, 0),
      };
    }),
  );
  /** Elegir el archivo de la clave privada (la web no puede escribir una ruta: solo este diálogo). */
  handle(
    'sync:sftp-choose-key',
    guarded(async () => {
      const result = await dialog.showOpenDialog(getWindow() ?? undefined, {
        properties: ['openFile', 'showHiddenFiles'],
        defaultPath: path.join(os.homedir(), '.ssh'),
      });
      if (result.canceled || !result.filePaths[0]) return { canceled: true };
      pickedKey = result.filePaths[0];
      return { keyFile: pickedKey };
    }),
  );
  let pickedKey = '';
  /** Lee la huella del servidor (sin enviar credenciales) para el diálogo «¿Es este tu servidor?». */
  handle(
    'sync:sftp-inspect',
    guarded(async (input) => {
      if (link && link.kind !== 'sftp') throw new ProjectError('already-linked');
      const config = cleanConfig(input);
      if (!config.host || /[\s/\\]/.test(config.host)) throw new ProjectError('bad-sftp-config');
      const seen = await inspectHost(config);
      inspectedHost = { host: config.host, port: config.port, ...seen };
      const pinned =
        link?.kind === 'sftp' && link.host === config.host && link.port === config.port
          ? link.fingerprint
          : '';
      return {
        fingerprint: seen.fingerprint,
        type: seen.type,
        changed: !!pinned && pinned !== seen.fingerprint,
        previous: pinned || undefined,
      };
    }),
  );
  /** Tras confirmar a mano una huella nueva en un servidor ya enlazado: se fija la nueva (no hay «aceptar siempre»). */
  handle(
    'sync:sftp-trust',
    guarded(async (input) => {
      if (input?.accepted !== true || link?.kind !== 'sftp' || !inspectedHost)
        throw new ProjectError('not-linked');
      if (inspectedHost.host !== link.host || inspectedHost.port !== link.port)
        throw new ProjectError('not-linked');
      link = { ...link, fingerprint: inspectedHost.fingerprint, hostKeyType: inspectedHost.type };
      writeFileSync(linkFile, JSON.stringify(link));
      await closeConnection();
      return { ok: true };
    }),
  );
  /** «Probar conexión»: con los datos del diálogo o con el destino ya enlazado y su credencial guardada. */
  handle(
    'sync:sftp-test',
    guarded(async (input) => {
      const saved = input?.useSaved === true && link?.kind === 'sftp';
      let config;
      let secret;
      if (saved) {
        config = link;
        secret = secrets.load() ?? {};
      } else {
        if (link && link.kind !== 'sftp') throw new ProjectError('already-linked');
        config = cleanConfig(input?.config);
        if (
          !inspectedHost ||
          inspectedHost.host !== config.host ||
          inspectedHost.port !== config.port
        )
          throw new ProjectError('host-key-unknown');
        config = {
          ...config,
          fingerprint: inspectedHost.fingerprint,
          hostKeyType: inspectedHost.type,
        };
        if (config.authMode === 'key') {
          if (!pickedKey) throw new ProjectError('key-unusable');
          config.keyFile = pickedKey;
        }
        secret = {
          password: asText(input?.secret?.password, 1024),
          passphrase: asText(input?.secret?.passphrase, 1024),
        };
      }
      const projects = localProjects();
      const local = new Set(projects.map((p) => p.ref));
      const out = await testConnection(config, secret, {
        create: input?.create === true,
        inspect: async (prov) => (await listRemote(prov)).filter((r) => !local.has(r.ref)).length,
      });
      if (out.ok && !saved) {
        chosen = {
          kind: 'sftp',
          config,
          secret,
          remember: input?.remember !== false,
        };
      }
      return {
        ...out,
        extra: undefined,
        folder: `${config.username}@${config.host}:${config.path}`,
        local: projects.length,
        remote: out.extra ?? 0,
        bytes: projects.reduce((sum, p) => sum + p.bytes, 0),
        secureStore: secrets.available(),
      };
    }),
  );
  handle(
    'sync:link',
    guarded(async (input) => {
      if (input?.accepted !== true || !chosen) throw new ProjectError('not-linked');
      if (chosen.kind === 'folder') {
        if (link && link.kind !== 'folder') throw new ProjectError('already-linked');
        validateFolder(chosen.folder, root);
        link = { kind: 'folder', folder: chosen.folder };
        writeFileSync(linkFile, JSON.stringify({ kind: 'folder', folder: link.folder }));
        return { folder: link.folder };
      }
      if (link && link.kind !== 'sftp') throw new ProjectError('already-linked');
      link = { kind: 'sftp', ...chosen.config };
      writeFileSync(linkFile, JSON.stringify(link));
      await closeConnection();
      const secret =
        chosen.config.authMode === 'key'
          ? { passphrase: chosen.secret.passphrase }
          : { password: chosen.secret.password };
      let saved = false;
      const remember = input?.remember === undefined ? chosen.remember : input.remember !== false;
      if (remember) saved = secrets.save(secret);
      else secrets.remember(secret);
      if (!saved && secrets.available() === false) secrets.remember(secret);
      chosen = null;
      return { folder: `${link.username}@${link.host}:${link.path}`, credentialSaved: saved };
    }),
  );
  /** «Cambiar credencial»: guarda la nueva (o solo para esta sesión si no hay almacén seguro). */
  handle(
    'sync:sftp-credential',
    guarded(async (input) => {
      if (link?.kind !== 'sftp') throw new ProjectError('not-linked');
      const secret =
        link.authMode === 'key'
          ? { passphrase: asText(input?.passphrase, 1024) }
          : { password: asText(input?.password, 1024) };
      if (!Object.values(secret)[0] && link.authMode === 'password')
        throw new ProjectError('auth-failed');
      let saved = false;
      if (input?.remember !== false) saved = secrets.save(secret);
      else secrets.remember(secret);
      await closeConnection();
      return { saved };
    }),
  );
  handle(
    'sync:sftp-forget',
    guarded(async () => {
      secrets.clear();
      await closeConnection();
      return { ok: true };
    }),
  );
  handle(
    'sync:unlink',
    guarded(async () => {
      if (link?.kind === 'sftp') {
        for (const ref of held) {
          try {
            const prov = await tryProvider();
            if (prov) await releaseRemoteLock(prov, remoteDirOf(ref), token);
          } catch {
            /* se queda para que caduque */
          }
        }
        secrets.clear();
      }
      link = null;
      chosen = null;
      inspectedHost = null;
      await closeConnection();
      rmSync(linkFile, { force: true });
      return { ok: true };
    }),
  );
  /** Primera sincronización: sube los proyectos de este equipo y/o baja los del destino. */
  handle(
    'sync:all',
    guarded(async (input) => {
      const prov = await provider();
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
        for (const remote of await listRemote(prov))
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
              prov,
              root,
              job.ref,
              { host, token, held: held.has(job.ref) },
              syncHooks(),
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
        if (held.has(ref) && isSynced(dir)) {
          const prov = await tryProvider();
          if (prov) await releaseRemoteLock(prov, remoteDirOf(ref), token);
        }
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
      const prov = await provider();
      const out = await exclusive('sync', () =>
        syncProject(prov, root, ref, { host, token, held: held.has(ref), resolution }, syncHooks()),
      );
      return out;
    }),
  );
  handle(
    'sync:reveal',
    guarded((input) => {
      if (link?.kind !== 'folder') return { ok: true };
      const rdir = path.join(link.folder, remoteDirOf(asText(input?.ref, 300)));
      if (existsSync(rdir)) shell?.showItemInFolder?.(rdir);
      return { ok: true };
    }),
  );

  handle('projects:cancel', () => {
    if (running) running.cancel = true;
    return { ok: true };
  });

  return {
    /** Carpeta de proyectos de ahora (la usa «Almacenamiento»). */
    getRoot: () => root,
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
    /** Al salir: suelta los bloqueos locales y, con un poco de margen, los del destino. */
    async releaseAll() {
      const remotes = [];
      for (const ref of held) {
        try {
          const { dir } = resolveRef(root, ref);
          if (link && readState(dir)) {
            remotes.push(
              (async () => {
                const prov = await tryProvider();
                if (prov) await releaseRemoteLock(prov, remoteDirOf(ref), token);
              })().catch(() => undefined),
            );
          }
          releaseLock(dir, token);
        } catch {
          /* ya no está */
        }
      }
      held.clear();
      await Promise.race([Promise.all(remotes), new Promise((r) => setTimeout(r, 3000))]);
      await closeConnection();
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
