// Proveedores de la «carpeta de encuentro» de la sincronización (fases 3 y 3b): una carpeta del equipo (que sincroniza
// Drive, OneDrive, la red…) o un servidor SFTP. El motor (`project-sync.mjs`) solo habla con esta interfaz, con rutas
// relativas a la base del proveedor y separadas por «/»:
//   reachable() · readJson(rel) · writeAtomic(rel, text) · createExclusive(rel, text) · stat(rel) · list(rel)
//   upload(localAbs, rel, hooks) · download(rel, localAbs, hooks, { expectSha }) · rename(from, to) · remove(rel)
//   mkdirp(rel) · free() · now() · lockAge(rel) · probeWrite() · close()
// Todo lo que viene del otro lado es no confiable: se limita el tamaño de lo que se lee y las rutas no pueden salirse de la base.
import { createHash } from 'node:crypto';
import {
  createReadStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { copyFile, rename as renameFile } from 'node:fs/promises';
import path from 'node:path';
import { ProjectError } from './projects.mjs';

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** `a/b/../c` o rutas absolutas se rechazan: la base nunca se abandona. */
export function segmentsOf(rel) {
  const parts = String(rel ?? '')
    .split('/')
    .filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..' || part.includes('\\') || part.includes('\0')))
    throw new ProjectError('bad-ref');
  return parts;
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function parseJson(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return null;
  }
}

// ───────────── Carpeta del equipo ─────────────

export function localProvider(base, { clock = Date.now } = {}) {
  const root = path.resolve(base);
  const abs = (rel) => {
    const full = path.resolve(root, ...segmentsOf(rel));
    if (full !== root && !full.startsWith(root + path.sep)) throw new ProjectError('bad-ref');
    return full;
  };
  const mkdirpFor = (file) => mkdirSync(path.dirname(file), { recursive: true });
  return {
    kind: 'folder',
    label: root,
    exclusiveLocks: false,
    conflictCopies: true,
    async reachable() {
      try {
        return statSync(root).isDirectory();
      } catch {
        return false;
      }
    },
    async readJson(rel) {
      try {
        const file = abs(rel);
        if (statSync(file).size > MAX_JSON_BYTES) return null;
        return parseJson(readFileSync(file));
      } catch (error) {
        if (error instanceof ProjectError) throw error;
        return null;
      }
    },
    async writeAtomic(rel, text) {
      const file = abs(rel);
      mkdirpFor(file);
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, text);
      await renameFile(tmp, file);
    },
    async createExclusive(rel, text) {
      const file = abs(rel);
      mkdirpFor(file);
      try {
        writeFileSync(file, text, { flag: 'wx' });
        return true;
      } catch (error) {
        if (error?.code === 'EEXIST') return false;
        throw error;
      }
    },
    async stat(rel) {
      try {
        const stat = statSync(abs(rel));
        return { size: stat.size, mtime: Math.round(stat.mtimeMs), isDir: stat.isDirectory() };
      } catch (error) {
        if (error instanceof ProjectError) throw error;
        return null;
      }
    },
    async list(rel) {
      try {
        return readdirSync(abs(rel), { withFileTypes: true }).map((entry) => ({
          name: entry.name,
          isDir: entry.isDirectory(),
        }));
      } catch (error) {
        if (error instanceof ProjectError) throw error;
        return [];
      }
    },
    async upload(localAbs, rel, hooks) {
      if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
      const dest = abs(rel);
      mkdirpFor(dest);
      const part = `${dest}.part`;
      try {
        await copyFile(localAbs, part);
        await renameFile(part, dest);
      } catch (error) {
        rmSync(part, { force: true });
        throw mapLocalError(error, rel);
      }
      hooks?.onBytes?.(statSync(dest).size);
      await tick();
    },
    async download(rel, localAbs, hooks, { expectSha } = {}) {
      if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
      mkdirSync(path.dirname(localAbs), { recursive: true });
      const part = `${localAbs}.part`;
      try {
        await copyFile(abs(rel), part);
        if (expectSha && (await sha256File(part)) !== expectSha)
          throw new ProjectError('remote-incomplete', undefined, path.basename(rel));
        await renameFile(part, localAbs);
      } catch (error) {
        rmSync(part, { force: true });
        throw mapLocalError(error, rel);
      }
      hooks?.onBytes?.(statSync(localAbs).size);
      await tick();
    },
    async rename(from, to) {
      mkdirpFor(abs(to));
      await renameFile(abs(from), abs(to));
    },
    async remove(rel) {
      rmSync(abs(rel), { force: true });
    },
    async mkdirp(rel) {
      mkdirSync(abs(rel), { recursive: true });
    },
    async free() {
      try {
        const fs = statfsSync(root);
        return Number(fs.bavail) * Number(fs.bsize);
      } catch {
        return null;
      }
    },
    now: () => clock(),
    async lockAge() {
      return null;
    },
    /** Comprueba que se puede escribir y renombrar en la base. */
    async probeWrite() {
      const probe = `.pdfannotator-${createHash('sha1').update(String(Math.random())).digest('hex').slice(0, 8)}`;
      try {
        writeFileSync(abs(probe), 'ok');
        await renameFile(abs(probe), abs(`${probe}.2`));
        rmSync(abs(`${probe}.2`), { force: true });
      } catch {
        rmSync(abs(probe), { force: true });
        throw new ProjectError('folder-readonly');
      }
    },
    async close() {},
  };
}

function mapLocalError(error, rel) {
  if (error instanceof ProjectError) return error;
  if (error?.code === 'ENOENT')
    return new ProjectError('remote-incomplete', undefined, path.posix.basename(rel));
  if (['EIO', 'ETIMEDOUT', 'EBUSY', 'EAGAIN', 'UNKNOWN'].includes(error?.code))
    return new ProjectError('cloud-pending', undefined, path.posix.basename(rel));
  return error;
}

// ───────────── Servidor SFTP ─────────────

const SFTP_NO_SUCH_FILE = 2;
const SFTP_PERMISSION_DENIED = 3;
const rawCall = (fn) =>
  new Promise((resolve, reject) => fn((error, value) => (error ? reject(error) : resolve(value))));

/** Mensajes de ssh2 y del sistema cuando la conexión se cae a mitad de algo. */
const CONNECTION_GONE =
  /ECONNRESET|EPIPE|ENOTCONN|ETIMEDOUT|No response from server|Not connected|closed|ended|timed out|Channel/i;

function mapSftpError(error, rel) {
  if (error instanceof ProjectError) return error;
  const name = rel ? path.posix.basename(rel) : undefined;
  if (error?.code === SFTP_PERMISSION_DENIED) return new ProjectError('folder-readonly');
  if (error?.code === SFTP_NO_SUCH_FILE)
    return new ProjectError('remote-incomplete', undefined, name);
  if (/no space|quota|disk full/i.test(String(error?.message)))
    return new ProjectError('disk-full', undefined, '0');
  if (CONNECTION_GONE.test(`${error?.code ?? ''} ${error?.message ?? ''}`))
    return new ProjectError('connection-lost');
  return error;
}

/** Huella al estilo OpenSSH: `SHA256:` + base64 sin relleno. */
export function fingerprintOf(keyBuffer) {
  return `SHA256:${createHash('sha256').update(keyBuffer).digest('base64').replace(/=+$/, '')}`;
}

export function keyTypeOf(keyBuffer) {
  try {
    const length = keyBuffer.readUInt32BE(0);
    return keyBuffer
      .subarray(4, 4 + length)
      .toString('ascii')
      .slice(0, 40);
  } catch {
    return '';
  }
}

/**
 * Proveedor sobre una sesión SFTP ya abierta (`ssh2`). `client` se cierra con `close()`.
 * `offset` es la diferencia entre el reloj del servidor y el de este equipo (para caducar los bloqueos con la hora del servidor).
 */
export function sftpProvider({ client, sftp, base, label, offset = 0 }) {
  // Con la conexión caída ssh2 no responde a lo pendiente: toda llamada compite con el cierre.
  const closed = new Promise((resolve) => {
    if (client?.__closed) resolve();
    else client?.once?.('close', resolve);
  });
  const call = (fn) =>
    Promise.race([
      rawCall(fn),
      closed.then(() => {
        throw new ProjectError('connection-lost');
      }),
    ]);
  const full = (rel) => {
    const parts = segmentsOf(rel);
    return path.posix.join(base, ...parts);
  };
  const stat = async (rel) => {
    try {
      const attrs = await call((cb) => sftp.stat(full(rel), cb));
      return { size: attrs.size, mtime: attrs.mtime * 1000, isDir: attrs.isDirectory() };
    } catch (error) {
      if (error?.code === SFTP_NO_SUCH_FILE) return null;
      throw mapSftpError(error, rel);
    }
  };
  let clock = { offset, measured: offset !== 0 };
  const makeDir = async (target, rel) => {
    try {
      await call((cb) => sftp.mkdir(target, cb));
    } catch (error) {
      // Otro equipo pudo crearla a la vez: si ya existe, vale.
      const there = await call((cb) => sftp.stat(target, (e, a) => cb(null, e ? null : a)));
      if (!there) throw mapSftpError(error, rel);
    }
  };
  const mkdirp = async (rel) => {
    let current = '';
    for (const part of base.split('/').filter(Boolean)) {
      current += `/${part}`;
      if (!(await call((cb) => sftp.stat(current, (e, a) => cb(null, e ? null : a)))))
        await makeDir(current, rel);
    }
    if (!clock.measured) {
      clock = { offset: await measureClockOffset(sftp, base), measured: true };
    }
    let rest = '';
    for (const part of segmentsOf(rel)) {
      rest += `/${part}`;
      const target = path.posix.join(base, rest);
      if (!(await call((cb) => sftp.stat(target, (e, a) => cb(null, e ? null : a)))))
        await makeDir(target, rel);
    }
  };
  const remove = async (rel) => {
    try {
      await call((cb) => sftp.unlink(full(rel), cb));
    } catch (error) {
      if (error?.code !== SFTP_NO_SUCH_FILE) throw mapSftpError(error, rel);
    }
  };
  /** `posix-rename` (sobrescribe) si el servidor lo tiene; si no, borrar el destino y renombrar. */
  const renameTo = async (from, to) => {
    const src = full(from);
    const dest = full(to);
    try {
      if (
        typeof sftp.ext_openssh_rename === 'function' &&
        sftp._extensions?.['posix-rename@openssh.com']
      ) {
        await call((cb) => sftp.ext_openssh_rename(src, dest, cb));
        return;
      }
      if (await stat(to)) await remove(to);
      await call((cb) => sftp.rename(src, dest, cb));
    } catch (error) {
      if (error instanceof ProjectError) throw error;
      if (error?.code === 4 || error?.code === 8) throw new ProjectError('rename-unsupported');
      throw mapSftpError(error, to);
    }
  };
  const transfer = (kind, from, to, hooks) =>
    new Promise((resolve, reject) => {
      let last = 0;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        client?.removeListener?.('close', onClose);
        if (error) reject(error);
        else resolve();
      };
      // Si la conexión se cae, ssh2 no siempre llama al callback de una transferencia en curso.
      const onClose = () => finish(new ProjectError('connection-lost'));
      client?.once?.('close', onClose);
      if (client?.__closed) return onClose();
      const step = (done) => {
        hooks?.onBytes?.(done - last);
        last = done;
        if (hooks?.shouldCancel?.()) finish(new ProjectError('canceled'));
      };
      const options = { concurrency: 16, chunkSize: 32768, step };
      if (kind === 'put') sftp.fastPut(from, to, options, finish);
      else sftp.fastGet(from, to, options, finish);
    });
  return {
    kind: 'sftp',
    label,
    exclusiveLocks: true,
    conflictCopies: false,
    async reachable() {
      return client?._sock?.writable !== false && !client?.__closed;
    },
    async readJson(rel) {
      try {
        const target = full(rel);
        const attrs = await call((cb) => sftp.stat(target, cb));
        if (attrs.size > MAX_JSON_BYTES) return null;
        const data = await call((cb) => sftp.readFile(target, cb));
        return parseJson(data);
      } catch (error) {
        if (error instanceof ProjectError) throw error;
        if (error?.code === SFTP_NO_SUCH_FILE) return null;
        const mapped = mapSftpError(error, rel);
        if (mapped instanceof ProjectError && mapped.code === 'connection-lost') throw mapped;
        return null;
      }
    },
    async writeAtomic(rel, text) {
      await mkdirp(path.posix.dirname(`/${segmentsOf(rel).join('/')}`).replace(/^\//, ''));
      const tmp = `${rel}.${process.pid}.tmp`;
      try {
        await call((cb) => sftp.writeFile(full(tmp), text, cb));
      } catch (error) {
        throw mapSftpError(error, rel);
      }
      await renameTo(tmp, rel);
    },
    async createExclusive(rel, text) {
      await mkdirp(path.posix.dirname(`/${segmentsOf(rel).join('/')}`).replace(/^\//, ''));
      let handle;
      try {
        handle = await call((cb) => sftp.open(full(rel), 'wx', cb));
      } catch (error) {
        if (await stat(rel)) return false;
        throw mapSftpError(error, rel);
      }
      try {
        await call((cb) =>
          sftp.write(handle, Buffer.from(text), 0, Buffer.byteLength(text), 0, cb),
        );
      } finally {
        await call((cb) => sftp.close(handle, cb)).catch(() => undefined);
      }
      return true;
    },
    stat,
    async list(rel) {
      try {
        const entries = await call((cb) => sftp.readdir(full(rel), cb));
        return entries
          .filter((entry) => entry.filename !== '.' && entry.filename !== '..')
          .map((entry) => ({ name: entry.filename, isDir: entry.attrs.isDirectory() }));
      } catch (error) {
        if (error?.code === SFTP_NO_SUCH_FILE) return [];
        throw mapSftpError(error, rel);
      }
    },
    async upload(localAbs, rel, hooks) {
      if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
      await mkdirp(path.posix.dirname(`/${segmentsOf(rel).join('/')}`).replace(/^\//, ''));
      const part = `${rel}.part`;
      try {
        await transfer('put', localAbs, full(part), hooks);
      } catch (error) {
        await remove(part).catch(() => undefined);
        throw mapSftpError(error, rel);
      }
      try {
        await renameTo(part, rel);
      } catch (error) {
        await remove(part).catch(() => undefined);
        throw error;
      }
    },
    async download(rel, localAbs, hooks, { expectSha } = {}) {
      if (hooks?.shouldCancel?.()) throw new ProjectError('canceled');
      mkdirSync(path.dirname(localAbs), { recursive: true });
      try {
        await transfer('get', full(rel), localAbs, hooks);
        if (expectSha && (await sha256File(localAbs)) !== expectSha)
          throw new ProjectError('remote-incomplete', undefined, path.posix.basename(rel));
      } catch (error) {
        rmSync(localAbs, { force: true });
        throw mapSftpError(error, rel);
      }
    },
    rename: async (from, to) => {
      await mkdirp(path.posix.dirname(`/${segmentsOf(to).join('/')}`).replace(/^\//, ''));
      await renameTo(from, to);
    },
    remove,
    mkdirp,
    async free() {
      try {
        if (typeof sftp.ext_openssh_statvfs !== 'function') return null;
        const vfs = await call((cb) => sftp.ext_openssh_statvfs(base, cb));
        return Number(vfs.bavail) * Number(vfs.bsize);
      } catch {
        return null;
      }
    },
    now: () => Date.now() + clock.offset,
    async lockAge(rel) {
      const attrs = await stat(rel);
      return attrs ? Date.now() + clock.offset - attrs.mtime : null;
    },
    async probeWrite() {
      const probe = `.pdfannotator-${createHash('sha1').update(String(Math.random())).digest('hex').slice(0, 8)}`;
      try {
        await mkdirp('');
        await call((cb) => sftp.writeFile(full(probe), 'ok', cb));
        await renameTo(probe, `${probe}.2`);
        await remove(`${probe}.2`);
      } catch (error) {
        await remove(probe).catch(() => undefined);
        await remove(`${probe}.2`).catch(() => undefined);
        if (error instanceof ProjectError && error.code === 'rename-unsupported') throw error;
        throw new ProjectError('folder-readonly');
      }
    },
    async close() {
      try {
        client.__closed = true;
        client.end();
      } catch {
        /* ya estaba cerrada */
      }
    },
  };
}

/** Diferencia entre el reloj del servidor y el de este equipo, medida con un archivo de prueba. */
export async function measureClockOffset(sftp, base) {
  const call = rawCall;
  const probe = path.posix.join(base, `.pdfannotator-clock-${Date.now().toString(36)}`);
  try {
    const before = Date.now();
    await call((cb) => sftp.writeFile(probe, 'x', cb));
    const attrs = await call((cb) => sftp.stat(probe, cb));
    const after = Date.now();
    await call((cb) => sftp.unlink(probe, cb)).catch(() => undefined);
    return attrs.mtime * 1000 - Math.round((before + after) / 2);
  } catch {
    return 0;
  }
}
