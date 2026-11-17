import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import ssh2 from 'ssh2';
import { createProject, resolveRef, writeItem } from './projects.mjs';
import {
  acquireRemoteLock,
  listRemote,
  projectStatus,
  pushProject,
  releaseRemoteLock,
  remoteLockState,
  syncProject,
} from './project-sync.mjs';
import { inspectHost, openSftpProvider, testConnection } from './sftp-connection.mjs';
import { startSftpServer } from './test-sftp-server.mjs';

const pdf = (text) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);
const A = { host: 'PC-A', token: 'tok-a' };
const B = { host: 'PC-B', token: 'tok-b' };

async function setup(serverOptions = {}) {
  const base = mkdtempSync(path.join(os.tmpdir(), 'sftp-'));
  const served = path.join(base, 'server');
  const rootA = path.join(base, 'a');
  const rootB = path.join(base, 'b');
  for (const d of [served, rootA, rootB]) mkdirSync(d);
  const server = await startSftpServer({
    root: served,
    users: { ana: 'secreto' },
    ...serverOptions,
  });
  const config = {
    host: '127.0.0.1',
    port: server.port,
    username: 'ana',
    path: '/pdf-annotator',
    authMode: 'password',
    keyFile: '',
    fingerprint: server.fingerprint,
    hostKeyType: 'ssh-ed25519',
  };
  const open = (secret = { password: 'secreto' }, cfg = config) => openSftpProvider(cfg, secret);
  return {
    base,
    served,
    rootA,
    rootB,
    server,
    config,
    open,
    async done() {
      await server.close();
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const seed = (root, name, sub, items = { i1: 'uno' }) => {
  const created = createProject(root, name, sub);
  const { dir } = resolveRef(root, created.ref);
  for (const [id, text] of Object.entries(items))
    writeItem(dir, id, { name: `${id}.pdf`, status: 'ready' }, { a: pdf(text) });
  return { ...created, dir };
};

test('SFTP: subir, listar y bajar en otro equipo', async () => {
  const s = await setup();
  const pa = await s.open();
  const pb = await s.open();
  try {
    const p = seed(s.rootA, 'Cliente', 'cli', { i1: 'uno', i2: 'dos' });
    const bytes = [];
    const up = await syncProject(pa, s.rootA, p.ref, A, { onBytes: (n) => bytes.push(n) });
    assert.equal(up.action, 'push');
    assert.ok(bytes.reduce((a, b) => a + b, 0) > 0);
    assert.equal((await projectStatus(pa, p.ref, p.dir, A.token)).state, 'sync');
    assert.equal((await listRemote(pb)).length, 1);
    const down = await syncProject(pb, s.rootB, p.ref, B);
    assert.equal(down.action, 'pull');
    const dirB = resolveRef(s.rootB, p.ref).dir;
    assert.equal(readFileSync(path.join(dirB, 'batch/i2.a.pdf')).toString(), pdf('dos').toString());
    const names = readdirSync(path.join(s.served, 'pdf-annotator/cli/batch'));
    assert.ok(!names.some((n) => n.endsWith('.part')));
  } finally {
    await pa.close();
    await pb.close();
    await s.done();
  }
});

test('SFTP: el bloqueo es exclusivo (gana el primero) y caduca con el reloj del servidor', async () => {
  const s = await setup({ skewMs: 0 });
  const pa = await s.open();
  const pb = await s.open();
  try {
    const [x, y] = await Promise.all([
      acquireRemoteLock(pa, 'c', A.host, A.token),
      acquireRemoteLock(pb, 'c', B.host, B.token),
    ]);
    assert.deepEqual([x.ok, y.ok].sort(), [false, true]);
    const winner = x.ok ? A : B;
    const loser = x.ok ? B : A;
    const provLoser = x.ok ? pb : pa;
    assert.equal((await remoteLockState(provLoser, 'c', loser.token)).state, 'other');
    await releaseRemoteLock(x.ok ? pa : pb, 'c', winner.token);
    assert.equal((await remoteLockState(provLoser, 'c', loser.token)).state, 'free');
    assert.equal((await acquireRemoteLock(provLoser, 'c', loser.host, loser.token)).ok, true);
  } finally {
    await pa.close();
    await pb.close();
    await s.done();
  }
});

test('SFTP: un bloqueo viejo según el reloj del servidor se puede tomar', async () => {
  const s = await setup({ skewMs: -20 * 60 * 1000 });
  const pa = await s.open();
  try {
    await acquireRemoteLock(pa, 'c', A.host, A.token);
    assert.ok(pa.now() < Date.now() - 19 * 60 * 1000);
    // El servidor «atrasa» 20 min: aun así, medido con su propio reloj, el bloqueo es reciente.
    assert.equal((await remoteLockState(pa, 'c', B.token)).state, 'other');
  } finally {
    await pa.close();
    await s.done();
  }
});

test('SFTP: la conexión se corta a mitad y la revisión anterior queda intacta', async () => {
  const s = await setup();
  const pa = await s.open();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'uno' });
    await syncProject(pa, s.rootA, p.ref, A);
    writeItem(p.dir, 'i2', { name: 'i2.pdf', status: 'ready' }, { a: pdf('x'.repeat(200000)) });
    s.server.state.dropAfterBytes = s.server.state.received + 1000;
    await assert.rejects(pushProject(pa, p.ref, p.dir, A), { code: 'connection-lost' });
    const remote = JSON.parse(
      readFileSync(path.join(s.served, 'pdf-annotator/c/.sync/rev.json'), 'utf8'),
    );
    assert.equal(remote.rev, 1);
    assert.ok(!existsSync(path.join(s.served, 'pdf-annotator/c/batch/i2.a.pdf')));
  } finally {
    await pa.close();
    await s.done();
  }
});

test('SFTP: tras un corte, reintentar no repite lo que ya llegó entero', async () => {
  const s = await setup();
  const pa = await s.open();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'a'.repeat(100000), i2: 'b'.repeat(100000) });
    s.server.state.dropAfterBytes = 150000;
    const first = [];
    await assert.rejects(syncProject(pa, s.rootA, p.ref, A, { onBytes: (n) => first.push(n) }), {
      code: 'connection-lost',
    });
    const remote = path.join(s.served, 'pdf-annotator/c');
    assert.ok(!existsSync(path.join(remote, '.sync/rev.json')));
    const pb = await s.open();
    const before = s.server.state.received;
    const second = [];
    const out = await syncProject(pb, s.rootA, p.ref, A, { onBytes: (n) => second.push(n) });
    assert.equal(out.action, 'push');
    assert.equal(JSON.parse(readFileSync(path.join(remote, '.sync/rev.json'), 'utf8')).rev, 1);
    // Solo viajó lo que faltaba (un PDF de 100 KB y los pequeños), no los 200 KB enteros.
    assert.ok(s.server.state.received - before < 150000, String(s.server.state.received - before));
    assert.ok(second.length > 0);
    await pb.close();
  } finally {
    await pa.close();
    await s.done();
  }
});

test('SFTP: solo lectura y sin renombrar se explican', async () => {
  const s = await setup({ readOnly: true });
  try {
    const out = await testConnection(s.config, { password: 'secreto' }, { create: false });
    assert.equal(out.ok, false);
  } finally {
    await s.done();
  }
  const t = await setup({ noRename: true });
  try {
    mkdirSync(path.join(t.served, 'pdf-annotator'));
    const out = await testConnection(t.config, { password: 'secreto' });
    assert.equal(out.ok, false);
    assert.equal(out.error, 'rename-unsupported');
  } finally {
    await t.done();
  }
});

test('SFTP: probar conexión, carpeta que falta y credenciales', async () => {
  const s = await setup();
  try {
    const missing = await testConnection(s.config, { password: 'secreto' });
    assert.equal(missing.ok, false);
    assert.equal(missing.error, 'remote-missing');
    const created = await testConnection(s.config, { password: 'secreto' }, { create: true });
    assert.equal(created.ok, true);
    assert.deepEqual(
      created.steps.map((x) => x.id),
      ['login', 'folder', 'write'],
    );
    const bad = await testConnection(s.config, { password: 'mala' });
    assert.equal(bad.error, 'auth-failed');
    assert.equal(bad.steps[0].ok, false);
  } finally {
    await s.done();
  }
});

test('SFTP: la huella se fija la primera vez y un cambio bloquea la conexión', async () => {
  const s = await setup();
  try {
    const seen = await inspectHost({ ...s.config, fingerprint: '' });
    assert.equal(seen.fingerprint, s.server.fingerprint);
    await assert.rejects(s.open({ password: 'secreto' }, { ...s.config, fingerprint: '' }), {
      code: 'host-key-unknown',
    });
    const other = `SHA256:${'A'.repeat(43)}`;
    await assert.rejects(s.open({ password: 'secreto' }, { ...s.config, fingerprint: other }), {
      code: 'host-key-changed',
    });
  } finally {
    await s.done();
  }
});

test('SFTP: clave privada con frase de paso', async () => {
  const keys = ssh2.utils.generateKeyPairSync('ed25519', {
    passphrase: 'frase',
    cipher: 'aes256-ctr',
    rounds: 8,
  });
  const s = await setup({ publicKeys: { ana: [keys.public] } });
  const keyFile = path.join(s.base, 'id_ed25519');
  (await import('node:fs')).writeFileSync(keyFile, keys.private, { mode: 0o600 });
  try {
    const cfg = { ...s.config, authMode: 'key', keyFile };
    await assert.rejects(s.open({}, cfg), { code: 'passphrase-needed' });
    await assert.rejects(s.open({ passphrase: 'otra' }, cfg), { code: 'bad-passphrase' });
    const ok = await s.open({ passphrase: 'frase' }, cfg);
    assert.equal(await ok.reachable(), true);
    await ok.close();
    (await import('node:fs')).writeFileSync(keyFile, 'esto no es una clave');
    await assert.rejects(s.open({}, cfg), { code: 'key-unusable' });
  } finally {
    await s.done();
  }
});

test('SFTP: servidor que no existe y puerto cerrado', async () => {
  const s = await setup();
  try {
    await assert.rejects(inspectHost({ ...s.config, host: 'no-existe.invalid' }), (e) =>
      ['host-not-found', 'connect-timeout', 'connection-refused'].includes(e.code),
    );
    await s.server.close();
    await assert.rejects(inspectHost(s.config), (e) =>
      ['connection-refused', 'connection-lost'].includes(e.code),
    );
  } finally {
    rmSync(s.base, { recursive: true, force: true });
  }
});
