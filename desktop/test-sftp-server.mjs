// Servidor SFTP mínimo sobre `ssh2` para pruebas y validación (no se empaqueta en la app).
// Sirve una carpeta local como si fuera la raíz del servidor; admite usuario/contraseña y clave pública.
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import ssh2 from 'ssh2';

const { Server, utils } = ssh2;
const { STATUS_CODE: CODE, flagsToString } = utils.sftp;

/**
 * Opciones: `root` (carpeta servida), `users` ({ nombre: contraseña }), `publicKeys` ({ nombre: [claves públicas OpenSSH] }),
 * `readOnly`, `noRename` (el rename responde «no soportado»), `dropAfterBytes` (corta la conexión tras N bytes recibidos),
 * `skewMs` (adelanta o atrasa el reloj que se ve en las fechas), `writeDelayMs` (frena cada escritura), `port` y `hostKey` (clave privada del servidor).
 */
export async function startSftpServer(options) {
  const {
    root,
    users = {},
    publicKeys = {},
    readOnly = false,
    noRename = false,
    skewMs = 0,
    writeDelayMs = 0,
  } = options;
  const hostKey = options.hostKey ?? utils.generateKeyPairSync('ed25519').private;
  const hostKeyPublic = utils.parseKey(hostKey).getPublicSSH();
  const state = { dropAfterBytes: options.dropAfterBytes ?? 0, received: 0, noRename, readOnly };
  const clients = new Set();
  const resolve = (remote) => {
    const full = path.resolve(root, `.${path.posix.normalize(`/${remote}`)}`);
    if (full !== path.resolve(root) && !full.startsWith(path.resolve(root) + path.sep))
      throw Object.assign(new Error('denied'), { code: 'EACCES' });
    return full;
  };
  const attrsOf = (stat) => ({
    mode: stat.mode,
    uid: 0,
    gid: 0,
    size: stat.size,
    atime: Math.floor(stat.atimeMs / 1000),
    mtime: Math.floor((stat.mtimeMs + skewMs) / 1000),
  });
  const fail = (sftp, reqid, error) => {
    const code = error?.code;
    sftp.status(
      reqid,
      code === 'ENOENT'
        ? CODE.NO_SUCH_FILE
        : code === 'EACCES' || code === 'EPERM'
          ? CODE.PERMISSION_DENIED
          : CODE.FAILURE,
    );
  };
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('error', () => undefined);
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && users[ctx.username] === ctx.password) return ctx.accept();
      if (ctx.method === 'publickey' && publicKeys[ctx.username]) {
        const allowed = publicKeys[ctx.username].map((k) => utils.parseKey(k)).flat();
        const match = allowed.some(
          (k) => k.type === ctx.key.algo && Buffer.compare(k.getPublicSSH(), ctx.key.data) === 0,
        );
        if (
          match &&
          (!ctx.signature ||
            allowed.some((k) => k.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true))
        )
          return ctx.accept();
      }
      return ctx.reject(['password', 'publickey']);
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map();
          let next = 1;
          const newHandle = (entry) => {
            const id = next++;
            handles.set(id, entry);
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(id);
            return buf;
          };
          const get = (buf) => handles.get(buf.readUInt32BE(0));
          const guard = (reqid, fn, { write = false } = {}) => {
            try {
              if (write && state.readOnly) {
                sftp.status(reqid, CODE.PERMISSION_DENIED);
                return;
              }
              fn();
            } catch (error) {
              fail(sftp, reqid, error);
            }
          };
          sftp.on('REALPATH', (reqid, p) => {
            const clean = path.posix.normalize(`/${p}`);
            sftp.name(reqid, [{ filename: clean, longname: clean, attrs: {} }]);
          });
          sftp.on('OPEN', (reqid, filename, flags) =>
            guard(
              reqid,
              () => {
                const mode = flagsToString(flags);
                const file = resolve(filename);
                if (mode !== 'r' && state.readOnly)
                  throw Object.assign(new Error('ro'), { code: 'EACCES' });
                const fd = openSync(file, mode);
                sftp.handle(reqid, newHandle({ fd, file }));
              },
              { write: false },
            ),
          );
          sftp.on('READ', (reqid, handle, offset, length) =>
            guard(reqid, () => {
              const entry = get(handle);
              const buf = Buffer.alloc(length);
              const n = readSync(entry.fd, buf, 0, length, offset);
              if (n === 0) sftp.status(reqid, CODE.EOF);
              else sftp.data(reqid, buf.subarray(0, n));
            }),
          );
          sftp.on('WRITE', (reqid, handle, offset, data) =>
            guard(
              reqid,
              () => {
                if (state.readOnly) throw Object.assign(new Error('ro'), { code: 'EACCES' });
                state.received += data.length;
                if (state.dropAfterBytes && state.received > state.dropAfterBytes) {
                  state.dropAfterBytes = 0; // se corta una sola vez
                  client.end();
                  client._sock?.destroy();
                  return;
                }
                writeSync(get(handle).fd, data, 0, data.length, offset);
                if (writeDelayMs) setTimeout(() => sftp.status(reqid, CODE.OK), writeDelayMs);
                else sftp.status(reqid, CODE.OK);
              },
              {},
            ),
          );
          sftp.on('CLOSE', (reqid, handle) =>
            guard(reqid, () => {
              const entry = get(handle);
              if (entry?.fd !== undefined) closeSync(entry.fd);
              handles.delete(handle.readUInt32BE(0));
              sftp.status(reqid, CODE.OK);
            }),
          );
          const statOf = (reqid, p) =>
            guard(reqid, () => sftp.attrs(reqid, attrsOf(statSync(resolve(p)))));
          sftp.on('STAT', statOf);
          sftp.on('LSTAT', statOf);
          sftp.on('FSTAT', (reqid, handle) =>
            guard(reqid, () => sftp.attrs(reqid, attrsOf(fstatSync(get(handle).fd)))),
          );
          sftp.on('SETSTAT', (reqid) => sftp.status(reqid, CODE.OK));
          sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, CODE.OK));
          sftp.on('OPENDIR', (reqid, p) =>
            guard(reqid, () => {
              const dir = resolve(p);
              if (!statSync(dir).isDirectory())
                throw Object.assign(new Error('x'), { code: 'ENOTDIR' });
              sftp.handle(reqid, newHandle({ dir, sent: false }));
            }),
          );
          sftp.on('READDIR', (reqid, handle) =>
            guard(reqid, () => {
              const entry = get(handle);
              if (entry.sent) return sftp.status(reqid, CODE.EOF);
              entry.sent = true;
              const names = readdirSync(entry.dir).map((name) => ({
                filename: name,
                longname: name,
                attrs: attrsOf(statSync(path.join(entry.dir, name))),
              }));
              if (!names.length) return sftp.status(reqid, CODE.EOF);
              sftp.name(reqid, names);
            }),
          );
          sftp.on('MKDIR', (reqid, p) =>
            guard(
              reqid,
              () => {
                mkdirSync(resolve(p));
                sftp.status(reqid, CODE.OK);
              },
              { write: true },
            ),
          );
          sftp.on('RMDIR', (reqid, p) =>
            guard(
              reqid,
              () => {
                rmdirSync(resolve(p));
                sftp.status(reqid, CODE.OK);
              },
              { write: true },
            ),
          );
          sftp.on('REMOVE', (reqid, p) =>
            guard(
              reqid,
              () => {
                rmSync(resolve(p));
                sftp.status(reqid, CODE.OK);
              },
              { write: true },
            ),
          );
          sftp.on('RENAME', (reqid, from, to) => {
            if (state.noRename) return sftp.status(reqid, CODE.OP_UNSUPPORTED);
            guard(
              reqid,
              () => {
                const dest = resolve(to);
                try {
                  statSync(dest);
                  return sftp.status(reqid, CODE.FAILURE); // SFTP v3: no sobrescribe
                } catch {
                  /* no existe: bien */
                }
                renameSync(resolve(from), dest);
                sftp.status(reqid, CODE.OK);
              },
              { write: true },
            );
          });
        });
      });
    });
  });
  await new Promise((resolveListen) =>
    server.listen(options.port ?? 0, '127.0.0.1', resolveListen),
  );
  const { port } = server.address();
  return {
    port,
    state,
    hostKeyPublic,
    fingerprint: `SHA256:${(await import('node:crypto')).createHash('sha256').update(hostKeyPublic).digest('base64').replace(/=+$/, '')}`,
    dropClients() {
      for (const c of clients) c._sock?.destroy();
    },
    async close() {
      for (const c of clients) c._sock?.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}
