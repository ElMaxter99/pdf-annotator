// Conexión SFTP (fase 3b, mesas P-91 a P-93): abre la sesión con `ssh2`, comprueba la huella del servidor y traduce los
// fallos a códigos que la interfaz sabe explicar. Solo vive en el proceso principal; la web nunca ve contraseñas ni claves.
import { readFileSync, statSync } from 'node:fs';
import ssh2 from 'ssh2';
import { ProjectError } from './projects.mjs';
import { fingerprintOf, keyTypeOf, measureClockOffset, sftpProvider } from './sync-provider.mjs';

const { Client, utils } = ssh2;
const MAX_KEY_BYTES = 64 * 1024;
const READY_TIMEOUT_MS = 15000;
const call = (fn) =>
  new Promise((resolve, reject) => fn((error, value) => (error ? reject(error) : resolve(value))));

/** Normaliza lo que llega de la web: nada que no sea texto corto o un número de puerto. */
export function cleanConfig(input) {
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const port = Math.floor(Number(input?.port));
  return {
    host: text(input?.host, 253),
    port: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : 22,
    username: text(input?.username, 128),
    path: text(input?.path, 500) || '/pdf-annotator',
    authMode: input?.authMode === 'key' ? 'key' : 'password',
    keyFile: text(input?.keyFile, 1024),
    fingerprint: /^SHA256:[A-Za-z0-9+/]{43}$/.test(String(input?.fingerprint ?? ''))
      ? input.fingerprint
      : '',
    hostKeyType: text(input?.hostKeyType, 40),
  };
}

export function validateConfig(config) {
  if (!config.host || /[\s/\\]/.test(config.host) || !config.username)
    throw new ProjectError('bad-sftp-config');
  return config;
}

/** Lee la clave privada elegida (solo un archivo normal y pequeño) y comprueba que se puede usar. */
export function loadPrivateKey(file, passphrase) {
  let data;
  try {
    if (!statSync(file).isFile() || statSync(file).size > MAX_KEY_BYTES)
      throw new ProjectError('key-unusable');
    data = readFileSync(file);
  } catch (error) {
    if (error instanceof ProjectError) throw error;
    throw new ProjectError('key-unusable');
  }
  const parsed = utils.parseKey(data, passphrase || undefined);
  const failure = Array.isArray(parsed) ? parsed.find((k) => k instanceof Error) : parsed;
  if (failure instanceof Error) {
    if (/passphrase/i.test(failure.message))
      throw new ProjectError(passphrase ? 'bad-passphrase' : 'passphrase-needed');
    throw new ProjectError('key-unusable');
  }
  return data;
}

function mapConnectError(error) {
  if (error instanceof ProjectError) return error;
  const message = String(error?.message ?? '');
  const code = error?.code ?? '';
  if (
    error?.level === 'client-authentication' ||
    /All configured authentication methods failed/i.test(message)
  )
    return new ProjectError('auth-failed');
  if (error?.level === 'client-timeout' || /Timed out|ETIMEDOUT/i.test(message + code))
    return new ProjectError('connect-timeout');
  if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME/.test(code + message))
    return new ProjectError('host-not-found');
  if (/ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/.test(code + message))
    return new ProjectError('connection-refused');
  if (/ECONNRESET|EPIPE|closed|end/i.test(code + message))
    return new ProjectError('connection-lost');
  return new ProjectError('connection-lost');
}

/**
 * Abre una conexión. `expected` es la huella que se fijó la primera vez: si cambia, la conexión se corta antes de enviar
 * credenciales. Con `inspect` solo se lee la huella del servidor y se cierra (para el diálogo «¿Es este tu servidor?»).
 */
function connect(config, { expected = '', secret = {}, inspect = false } = {}) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    let seen = null;
    let verdict = null;
    const options = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: READY_TIMEOUT_MS,
      keepaliveInterval: 10000,
      hostVerifier: (key) => {
        seen = { fingerprint: fingerprintOf(key), type: keyTypeOf(key) };
        if (inspect) return false;
        if (!expected || seen.fingerprint !== expected) {
          verdict = expected ? 'changed' : 'unknown';
          return false;
        }
        return true;
      },
    };
    try {
      if (!inspect) {
        if (config.authMode === 'key')
          Object.assign(options, {
            privateKey: loadPrivateKey(config.keyFile, secret.passphrase),
            passphrase: secret.passphrase || undefined,
          });
        else options.password = secret.password ?? '';
      }
    } catch (error) {
      reject(error);
      return;
    }
    client.__closed = false;
    const finish = (error) => {
      if (inspect && seen) return resolve({ client: null, seen });
      if (verdict === 'changed')
        return reject(new ProjectError('host-key-changed', undefined, seen.fingerprint));
      if (verdict === 'unknown')
        return reject(new ProjectError('host-key-unknown', undefined, seen.fingerprint));
      reject(mapConnectError(error));
    };
    client.on('ready', () => resolve({ client, seen }));
    client.on('error', (error) => {
      client.__closed = true;
      finish(error);
    });
    client.on('close', () => {
      client.__closed = true;
      if (inspect || verdict) finish(new Error('closed'));
    });
    try {
      client.connect(options);
    } catch (error) {
      finish(error);
    }
  });
}

/** Lee la huella del servidor sin enviar credenciales. */
export async function inspectHost(config) {
  const out = await connect(config, { inspect: true }).catch((error) => {
    throw mapConnectError(error);
  });
  return { fingerprint: out.seen.fingerprint, type: out.seen.type };
}

async function resolveBase(sftp, wanted) {
  if (wanted.startsWith('/')) return wanted.replace(/\/+$/, '') || '/';
  const home = await call((cb) => sftp.realpath('.', cb)).catch(() => '/');
  const rest = wanted.replace(/^~\/?/, '');
  return `${home.replace(/\/+$/, '')}/${rest}`.replace(/\/+$/, '');
}

/** Abre la sesión y devuelve el proveedor listo para el motor de sincronización. */
export async function openSftpProvider(config, secret) {
  validateConfig(config);
  if (!config.fingerprint) throw new ProjectError('host-key-unknown');
  const { client } = await connect(config, { expected: config.fingerprint, secret });
  try {
    const sftp = await call((cb) => client.sftp(cb));
    const base = await resolveBase(sftp, config.path);
    const offset = await measureClockOffset(sftp, base);
    const provider = sftpProvider({
      client,
      sftp,
      base,
      label: `${config.username}@${config.host}:${config.path}`,
      offset,
    });
    return provider;
  } catch (error) {
    client.end();
    throw mapConnectError(error);
  }
}

/**
 * «Probar conexión»: inicio de sesión, carpeta remota (se ofrece crearla), lectura, escritura y renombrado.
 * Devuelve los pasos para pintarlos uno a uno en el diálogo.
 */
export async function testConnection(config, secret, { create = false, inspect } = {}) {
  validateConfig(config);
  const steps = [];
  const mark = (id, ok) => steps.push({ id, ok });
  let provider = null;
  try {
    const { client } = await connect(config, { expected: config.fingerprint, secret });
    mark('login', true);
    const sftp = await call((cb) => client.sftp(cb));
    const base = await resolveBase(sftp, config.path);
    const exists = await call((cb) => sftp.stat(base, (e, a) => cb(null, e ? null : a)));
    if (!exists && !create) {
      client.end();
      mark('folder', false);
      return { ok: false, steps, error: 'remote-missing' };
    }
    const offset = await measureClockOffset(
      sftp,
      base.split('/').slice(0, -1).join('/') || '/',
    ).catch(() => 0);
    provider = sftpProvider({ client, sftp, base, label: config.host, offset });
    if (!exists) await provider.mkdirp('');
    mark('folder', true);
    await provider.probeWrite();
    mark('write', true);
    const free = await provider.free();
    const extra = inspect ? await inspect(provider) : undefined;
    return { ok: true, steps, free, offset, extra };
  } catch (error) {
    const mapped = mapConnectError(error);
    if (!steps.length) mark('login', false);
    else if (steps.at(-1).ok && steps.at(-1).id === 'login') mark('folder', false);
    else mark('write', false);
    return { ok: false, steps, error: mapped.code, detail: mapped.detail };
  } finally {
    await provider?.close();
  }
}
