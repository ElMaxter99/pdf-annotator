// Exportar e importar proyectos (fase 2): un ZIP `.pdfannotator` versionado.
//   manifest.json          formato, versión, app, fecha y huella SHA-256 de cada archivo
//   project.json           nombre, fechas y subcarpeta sugerida (sin id: al importar nace uno nuevo)
//   batch/<id>.json        metadatos y anotaciones de cada PDF
//   batch/<id>.a.pdf · .b.pdf   PDF original (A) y versión nueva (B, opcional)
// El archivo es no confiable: se revisa entero (rutas, tipos, tamaños, huellas) antes de escribir nada, y se
// escribe en una carpeta temporal que solo se mueve a su sitio si todo salió bien.
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';
import {
  ITEM_ID,
  LIMITS,
  MAX_NAME,
  ProjectError,
  lockState,
  readJson,
  resolveRef,
  safeSegments,
  summarize,
  writeAtomic,
} from './projects.mjs';

export const ARCHIVE_FORMAT = 'pdf-annotator-project';
export const ARCHIVE_VERSION = 1;
export const ARCHIVE_EXT = '.pdfannotator';
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const BACKUP_SUFFIX = '-antes-de-importar';

/** Cede el turno al bucle de eventos: la ventana sigue viva y llegan el progreso y «Cancelar». */
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function dosTime(ms) {
  const d = new Date(ms);
  const year = Math.min(Math.max(d.getFullYear(), 1980), 2107);
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function writeAll(fd, buffer) {
  let offset = 0;
  while (offset < buffer.length) offset += writeSync(fd, buffer, offset, buffer.length - offset);
}

/** Escritor de ZIP mínimo (sin ZIP64: el tope de 2 GB por proyecto cabe de sobra). */
class ZipWriter {
  constructor(file) {
    this.fd = openSync(file, 'w');
    this.pos = 0;
    this.entries = [];
  }

  write(buffer) {
    writeAll(this.fd, buffer);
    this.pos += buffer.length;
  }

  add(name, data, { deflate = false, mtime = Date.now() } = {}) {
    const raw = Buffer.from(data);
    const nameBuf = Buffer.from(name, 'utf8');
    let body = raw;
    let method = 0;
    if (deflate) {
      const packed = deflateRawSync(raw);
      if (packed.length < raw.length) {
        body = packed;
        method = 8;
      }
    }
    const crc = crc32(raw) >>> 0;
    const { time, date } = dosTime(mtime);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(SIG_LOCAL, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(method, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const offset = this.pos;
    this.write(head);
    this.write(nameBuf);
    this.write(body);
    this.entries.push({
      nameBuf,
      crc,
      method,
      time,
      date,
      csize: body.length,
      usize: raw.length,
      offset,
    });
  }

  finish() {
    const start = this.pos;
    for (const e of this.entries) {
      const head = Buffer.alloc(46);
      head.writeUInt32LE(SIG_CENTRAL, 0);
      head.writeUInt16LE(20, 4);
      head.writeUInt16LE(20, 6);
      head.writeUInt16LE(0x0800, 8);
      head.writeUInt16LE(e.method, 10);
      head.writeUInt16LE(e.time, 12);
      head.writeUInt16LE(e.date, 14);
      head.writeUInt32LE(e.crc, 16);
      head.writeUInt32LE(e.csize, 20);
      head.writeUInt32LE(e.usize, 24);
      head.writeUInt16LE(e.nameBuf.length, 28);
      head.writeUInt32LE(e.offset, 42);
      this.write(head);
      this.write(e.nameBuf);
    }
    const size = this.pos - start;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_EOCD, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(start, 16);
    this.write(end);
    closeSync(this.fd);
    this.fd = -1;
  }

  abort() {
    if (this.fd >= 0) {
      try {
        closeSync(this.fd);
      } catch {
        /* ya cerrado */
      }
      this.fd = -1;
    }
  }
}

const throwIfCanceled = (hooks) => {
  if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
};

/** PDFs del lote de un proyecto, ordenados por id: `{ id, a, b }` con las rutas de los archivos. */
function listItemFiles(dir) {
  const batch = path.join(dir, 'batch');
  if (!existsSync(batch)) return [];
  const items = [];
  for (const entry of readdirSync(batch).sort()) {
    if (!entry.endsWith('.json')) continue;
    const id = entry.slice(0, -5);
    if (!ITEM_ID.test(id)) continue;
    const a = path.join(batch, `${id}.a.pdf`);
    if (!existsSync(a)) continue;
    const b = path.join(batch, `${id}.b.pdf`);
    items.push({ id, json: path.join(batch, entry), a, b: existsSync(b) ? b : null });
  }
  return items;
}

/** Recuento y peso de lo que se llevaría un archivo exportado (para el diálogo de exportar). */
export function exportInfo(dir) {
  const items = listItemFiles(dir);
  let bytesA = 0;
  let bytesB = 0;
  let bytesMeta = 0;
  let pdfsB = 0;
  for (const item of items) {
    bytesA += statSync(item.a).size;
    bytesMeta += statSync(item.json).size;
    if (item.b) {
      pdfsB += 1;
      bytesB += statSync(item.b).size;
    }
  }
  return { pdfsA: items.length, pdfsB, bytesA, bytesB, bytesMeta };
}

/**
 * Empaqueta un proyecto en `file`. Se escribe en `file.part` y solo se renombra al terminar: si algo falla
 * o se cancela, no queda un archivo a medias.
 */
export async function exportProject(dir, file, options = {}, hooks = {}) {
  const { includeB = true, appVersion = '', now = Date.now() } = options;
  const items = listItemFiles(dir);
  if (!items.length) throw new ProjectError('empty');
  const project = readJson(path.join(dir, 'project.json'));
  if (!project || typeof project.name !== 'string') throw new ProjectError('not-a-project');
  const total = items.reduce((n, item) => n + 1 + (includeB && item.b ? 1 : 0), 0);
  const tmp = `${file}.part`;
  const zip = new ZipWriter(tmp);
  const files = [];
  let done = 0;
  const put = (name, bytes, opts) => {
    zip.add(name, bytes, opts);
    files.push({ path: name, size: bytes.length, sha256: sha256(bytes) });
  };
  try {
    put(
      'project.json',
      Buffer.from(
        JSON.stringify({
          v: 1,
          name: String(project.name).slice(0, MAX_NAME),
          createdAt: Number.isFinite(project.createdAt) ? project.createdAt : now,
          updatedAt: Number.isFinite(project.updatedAt) ? project.updatedAt : now,
          ref: typeof options.ref === 'string' ? options.ref : '',
        }),
      ),
      { deflate: true, mtime: now },
    );
    hooks.onProgress?.(0, total);
    for (const item of items) {
      throwIfCanceled(hooks);
      put(`batch/${item.id}.json`, readFileBytes(item.json), { deflate: true, mtime: now });
      put(`batch/${item.id}.a.pdf`, readFileBytes(item.a), { mtime: now });
      done += 1;
      hooks.onProgress?.(done, total);
      await tick();
      if (includeB && item.b) {
        throwIfCanceled(hooks);
        put(`batch/${item.id}.b.pdf`, readFileBytes(item.b), { mtime: now });
        done += 1;
        hooks.onProgress?.(done, total);
        await tick();
      }
    }
    const manifest = {
      format: ARCHIVE_FORMAT,
      formatVersion: ARCHIVE_VERSION,
      app: { name: 'PDF Annotator', version: String(appVersion).slice(0, 40) },
      exportedAt: now,
      files,
    };
    zip.add('manifest.json', Buffer.from(JSON.stringify(manifest)), { deflate: true, mtime: now });
    zip.finish();
    renameSync(tmp, file);
  } catch (error) {
    zip.abort();
    rmSync(tmp, { force: true });
    throw error;
  }
  return { bytes: statSync(file).size, pdfs: done };
}

function readFileBytes(file) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const out = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const n = readSync(fd, out, offset, size - offset, offset);
      if (!n) break;
      offset += n;
    }
    return out.subarray(0, offset);
  } finally {
    closeSync(fd);
  }
}

// ---------------------------------------------------------------- lectura

function readAt(fd, position, length) {
  const buffer = Buffer.alloc(length);
  let offset = 0;
  while (offset < length) {
    const n = readSync(fd, buffer, offset, length - offset, position + offset);
    if (!n) throw new ProjectError('corrupt');
    offset += n;
  }
  return buffer;
}

/** Lee el directorio central del ZIP. No fía de nada: cualquier cosa rara es «no es un archivo de proyecto». */
function readIndex(fd, size, maxEntries) {
  if (size < 22) throw new ProjectError('not-an-archive');
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = readAt(fd, size - tailLength, tailLength);
  let at = tail.length - 22;
  while (at >= 0 && tail.readUInt32LE(at) !== SIG_EOCD) at -= 1;
  if (at < 0) throw new ProjectError('not-an-archive');
  const total = tail.readUInt16LE(at + 10);
  const cdSize = tail.readUInt32LE(at + 12);
  const cdOffset = tail.readUInt32LE(at + 16);
  if (tail.readUInt16LE(at + 4) || tail.readUInt16LE(at + 6) || tail.readUInt16LE(at + 8) !== total)
    throw new ProjectError('corrupt');
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw new ProjectError('not-an-archive');
  if (total > maxEntries) throw new ProjectError('corrupt');
  if (cdOffset + cdSize > size) throw new ProjectError('corrupt');
  const cd = readAt(fd, cdOffset, cdSize);
  const entries = [];
  let p = 0;
  for (let n = 0; n < total; n += 1) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== SIG_CENTRAL) throw new ProjectError('corrupt');
    const flags = cd.readUInt16LE(p + 8);
    const nameLength = cd.readUInt16LE(p + 28);
    const extraLength = cd.readUInt16LE(p + 30);
    const commentLength = cd.readUInt16LE(p + 32);
    if (p + 46 + nameLength > cd.length) throw new ProjectError('corrupt');
    if (flags & 1) throw new ProjectError('corrupt');
    entries.push({
      name: cd.subarray(p + 46, p + 46 + nameLength).toString('utf8'),
      method: cd.readUInt16LE(p + 10),
      crc: cd.readUInt32LE(p + 16),
      csize: cd.readUInt32LE(p + 20),
      usize: cd.readUInt32LE(p + 24),
      offset: cd.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return { entries, cdOffset };
}

/** Descomprime y comprueba un archivo del ZIP (tamaño declarado, CRC); nunca más de `usize` bytes. */
function readEntry(fd, entry, cdOffset) {
  if (entry.method !== 0 && entry.method !== 8)
    throw new ProjectError('corrupt', undefined, entry.name);
  if (entry.csize > entry.usize + (entry.usize >> 6) + 1024)
    throw new ProjectError('corrupt', undefined, entry.name);
  const local = readAt(fd, entry.offset, 30);
  if (local.readUInt32LE(0) !== SIG_LOCAL) throw new ProjectError('corrupt', undefined, entry.name);
  const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  if (start + entry.csize > cdOffset) throw new ProjectError('corrupt', undefined, entry.name);
  const packed = readAt(fd, start, entry.csize);
  let bytes = packed;
  if (entry.method === 8) {
    try {
      bytes = inflateRawSync(packed, { maxOutputLength: entry.usize + 1 });
    } catch {
      throw new ProjectError('corrupt', undefined, entry.name);
    }
  }
  if (bytes.length !== entry.usize || crc32(bytes) >>> 0 !== entry.crc)
    throw new ProjectError('corrupt', undefined, entry.name);
  return bytes;
}

const NAME_RULE = /^batch\/([A-Za-z0-9_-]{1,64})\.(json|a\.pdf|b\.pdf)$/;

/** Clasifica el nombre de un archivo del ZIP; rutas que se salen o formas desconocidas se rechazan. */
function classify(name) {
  if (
    !name ||
    name.length > 200 ||
    name.includes('\\') ||
    name.includes('\0') ||
    name.startsWith('/') ||
    /^[A-Za-z]:/.test(name) ||
    name.split('/').some((part) => part === '..' || part === '.')
  )
    throw new ProjectError('unsafe', undefined, name.slice(0, 120));
  if (name === 'batch/') return { kind: 'dir' };
  if (name === 'manifest.json') return { kind: 'manifest' };
  if (name === 'project.json') return { kind: 'project' };
  const match = NAME_RULE.exec(name);
  if (!match) throw new ProjectError('corrupt', undefined, name.slice(0, 120));
  return { kind: match[2] === 'json' ? 'meta' : match[2] === 'a.pdf' ? 'a' : 'b', id: match[1] };
}

function parseJsonObject(bytes, name) {
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    /* cae abajo */
  }
  throw new ProjectError('corrupt', undefined, name);
}

const looksLikePdf = (bytes) => bytes.subarray(0, 1024).includes('%PDF-');

function readManifest(fd, index) {
  const entry = index.entries.find((e) => e.name === 'manifest.json');
  if (!entry) throw new ProjectError('not-an-archive');
  if (entry.usize > MAX_MANIFEST_BYTES) throw new ProjectError('corrupt', undefined, entry.name);
  const manifest = parseJsonObject(readEntry(fd, entry, index.cdOffset), entry.name);
  if (manifest.format !== ARCHIVE_FORMAT) throw new ProjectError('not-an-archive');
  if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion < 1)
    throw new ProjectError('corrupt', undefined, 'manifest.json');
  if (manifest.formatVersion > ARCHIVE_VERSION)
    throw new ProjectError('newer-format', undefined, String(manifest.formatVersion));
  if (!Array.isArray(manifest.files)) throw new ProjectError('corrupt', undefined, 'manifest.json');
  const hashes = new Map();
  for (const f of manifest.files) {
    if (
      !f ||
      typeof f.path !== 'string' ||
      !Number.isInteger(f.size) ||
      typeof f.sha256 !== 'string' ||
      hashes.has(f.path)
    )
      throw new ProjectError('corrupt', undefined, 'manifest.json');
    hashes.set(f.path, f);
  }
  return {
    hashes,
    appVersion: typeof manifest.app?.version === 'string' ? manifest.app.version.slice(0, 40) : '',
    exportedAt: Number.isFinite(manifest.exportedAt) ? manifest.exportedAt : 0,
  };
}

/**
 * Revisa un archivo `.pdfannotator` de principio a fin y llama a `visit(entry, bytes)` por cada archivo
 * comprobado (los PDFs de más de 40 MB no se leen: van en `oversize`). No escribe nada en el disco.
 */
export async function scanArchive(file, { limits = LIMITS } = {}, hooks = {}, visit) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const index = readIndex(fd, size, 3000);
    const manifest = readManifest(fd, index);
    const seen = new Set();
    const items = new Map();
    let project = null;
    for (const entry of index.entries) {
      const meta = classify(entry.name);
      if (seen.has(entry.name)) throw new ProjectError('corrupt', undefined, entry.name);
      seen.add(entry.name);
      if (meta.kind === 'dir' || meta.kind === 'manifest') continue;
      const known = manifest.hashes.get(entry.name);
      if (!known || known.size !== entry.usize)
        throw new ProjectError('corrupt', undefined, entry.name);
      entry.kind = meta.kind;
      entry.id = meta.id;
      if (meta.kind === 'project') {
        project = entry;
        continue;
      }
      const item = items.get(meta.id) ?? {};
      item[meta.kind] = entry;
      items.set(meta.id, item);
    }
    for (const name of manifest.hashes.keys()) {
      if (!seen.has(name)) throw new ProjectError('corrupt', undefined, name);
    }
    if (!project) throw new ProjectError('corrupt', undefined, 'project.json');
    for (const [id, item] of items) {
      if (!item.meta || !item.a) throw new ProjectError('corrupt', undefined, id);
    }
    const bytes = index.entries.reduce((n, e) => n + e.usize, 0);
    if (items.size > limits.maxPdfs)
      throw new ProjectError('too-many-pdfs', undefined, { pdfs: items.size, bytes });
    if (bytes > limits.maxBytes)
      throw new ProjectError('too-big', undefined, { pdfs: items.size, bytes });

    const isOversize = (e) => e && e.usize > limits.maxPdfBytes;
    const oversize = [];
    const skippedItems = new Set();
    for (const [id, item] of items) {
      if (isOversize(item.a)) skippedItems.add(id);
    }
    const toRead = index.entries.filter((e) => {
      if (!e.kind) return false;
      if (e.kind === 'a' || e.kind === 'b') return !isOversize(e) && !skippedItems.has(e.id);
      return true;
    });
    const metaOf = new Map();
    let done = 0;
    hooks.onProgress?.(0, toRead.length);
    for (const entry of toRead) {
      throwIfCanceled(hooks);
      if (entry.kind !== 'a' && entry.kind !== 'b' && entry.usize > MAX_JSON_BYTES)
        throw new ProjectError('corrupt', undefined, entry.name);
      const data = readEntry(fd, entry, index.cdOffset);
      const known = manifest.hashes.get(entry.name);
      if (sha256(data) !== known.sha256) throw new ProjectError('corrupt', undefined, entry.name);
      if (entry.kind === 'a' || entry.kind === 'b') {
        if (!looksLikePdf(data)) throw new ProjectError('corrupt', undefined, entry.name);
      } else {
        const parsed = parseJsonObject(data, entry.name);
        if (entry.kind === 'meta') metaOf.set(entry.id, parsed);
        if (entry.kind === 'project') {
          if (typeof parsed.name !== 'string' || !parsed.name.trim())
            throw new ProjectError('corrupt', undefined, entry.name);
          project.parsed = parsed;
        }
      }
      // Los metadatos de un PDF que se deja fuera se leen (para poder nombrarlo) pero no se entregan.
      if (!(entry.kind === 'meta' && skippedItems.has(entry.id))) visit?.(entry, data);
      done += 1;
      hooks.onProgress?.(done, toRead.length);
      await tick();
    }
    for (const [id, item] of items) {
      const name =
        typeof metaOf.get(id)?.name === 'string' ? metaOf.get(id).name.slice(0, 120) : id;
      if (isOversize(item.a)) oversize.push({ id, name, which: 'a', bytes: item.a.usize });
      else if (isOversize(item.b)) oversize.push({ id, name, which: 'b', bytes: item.b.usize });
    }
    const p = project.parsed;
    return {
      formatVersion: ARCHIVE_VERSION,
      appVersion: manifest.appVersion,
      exportedAt: manifest.exportedAt,
      name: String(p.name).trim().slice(0, MAX_NAME),
      ref: typeof p.ref === 'string' ? safeSegments(p.ref).join('/') : '',
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : 0,
      pdfsA: items.size - skippedItems.size,
      pdfsB: [...items.values()].filter((i) => i.b && !isOversize(i.b) && !isOversize(i.a)).length,
      bytes,
      ids: [...items.keys()],
      oversize,
      skippedItems,
    };
  } finally {
    closeSync(fd);
  }
}

/** Para el diálogo de importar: qué trae el archivo, ya comprobado. No escribe nada. */
export async function inspectArchive(file, options = {}, hooks = {}) {
  const info = await scanArchive(file, options, hooks);
  const { skippedItems, ...rest } = info;
  return { ...rest, skippedCount: skippedItems.size };
}

/** Qué se perdería al reemplazar `dir` por lo que trae el archivo (para la confirmación). */
export function replaceImpact(dir, info) {
  const inArchive = new Set(info.ids);
  let onlyHere = 0;
  let changedAfter = 0;
  for (const item of listItemFiles(dir)) {
    if (!inArchive.has(item.id)) onlyHere += 1;
    else if (statSync(item.json).mtimeMs > info.exportedAt) changedAfter += 1;
  }
  return { onlyHere, changedAfter };
}

function freeRef(root, segments, suffix) {
  const parents = segments.slice(0, -1);
  const last = segments[segments.length - 1];
  for (let n = 1; n < 100; n += 1) {
    const candidate = [...parents, `${last}${suffix}${n > 1 ? `-${n}` : ''}`];
    const { dir } = resolveRef(root, candidate.join('/'));
    if (!existsSync(dir)) return { dir, ref: candidate.join('/'), n };
  }
  throw new ProjectError('exists');
}

/**
 * Importa un archivo `.pdfannotator` como proyecto. `mode`: `'copy'` (carpeta y nombre nuevos si ya existe)
 * o `'replace'` (aparta antes el proyecto actual en «…-antes-de-importar»). Sin `mode` y con un proyecto igual,
 * devuelve `{ conflict }` para que la persona decida. Todo se escribe en una carpeta temporal.
 */
export async function importArchive(file, root, options = {}, hooks = {}) {
  const { token = '', mode, skipOversize = false, limits = LIMITS, now = Date.now() } = options;
  const title = String(options.name ?? '')
    .trim()
    .slice(0, MAX_NAME);
  if (!title) throw new ProjectError('bad-name');
  const base = path.resolve(root);
  if (!existsSync(base)) throw new ProjectError('root-missing');
  const wanted = safeSegments(options.subpath);
  const segments = wanted.length ? wanted : safeSegments(title.replace(/[\\/]+/g, ' ')).slice(0, 1);
  if (!segments.length) throw new ProjectError('bad-name');
  for (let n = 1; n < segments.length; n += 1) {
    if (existsSync(path.join(resolveRef(base, segments.slice(0, n).join('/')).dir, 'project.json')))
      throw new ProjectError('bad-ref');
  }
  let target = resolveRef(base, segments.join('/'));
  let projectName = title;
  const exists = existsSync(path.join(target.dir, 'project.json'));
  if (exists && !mode) {
    return {
      conflict: {
        ...summarize(base, target.dir, target.ref, token),
        ref: target.ref,
      },
    };
  }
  if (exists && mode === 'copy') {
    const free = freeRef(base, segments, '');
    target = free;
    projectName = `${title} (${free.n})`.slice(0, MAX_NAME + 6);
  } else if (!exists) {
    // La carpeta puede existir sin ser un proyecto: se escribe dentro de ella solo si está vacía.
    if (existsSync(target.dir) && readdirSync(target.dir).length) throw new ProjectError('exists');
  }
  if (exists && mode === 'replace') {
    const lock = lockState(target.dir, token, now);
    if (lock.state === 'other') throw new ProjectError('in-use', undefined, lock.host);
  }

  const staging = path.join(base, `.import-${randomUUID()}`);
  let backup = null;
  try {
    mkdirSync(path.join(staging, 'batch'), { recursive: true });
    const skipped = [];
    const info = await scanArchive(file, { limits }, hooks, (entry, data) => {
      if (entry.kind === 'project') return;
      writeFileSync(path.join(staging, entry.name), data);
    });
    // Los PDFs de más de 40 MB no se leen ni se escriben; sin permiso para dejarlos fuera, se avisa.
    if (info.oversize.length && !skipOversize)
      throw new ProjectError('pdf-too-big', undefined, info.oversize);
    // Un PDF A demasiado grande deja fuera todo el PDF: sus metadatos tampoco se leyeron ni se escribieron.
    skipped.push(...info.oversize);
    const manifestFile = {
      v: 1,
      id: randomUUID(),
      name: projectName,
      createdAt: info.createdAt || now,
      updatedAt: now,
    };
    writeAtomic(path.join(staging, 'project.json'), JSON.stringify(manifestFile, null, 2));
    throwIfCanceled(hooks);

    mkdirSync(path.dirname(target.dir), { recursive: true });
    if (exists && mode === 'replace') {
      backup = freeRef(base, segments, BACKUP_SUFFIX);
      renameSync(target.dir, backup.dir);
      const old = readJson(path.join(backup.dir, 'project.json'));
      if (old && typeof old.name === 'string') {
        writeAtomic(
          path.join(backup.dir, 'project.json'),
          JSON.stringify(
            { ...old, name: `${old.name} (antes de importar)`.slice(0, 100) },
            null,
            2,
          ),
        );
      }
      rmSync(path.join(backup.dir, '.lock'), { force: true });
    }
    renameSync(staging, target.dir);
    return {
      project: summarize(base, target.dir, target.ref, token),
      skipped,
      backup: backup ? backup.ref : null,
    };
  } catch (error) {
    if (backup && !existsSync(target.dir)) {
      try {
        renameSync(backup.dir, target.dir);
      } catch {
        /* la copia de seguridad queda donde está */
      }
    }
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function isArchiveFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
