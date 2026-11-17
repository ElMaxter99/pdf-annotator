// Sincronización de proyectos con una carpeta enlazada (fase 3, mesas P-88 a P-90).
// Cada equipo trabaja sobre su copia local; la carpeta enlazada (Drive, OneDrive, red…) es el punto de encuentro:
//   <enlazada>/<ref>/project.json · batch/…        los mismos archivos que el proyecto local
//   <enlazada>/<ref>/.sync/rev.json                revisión: número, quién subió, cuándo y huella de cada archivo (se escribe la última)
//   <enlazada>/<ref>/.sync/lock.json               bloqueo con caducidad (latido cada 2 min, libre a los 15)
//   <enlazada>/<ref>/.sync/backups/rev<N>/…        copia de lo que se sustituyó al elegir «reemplazar»
//   <raíz>/<ref>/.sync.json                        estado local: id, revisión base y huellas de la última sincronización
// Todo lo que se lee de la carpeta enlazada es no confiable: se valida el nombre de cada archivo y su huella.
import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { copyFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  ITEM_ID,
  LIMITS,
  MAX_NAME,
  ProjectError,
  manifestOf,
  readJson,
  resolveRef,
  writeAtomic,
} from './projects.mjs';

export const SYNC_STALE_MS = 15 * 60 * 1000;
export const SYNC_HEARTBEAT_MS = 2 * 60 * 1000;
const SETTLE_MS = 3000;
const FILE_RE = /^(project\.json|batch\/[A-Za-z0-9_-]{1,64}\.(?:json|a\.pdf|b\.pdf))$/;
const MAX_FILES = 3 * LIMITS.maxPdfs + 8;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

// ───────────── Archivos del proyecto y estado local ─────────────

/** Archivos que viajan: `project.json` y cada PDF del lote con sus metadatos. */
export function projectFiles(dir) {
  const found = [];
  const add = (rel) => {
    try {
      const stat = statSync(path.join(dir, rel));
      if (stat.isFile()) found.push({ rel, size: stat.size, mtime: Math.round(stat.mtimeMs) });
    } catch {
      /* no existe */
    }
  };
  add('project.json');
  const batch = path.join(dir, 'batch');
  if (existsSync(batch)) {
    for (const name of readdirSync(batch)) if (FILE_RE.test(`batch/${name}`)) add(`batch/${name}`);
  }
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function readState(dir) {
  const raw = readJson(path.join(dir, '.sync.json'));
  if (!raw || typeof raw !== 'object' || typeof raw.projectId !== 'string') return null;
  const files = {};
  for (const [rel, entry] of Object.entries(raw.files ?? {})) {
    if (FILE_RE.test(rel) && entry && typeof entry.sha256 === 'string')
      files[rel] = { size: num(entry.size), mtime: num(entry.mtime), sha256: entry.sha256 };
  }
  return {
    projectId: raw.projectId.slice(0, 64),
    baseRev: Math.max(0, Math.floor(num(raw.baseRev))),
    files,
    paused: raw.paused === true,
    lastSync: num(raw.lastSync),
  };
}

export function writeState(dir, state) {
  writeAtomic(path.join(dir, '.sync.json'), JSON.stringify({ v: 1, ...state }));
}

async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/** Huella de cada archivo local; reutiliza la guardada si el tamaño y la fecha no cambiaron. */
export async function scanLocal(dir, previous = {}) {
  const out = {};
  for (const file of projectFiles(dir)) {
    const old = previous[file.rel];
    const sha256 =
      old && old.size === file.size && old.mtime === file.mtime
        ? old.sha256
        : await sha256File(path.join(dir, file.rel));
    out[file.rel] = { size: file.size, mtime: file.mtime, sha256 };
    await tick();
  }
  return out;
}

/** ¿Cambió algo desde la última sincronización? Solo mira tamaños y fechas (rápido, sin leer los PDFs). */
export function localDirty(dir, state) {
  const files = projectFiles(dir);
  if (!state) return files.length > 0;
  if (files.length !== Object.keys(state.files).length) return true;
  return files.some((f) => {
    const old = state.files[f.rel];
    return !old || old.size !== f.size || old.mtime !== f.mtime;
  });
}

export function diffFiles(next, base) {
  const changed = Object.keys(next).filter((rel) => base[rel]?.sha256 !== next[rel].sha256);
  const removed = Object.keys(base).filter((rel) => !next[rel]);
  return { changed, removed };
}

// ───────────── Carpeta enlazada ─────────────

export function remoteDirOf(folder, ref) {
  return resolveRef(folder, ref).dir;
}

export function readRev(rdir) {
  const raw = readJson(path.join(rdir, '.sync', 'rev.json'));
  if (!raw || typeof raw !== 'object' || typeof raw.projectId !== 'string') return null;
  const rev = Math.floor(num(raw.rev));
  if (rev < 1) return null;
  const files = {};
  let count = 0;
  for (const [rel, entry] of Object.entries(raw.files ?? {})) {
    if (++count > MAX_FILES) return null;
    if (!FILE_RE.test(rel) || !entry || !/^[0-9a-f]{64}$/.test(String(entry.sha256))) return null;
    files[rel] = { size: num(entry.size), sha256: entry.sha256 };
  }
  if (!files['project.json']) return null;
  return {
    rev,
    projectId: raw.projectId.slice(0, 64),
    name: String(raw.name ?? '').slice(0, MAX_NAME),
    by: String(raw.by ?? '').slice(0, 80),
    at: num(raw.at),
    files,
    formatVersion: num(raw.v),
  };
}

/** Comprueba que la carpeta enlazada sirve: existe, se lee, se escribe y no se solapa con la de proyectos. */
export function validateFolder(folder, root) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder))
    throw new ProjectError('folder-missing');
  let stat;
  try {
    stat = statSync(folder);
  } catch {
    throw new ProjectError('folder-missing');
  }
  if (!stat.isDirectory()) throw new ProjectError('folder-missing');
  const a = path.resolve(folder);
  const b = path.resolve(root);
  const inside = (outer, inner) => inner === outer || inner.startsWith(outer + path.sep);
  if (inside(a, b) || inside(b, a)) throw new ProjectError('folder-overlaps');
  const probe = path.join(a, `.pdfannotator-${randomUUID().slice(0, 8)}.tmp`);
  try {
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
  } catch {
    throw new ProjectError('folder-readonly');
  }
  return { folder: a, free: freeBytes(a) };
}

export function freeBytes(folder) {
  try {
    const fs = statfsSync(folder);
    return Number(fs.bavail) * Number(fs.bsize);
  } catch {
    return null;
  }
}

export function folderReachable(folder) {
  try {
    return statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

/** Archivos que no son del proyecto: copias en conflicto del servicio de sincronización, restos… */
export function strays(rdir, rev) {
  const known = new Set(['project.json', ...Object.keys(rev?.files ?? {})]);
  const out = [];
  const scan = (sub, allowed) => {
    let names;
    try {
      names = readdirSync(path.join(rdir, sub));
    } catch {
      return;
    }
    for (const name of names) {
      const rel = sub ? `${sub}/${name}` : name;
      if (known.has(rel) || allowed.includes(name) || name.endsWith('.part')) continue;
      if (statSync(path.join(rdir, rel)).isDirectory()) continue;
      out.push(rel);
    }
  };
  scan('', ['.sync', 'batch']);
  scan('batch', []);
  scan('.sync', ['rev.json', 'lock.json', 'backups']);
  return out.slice(0, 10);
}

/** Proyectos de la carpeta enlazada (hasta tres niveles), para la lista «Disponibles». */
export function listRemote(folder) {
  const found = [];
  const walk = (dir, segments) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (segments.length && existsSync(path.join(dir, '.sync', 'rev.json'))) {
      const rev = readRev(dir);
      if (rev) found.push({ ref: segments.join('/'), ...summaryOf(rev) });
      return;
    }
    if (segments.length >= 3) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        walk(path.join(dir, entry.name), [...segments, entry.name]);
    }
  };
  walk(folder, []);
  return found.sort((a, b) => b.at - a.at);
}

function summaryOf(rev) {
  const rels = Object.keys(rev.files);
  return {
    id: rev.projectId,
    name: rev.name,
    rev: rev.rev,
    by: rev.by,
    at: rev.at,
    pdfs: rels.filter((r) => r.endsWith('.a.pdf')).length,
    bytes: rels.reduce((sum, r) => sum + rev.files[r].size, 0),
  };
}

// ───────────── Bloqueo remoto ─────────────

export function remoteLockState(rdir, token, now = Date.now()) {
  const lock = readJson(path.join(rdir, '.sync', 'lock.json'));
  if (!lock || typeof lock.host !== 'string' || typeof lock.token !== 'string')
    return { state: 'free' };
  const seen = num(lock.seen);
  if (lock.token === token) return { state: 'mine', host: lock.host, since: num(lock.since), seen };
  if (now - seen > SYNC_STALE_MS) return { state: 'free', stale: { host: lock.host, seen } };
  return { state: 'other', host: lock.host.slice(0, 80), since: num(lock.since), seen };
}

function writeRemoteLock(rdir, host, token, since, now) {
  mkdirSync(path.join(rdir, '.sync'), { recursive: true });
  writeAtomic(
    path.join(rdir, '.sync', 'lock.json'),
    JSON.stringify({ host: String(host).slice(0, 80), token, since, seen: now }),
  );
}

/** Toma el bloqueo: escribe, espera unos segundos y vuelve a leer; si otro equipo escribió a la vez, gana el más antiguo. */
export async function acquireRemoteLock(
  rdir,
  host,
  token,
  { force = false, settleMs = SETTLE_MS, now = Date.now() } = {},
) {
  const current = remoteLockState(rdir, token, now);
  if (current.state === 'other' && !force) return { ok: false, holder: current };
  const since = current.state === 'mine' ? current.since : now;
  writeRemoteLock(rdir, host, token, since, now);
  if (current.state !== 'mine' && settleMs > 0) {
    await sleep(settleMs);
    const after = remoteLockState(rdir, token, Date.now());
    if (after.state === 'other') return { ok: false, holder: after };
  }
  return { ok: true };
}

export function renewRemoteLock(rdir, host, token, now = Date.now()) {
  const current = remoteLockState(rdir, token, now);
  if (current.state === 'other') return false;
  if (current.state === 'mine' && now - current.seen < SYNC_HEARTBEAT_MS) return true;
  writeRemoteLock(rdir, host, token, current.state === 'mine' ? current.since : now, now);
  return true;
}

export function releaseRemoteLock(rdir, token) {
  const lock = readJson(path.join(rdir, '.sync', 'lock.json'));
  if (lock?.token === token) rmSync(path.join(rdir, '.sync', 'lock.json'), { force: true });
}

// ───────────── Estado de un proyecto ─────────────

/**
 * Estado para la tarjeta: none (no sincroniza), sync, pend (cambios sin subir), pull (hay una revisión nueva),
 * other (otro equipo lo tiene abierto), conflict (cambiaron los dos), off (carpeta no disponible), paused.
 */
export function projectStatus(folder, ref, dir, token, now = Date.now()) {
  const state = readState(dir);
  if (!state) return { state: 'none' };
  if (!folderReachable(folder))
    return { state: 'off', rev: state.baseRev, lastSync: state.lastSync };
  const rdir = remoteDirOf(folder, ref);
  const rev = readRev(rdir);
  const lock = remoteLockState(rdir, token, now);
  const base = { rev: state.baseRev, lastSync: state.lastSync, duplicates: strays(rdir, rev) };
  if (state.paused) return { ...base, state: 'paused' };
  const dirty = localDirty(dir, state);
  const remoteNew = !!rev && rev.rev > state.baseRev;
  if (rev && rev.projectId !== state.projectId)
    return { ...base, state: 'conflict', kind: 'ref-taken' };
  if (dirty && remoteNew)
    return { ...base, state: 'conflict', kind: 'both', remoteRev: rev.rev, by: rev.by, at: rev.at };
  if (lock.state === 'other') return { ...base, state: 'other', holder: lock };
  if (remoteNew) return { ...base, state: 'pull', remoteRev: rev.rev, by: rev.by, at: rev.at };
  if (dirty || !rev) return { ...base, state: 'pend' };
  return { ...base, state: 'sync' };
}

// ───────────── Subir y bajar ─────────────

async function copyInto(src, dest, hooks, { expectSha } = {}) {
  if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
  mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  try {
    await copyFile(src, part);
    if (expectSha && (await sha256File(part)) !== expectSha)
      throw new ProjectError('remote-incomplete', undefined, path.basename(src));
    await rename(part, dest);
  } catch (error) {
    rmSync(part, { force: true });
    if (error instanceof ProjectError) throw error;
    if (error?.code === 'ENOENT')
      throw new ProjectError('remote-incomplete', undefined, path.basename(src));
    if (['EIO', 'ETIMEDOUT', 'EBUSY', 'EAGAIN', 'UNKNOWN'].includes(error?.code))
      throw new ProjectError('cloud-pending', undefined, path.basename(src));
    throw error;
  }
  await tick();
}

function checkSpace(folder, bytes) {
  const free = freeBytes(folder);
  if (free !== null && bytes > free)
    throw new ProjectError('disk-full', undefined, String(Math.ceil((bytes - free) / 1048576)));
}

/** Sube a la carpeta enlazada solo lo que cambió y escribe `rev.json` al final. */
export async function pushProject(
  folder,
  ref,
  dir,
  { host, token, backup = false, now = Date.now(), name } = {},
  hooks,
) {
  const rdir = remoteDirOf(folder, ref);
  if (!folderReachable(folder)) throw new ProjectError('folder-missing');
  const state = readState(dir);
  const remote = readRev(rdir);
  const lock = remoteLockState(rdir, token, now);
  if (lock.state === 'other') throw new ProjectError('in-use', undefined, lock.host);
  const manifest = manifestOf(readJson(path.join(dir, 'project.json')));
  if (!manifest) throw new ProjectError('not-a-project');
  const projectId = state?.projectId ?? manifest.id;
  if (remote && remote.projectId !== projectId && !backup) throw new ProjectError('ref-taken');
  const files = await scanLocal(dir, state?.files);
  const base = remote && remote.projectId === projectId ? remote.files : {};
  const { changed, removed } = diffFiles(files, base);
  const rev = (remote?.rev ?? 0) + 1;
  checkSpace(
    folder,
    changed.reduce((sum, rel) => sum + files[rel].size, 0),
  );
  const total = changed.length + removed.length;
  let done = 0;
  mkdirSync(path.join(rdir, '.sync'), { recursive: true });
  for (const rel of changed) {
    if (backup && existsSync(path.join(rdir, rel))) await moveToBackup(rdir, rev, rel);
    await copyInto(path.join(dir, rel), path.join(rdir, rel), hooks);
    const size = statSync(path.join(rdir, rel)).size;
    if (size !== files[rel].size) throw new ProjectError('remote-incomplete', undefined, rel);
    hooks?.onProgress?.(++done, total);
  }
  for (const rel of removed) {
    if (backup) await moveToBackup(rdir, rev, rel);
    else rmSync(path.join(rdir, rel), { force: true });
    hooks?.onProgress?.(++done, total);
  }
  const index = {};
  for (const rel of Object.keys(files))
    index[rel] = { size: files[rel].size, sha256: files[rel].sha256 };
  writeAtomic(
    path.join(rdir, '.sync', 'rev.json'),
    JSON.stringify({
      v: 1,
      rev,
      projectId,
      name: name ?? manifest.name,
      by: String(host).slice(0, 80),
      at: now,
      files: index,
    }),
  );
  writeState(dir, { projectId, baseRev: rev, files, paused: false, lastSync: now });
  return { rev, uploaded: changed.length, removed: removed.length };
}

async function moveToBackup(rdir, rev, rel) {
  const dest = path.join(rdir, '.sync', 'backups', `rev${rev - 1}`, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  await rename(path.join(rdir, rel), dest);
}

/** Baja la revisión de la carpeta: copia a una carpeta temporal, verifica las huellas y solo entonces sustituye. */
export async function pullProject(folder, ref, dir, { now = Date.now() } = {}, hooks) {
  const rdir = remoteDirOf(folder, ref);
  if (!folderReachable(folder)) throw new ProjectError('folder-missing');
  const remote = readRev(rdir);
  if (!remote) throw new ProjectError('not-a-project');
  if (remote.formatVersion > 1) throw new ProjectError('newer-format');
  if (Object.keys(remote.files).filter((r) => r.endsWith('.a.pdf')).length > LIMITS.maxPdfs)
    throw new ProjectError('too-many-pdfs');
  const state = readState(dir);
  const local = await scanLocal(dir, state?.files);
  const { changed, removed } = diffFiles(remote.files, local);
  const wanted = changed.filter((rel) => local[rel]?.sha256 !== remote.files[rel].sha256);
  const bytes = wanted.reduce((sum, rel) => sum + remote.files[rel].size, 0);
  if (bytes > LIMITS.maxBytes) throw new ProjectError('too-big');
  mkdirSync(dir, { recursive: true });
  checkSpace(dir, bytes);
  const staging = path.join(dir, '.sync-tmp');
  rmSync(staging, { recursive: true, force: true });
  const total = wanted.length;
  let done = 0;
  try {
    for (const rel of wanted) {
      const src = path.join(rdir, rel);
      if (!existsSync(src)) throw new ProjectError('remote-incomplete', undefined, rel);
      if (statSync(src).size !== remote.files[rel].size)
        throw new ProjectError('cloud-pending', undefined, rel);
      await copyInto(src, path.join(staging, rel), hooks, { expectSha: remote.files[rel].sha256 });
      hooks?.onProgress?.(++done, total);
    }
    for (const rel of wanted) {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      await rename(path.join(staging, rel), path.join(dir, rel));
    }
    const removable = Object.keys(local).filter((rel) => !remote.files[rel]);
    for (const rel of removable) rmSync(path.join(dir, rel), { force: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const files = await scanLocal(dir, {});
  writeState(dir, {
    projectId: remote.projectId,
    baseRev: remote.rev,
    files,
    paused: false,
    lastSync: now,
  });
  return { rev: remote.rev, downloaded: wanted.length, removed: removed.length };
}

// ───────────── Conflictos ─────────────

/** Qué se juega cada lado: sirve para el diálogo de conflicto. */
export async function conflictImpact(folder, ref, dir) {
  const state = readState(dir);
  const remote = readRev(remoteDirOf(folder, ref));
  const local = await scanLocal(dir, state?.files);
  const mine = diffFiles(local, state?.files ?? {});
  const theirs = remote
    ? diffFiles(remote.files, state?.files ?? {})
    : { changed: [], removed: [] };
  const pdfs = (rels) =>
    new Set(
      rels
        .map((r) => r.replace(/^batch\//, '').split('.')[0])
        .filter((id) => ITEM_ID.test(id) && id !== 'project'),
    );
  const mineIds = pdfs([...mine.changed, ...mine.removed]);
  const theirIds = pdfs([...theirs.changed, ...theirs.removed]);
  return {
    remoteRev: remote?.rev ?? 0,
    by: remote?.by ?? '',
    at: remote?.at ?? 0,
    mine: mineIds.size,
    theirs: theirIds.size,
    both: [...mineIds].filter((id) => theirIds.has(id)).length,
  };
}

/** Guarda lo local como un proyecto aparte («X (conflicto 17 nov)») antes de quedarse con la versión de la carpeta. */
export async function keepLocalCopy(root, dir, ref, now = Date.now()) {
  const segments = ref.split('/');
  const last = segments.pop();
  const date = new Date(now);
  const tag = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const iso = date.toISOString().slice(0, 10);
  let n = 0;
  let target;
  let targetRef;
  do {
    targetRef = [...segments, `${last}-conflicto-${iso}${n ? `-${n + 1}` : ''}`].join('/');
    target = resolveRef(root, targetRef).dir;
    n += 1;
  } while (existsSync(target));
  mkdirSync(path.join(target, 'batch'), { recursive: true });
  for (const file of projectFiles(dir)) {
    mkdirSync(path.dirname(path.join(target, file.rel)), { recursive: true });
    await copyFile(path.join(dir, file.rel), path.join(target, file.rel));
    await tick();
  }
  const manifest = readJson(path.join(target, 'project.json')) ?? {};
  writeAtomic(
    path.join(target, 'project.json'),
    JSON.stringify(
      {
        ...manifest,
        id: randomUUID(),
        name: `${String(manifest.name ?? ref).slice(0, MAX_NAME - 22)} (conflicto ${tag})`,
        updatedAt: now,
      },
      null,
      2,
    ),
  );
  return { ref: targetRef };
}

/**
 * Sincroniza un proyecto: sube, baja o pide decidir.
 * `resolution`: 'theirs' (queda la versión de la carpeta y lo local se guarda como copia) o 'mine' (sube lo local; la revisión que se sustituye se guarda en `.sync/backups`).
 */
export async function syncProject(
  folder,
  root,
  ref,
  { host, token, held = false, resolution, now = Date.now() } = {},
  hooks,
) {
  const { dir } = resolveRef(root, ref);
  const rdir = remoteDirOf(folder, ref);
  if (!folderReachable(folder)) throw new ProjectError('folder-missing');
  const state = readState(dir);
  const remote = readRev(rdir);
  const dirty = localDirty(dir, state);
  const common = { host, token, now };
  if (!remote) return { action: 'push', ...(await pushProject(folder, ref, dir, common, hooks)) };
  if (remote.formatVersion > 1) throw new ProjectError('newer-format');
  const localId = state?.projectId ?? manifestOf(readJson(path.join(dir, 'project.json')))?.id;
  const sameProject = !localId || localId === remote.projectId;
  const remoteNew = !state || remote.rev > state.baseRev;
  const clash = !sameProject || (!state && existsSync(path.join(dir, 'project.json')));
  if (clash || (dirty && remoteNew)) {
    if (!resolution)
      return {
        conflict: {
          kind: sameProject ? 'both' : 'ref-taken',
          ...(await conflictImpact(folder, ref, dir)),
        },
      };
    if (resolution === 'later') return { action: 'later' };
    if (held) throw new ProjectError('in-use-local');
    if (resolution === 'mine') {
      const forced = { ...common, backup: true };
      if (!sameProject) await takeOver(dir, remote);
      return { action: 'push', ...(await pushProject(folder, ref, dir, forced, hooks)) };
    }
    const copy = await keepLocalCopy(root, dir, ref, now);
    rmSync(path.join(dir, '.sync.json'), { force: true });
    const out = await pullProject(folder, ref, dir, { now }, hooks);
    return { action: 'pull', copy: copy.ref, ...out };
  }
  if (remoteNew) {
    if (held) throw new ProjectError('in-use-local');
    return { action: 'pull', ...(await pullProject(folder, ref, dir, { now }, hooks)) };
  }
  if (dirty) return { action: 'push', ...(await pushProject(folder, ref, dir, common, hooks)) };
  writeState(dir, { ...state, lastSync: now });
  return { action: 'none', rev: state.baseRev };
}

/** «Subir la mía» sobre un proyecto distinto con la misma ruta: adopta la identidad remota para no chocar. */
async function takeOver(dir, remote) {
  const state = readState(dir);
  if (state) writeState(dir, { ...state, projectId: remote.projectId });
  else
    writeState(dir, {
      projectId: remote.projectId,
      baseRev: remote.rev,
      files: {},
      paused: false,
      lastSync: 0,
    });
}
