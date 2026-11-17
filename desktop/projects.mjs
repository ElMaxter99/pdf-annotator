// Proyectos locales (fase 1): carpeta visible en el disco, un subdirectorio por proyecto.
//   <raíz>/<subruta>/project.json        nombre, id y fechas
//   <raíz>/<subruta>/batch/<id>.json     metadatos de cada PDF del lote
//   <raíz>/<subruta>/batch/<id>.a.pdf    PDF original (A)  ·  <id>.b.pdf  versión nueva (B)
//   <raíz>/<subruta>/.lock               equipo que lo tiene abierto (un solo editor a la vez)
// Todo lo que llega del renderizador se trata como no confiable: las rutas se validan contra la raíz.
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

export const LIMITS = Object.freeze({
  maxPdfs: 200,
  maxBytes: 2 * 1024 * 1024 * 1024,
  warnPdfs: 100,
  warnBytes: 1024 * 1024 * 1024,
  maxPdfBytes: 40 * 1024 * 1024,
});
/** El bloqueo se renueva cada minuto y caduca a los 10 sin señales. */
export const LOCK_STALE_MS = 10 * 60 * 1000;
const MAX_DEPTH = 3;
const MAX_NAME = 80;
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export class ProjectError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/** «Álvaro/Cliente 1» → ['Álvaro', 'Cliente 1'], sin `..`, barras ni caracteres que Windows rechaza. */
export function safeSegments(input) {
  const parts = String(input ?? '')
    .split(/[\\/]+/)
    .map((part) =>
      part
        .replace(/[<>:"|?*\u0000-\u001f]/g, '')
        .replace(/[. ]+$/g, '')
        .trim()
        .slice(0, MAX_NAME),
    )
    .filter((part) => part && part !== '.' && part !== '..');
  return parts.slice(0, MAX_DEPTH);
}

/** Resuelve una referencia (ruta relativa con «/») dentro de la raíz; lanza si se sale. */
export function resolveRef(root, ref) {
  const segments = safeSegments(ref);
  if (
    !segments.length ||
    segments.join('/') !==
      String(ref)
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
  ) {
    throw new ProjectError('bad-ref');
  }
  const base = path.resolve(root);
  const dir = path.resolve(base, ...segments);
  if (dir !== base && !dir.startsWith(base + path.sep)) throw new ProjectError('bad-ref');
  return { dir, ref: segments.join('/') };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

function manifestOf(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string'
  )
    return null;
  const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
  return {
    id: value.id.slice(0, 64),
    name: value.name.slice(0, MAX_NAME),
    createdAt: num(value.createdAt),
    updatedAt: num(value.updatedAt),
  };
}

export function stats(dir) {
  let pdfs = 0;
  let bytes = 0;
  let done = 0;
  const batch = path.join(dir, 'batch');
  if (!existsSync(batch)) return { pdfs, bytes, done };
  for (const entry of readdirSync(batch)) {
    const full = path.join(batch, entry);
    if (entry.endsWith('.a.pdf')) {
      pdfs += 1;
      bytes += statSync(full).size;
    } else if (entry.endsWith('.b.pdf')) {
      bytes += statSync(full).size;
    } else if (entry.endsWith('.json')) {
      if (readJson(full)?.status === 'ready') done += 1;
    }
  }
  return { pdfs, bytes, done };
}

export function lockState(dir, token, now = Date.now()) {
  const lock = readJson(path.join(dir, '.lock'));
  if (!lock || typeof lock.host !== 'string' || typeof lock.token !== 'string')
    return { state: 'free' };
  const seen = typeof lock.seen === 'number' ? lock.seen : 0;
  if (lock.token === token) return { state: 'mine', host: lock.host, since: lock.since, seen };
  if (now - seen > LOCK_STALE_MS) return { state: 'free', stale: { host: lock.host, seen } };
  return { state: 'other', host: lock.host.slice(0, 80), since: lock.since, seen };
}

export function summarize(root, dir, ref, token) {
  const manifest = manifestOf(readJson(path.join(dir, 'project.json')));
  if (!manifest) return null;
  return { ref, ...manifest, ...stats(dir), lock: lockState(dir, token) };
}

/** Busca proyectos (carpetas con `project.json`) hasta tres niveles bajo la raíz. */
export function listProjects(root, token) {
  const base = path.resolve(root);
  if (!existsSync(base)) throw new ProjectError('root-missing');
  const found = [];
  const walk = (dir, segments) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (segments.length && existsSync(path.join(dir, 'project.json'))) {
      const summary = summarize(base, dir, segments.join('/'), token);
      if (summary) found.push(summary);
      return;
    }
    if (segments.length >= MAX_DEPTH) return;
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        walk(path.join(dir, entry.name), [...segments, entry.name]);
    }
  };
  walk(base, []);
  return found.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function createProject(root, name, subpath, now = Date.now()) {
  const title = String(name ?? '')
    .trim()
    .slice(0, MAX_NAME);
  if (!title) throw new ProjectError('bad-name');
  const base = path.resolve(root);
  if (!existsSync(base)) throw new ProjectError('root-missing');
  const parent = safeSegments(subpath);
  const slug = safeSegments(title.replace(/[\\/]+/g, ' '))[0] ?? '';
  if (!slug) throw new ProjectError('bad-name');
  const segments = parent.length ? [...parent] : [];
  // «Álvaro/cliente4» como subcarpeta: el último tramo es la carpeta del proyecto; sin subcarpeta, el nombre.
  if (!segments.length) segments.push(slug);
  const { dir, ref } = resolveRef(base, segments.join('/'));
  if (existsSync(path.join(dir, 'project.json'))) throw new ProjectError('exists');
  mkdirSync(path.join(dir, 'batch'), { recursive: true });
  const manifest = { v: 1, id: randomUUID(), name: title, createdAt: now, updatedAt: now };
  writeAtomic(path.join(dir, 'project.json'), JSON.stringify(manifest, null, 2));
  return {
    ref,
    id: manifest.id,
    name: title,
    createdAt: now,
    updatedAt: now,
    pdfs: 0,
    bytes: 0,
    done: 0,
    lock: { state: 'free' },
  };
}

export function acquireLock(dir, host, token, { force = false, now = Date.now() } = {}) {
  const current = lockState(dir, token, now);
  if (current.state === 'other' && !force) return { ok: false, holder: current };
  const previous = current.state === 'mine' ? current.since : now;
  writeAtomic(
    path.join(dir, '.lock'),
    JSON.stringify({ host: String(host).slice(0, 80), token, since: previous, seen: now }),
  );
  return { ok: true };
}

/** Renueva el bloqueo; devuelve `false` si otro equipo lo tomó (el editor pasa a solo lectura). */
export function renewLock(dir, host, token, now = Date.now()) {
  const current = lockState(dir, token, now);
  if (current.state === 'other') return false;
  return acquireLock(dir, host, token, { now }).ok;
}

export function releaseLock(dir, token) {
  const lock = readJson(path.join(dir, '.lock'));
  if (lock?.token === token) rmSync(path.join(dir, '.lock'), { force: true });
}

export function readItems(dir) {
  const batch = path.join(dir, 'batch');
  if (!existsSync(batch)) return [];
  const items = [];
  for (const entry of readdirSync(batch)) {
    if (!entry.endsWith('.json')) continue;
    const id = entry.slice(0, -5);
    if (!ITEM_ID.test(id)) continue;
    const meta = readJson(path.join(batch, entry));
    const aFile = path.join(batch, `${id}.a.pdf`);
    if (!meta || typeof meta !== 'object' || !existsSync(aFile)) continue;
    const bFile = path.join(batch, `${id}.b.pdf`);
    items.push({
      id,
      meta,
      a: readFileSync(aFile),
      b: existsSync(bFile) ? readFileSync(bFile) : null,
    });
  }
  return items;
}

/** Guarda un PDF del lote. `a`/`b` son bytes o `undefined` (no se toca) o `null` (B quitada). Aplica el tope. */
export function writeItem(dir, id, meta, { a, b } = {}) {
  if (!ITEM_ID.test(String(id))) throw new ProjectError('bad-item');
  const batch = path.join(dir, 'batch');
  mkdirSync(batch, { recursive: true });
  for (const bytes of [a, b]) {
    if (bytes && bytes.byteLength > LIMITS.maxPdfBytes) throw new ProjectError('pdf-too-big');
  }
  const aFile = path.join(batch, `${id}.a.pdf`);
  const isNew = !existsSync(aFile);
  const current = stats(dir);
  const added = (a?.byteLength ?? 0) + (b?.byteLength ?? 0);
  if (isNew && current.pdfs >= LIMITS.maxPdfs) throw new ProjectError('too-many-pdfs');
  if (current.bytes + added > LIMITS.maxBytes) throw new ProjectError('too-big');
  if (a) writeAtomic(aFile, Buffer.from(a));
  else if (isNew) throw new ProjectError('bad-item');
  const bFile = path.join(batch, `${id}.b.pdf`);
  if (b) writeAtomic(bFile, Buffer.from(b));
  else if (b === null) rmSync(bFile, { force: true });
  writeAtomic(path.join(batch, `${id}.json`), JSON.stringify(meta));
  touch(dir);
}

export function removeItem(dir, id) {
  if (!ITEM_ID.test(String(id))) throw new ProjectError('bad-item');
  const batch = path.join(dir, 'batch');
  for (const suffix of ['.json', '.a.pdf', '.b.pdf'])
    rmSync(path.join(batch, `${id}${suffix}`), { force: true });
  touch(dir);
}

export function renameProject(dir, name, now = Date.now()) {
  const title = String(name ?? '')
    .trim()
    .slice(0, MAX_NAME);
  const manifest = readJson(path.join(dir, 'project.json'));
  if (!title || !manifestOf(manifest)) throw new ProjectError('bad-name');
  writeAtomic(
    path.join(dir, 'project.json'),
    JSON.stringify({ ...manifest, name: title, updatedAt: now }, null, 2),
  );
}

function touch(dir, now = Date.now()) {
  const file = path.join(dir, 'project.json');
  const manifest = readJson(file);
  if (manifestOf(manifest))
    writeAtomic(file, JSON.stringify({ ...manifest, updatedAt: now }, null, 2));
}

/** Quita solo lo que la app creó (`project.json`, `batch/`, `.lock`); no borra carpetas con otros archivos. */
export function forgetProject(dir) {
  rmSync(path.join(dir, 'project.json'), { force: true });
  rmSync(path.join(dir, '.lock'), { force: true });
}
