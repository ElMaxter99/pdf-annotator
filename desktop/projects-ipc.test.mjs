import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setupProjectsIpc } from './projects-ipc.mjs';

function boot(documents, userData, extra = {}) {
  const handlers = new Map();
  const sent = [];
  const api = setupProjectsIpc({
    handle: (channel, fn) => handlers.set(channel, fn),
    app: {
      getPath: (name) => (name === 'documents' ? documents : userData),
      getVersion: () => '9.9.9',
    },
    dialog: {
      showOpenDialog: async () =>
        extra.open
          ? { canceled: false, filePaths: [extra.open] }
          : { canceled: true, filePaths: [] },
      showSaveDialog: async () =>
        extra.save ? { canceled: false, filePath: extra.save } : { canceled: true },
    },
    shell: { showItemInFolder: (file) => sent.push(['reveal', file]) },
    getWindow: () => ({
      webContents: {
        send: (channel, payload) => {
          sent.push([channel, payload]);
          extra.onProgress?.(payload);
        },
      },
    }),
  });
  return { call: (channel, input) => handlers.get(channel)(input), api, sent };
}
const pdf = (n, fill = 1) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(n, fill)]);

test('un equipo que perdió el bloqueo no puede escribir (not-held)', async () => {
  const docs = mkdtempSync(path.join(os.tmpdir(), 'pa-ipc-'));
  const a = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-a-')));
  const b = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-b-')));
  const { project } = await a.call('projects:create', { name: 'P', subpath: '' });
  assert.equal((await a.call('projects:open', { ref: project.ref })).project.ref, project.ref);
  assert.equal(
    (
      await a.call('projects:save-item', {
        ref: project.ref,
        id: 'x',
        meta: {},
        a: new Uint8Array(5),
      })
    ).ok,
    true,
  );

  assert.equal((await b.call('projects:open', { ref: project.ref })).locked.state, 'other');
  assert.equal(
    (
      await b.call('projects:save-item', {
        ref: project.ref,
        id: 'y',
        meta: {},
        a: new Uint8Array(5),
      })
    ).error,
    'not-held',
  );

  assert.ok((await b.call('projects:open', { ref: project.ref, force: true })).project);
  assert.equal(
    (
      await a.call('projects:save-item', {
        ref: project.ref,
        id: 'z',
        meta: {},
        a: new Uint8Array(5),
      })
    ).error,
    'not-held',
  );
  assert.equal(
    (
      await b.call('projects:save-item', {
        ref: project.ref,
        id: 'z',
        meta: {},
        a: new Uint8Array(5),
      })
    ).ok,
    true,
  );
  rmSync(docs, { recursive: true, force: true });
});

test('rutas fuera de la raíz se rechazan', async () => {
  const docs = mkdtempSync(path.join(os.tmpdir(), 'pa-ipc-'));
  const a = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-')));
  for (const ref of ['../x', '..', 'a/../../b']) {
    assert.equal((await a.call('projects:open', { ref })).error, 'bad-ref', ref);
  }
  rmSync(docs, { recursive: true, force: true });
});

test('exportar un proyecto y volver a importarlo (con conflicto, copia y progreso)', async () => {
  const docs = mkdtempSync(path.join(os.tmpdir(), 'pa-ipc-'));
  const out = mkdtempSync(path.join(os.tmpdir(), 'pa-out-'));
  const file = path.join(out, 'Cliente 1.pdfannotator');
  const a = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-')), { save: file, open: file });
  const { project } = await a.call('projects:create', {
    name: 'Cliente 1',
    subpath: 'Álvaro/cliente1',
  });
  assert.equal((await a.call('projects:export-info', { ref: project.ref })).error, 'empty');
  await a.call('projects:open', { ref: project.ref });
  await a.call('projects:save-item', {
    ref: project.ref,
    id: 'x',
    meta: { name: 'x.pdf' },
    a: pdf(30),
    b: pdf(10),
  });

  const info = await a.call('projects:export-info', { ref: project.ref });
  assert.equal(info.pdfsA, 1);
  assert.equal(info.pdfsB, 1);
  const exported = await a.call('projects:export', { ref: project.ref, includeB: true });
  assert.equal(exported.pdfs, 2);
  assert.equal(exported.name, 'Cliente 1.pdfannotator');
  assert.ok(existsSync(file));
  assert.ok(
    a.sent.some(
      ([channel, p]) => channel === 'projects:progress' && p.op === 'export' && p.done === 2,
    ),
  );
  await a.call('projects:reveal');
  assert.deepEqual(a.sent.at(-1), ['reveal', file]);

  const seen = await a.call('projects:import-inspect', {});
  assert.equal(seen.info.name, 'Cliente 1');
  assert.equal(seen.info.pdfsA, 1);
  assert.equal(seen.info.ref, 'Álvaro/cliente1');
  assert.equal(seen.info.appVersion, '9.9.9');
  assert.equal('ids' in seen.info, false);

  const conflict = await a.call('projects:import-run', {
    name: 'Cliente 1',
    subpath: 'Álvaro/cliente1',
  });
  assert.equal(conflict.conflict.pdfs, 1);
  assert.equal(conflict.conflict.onlyHere, 0);
  const copy = await a.call('projects:import-run', {
    name: 'Cliente 1',
    subpath: 'Álvaro/cliente1',
    mode: 'copy',
  });
  assert.equal(copy.project.ref, 'Álvaro/cliente1-2');
  assert.equal((await a.call('projects:list')).projects.length, 2);
  rmSync(docs, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('importar exige haber revisado un archivo, rechaza lo que no es un proyecto y se puede cancelar', async () => {
  const docs = mkdtempSync(path.join(os.tmpdir(), 'pa-ipc-'));
  const out = mkdtempSync(path.join(os.tmpdir(), 'pa-out-'));
  const fake = path.join(out, 'factura.pdf');
  writeFileSync(fake, pdf(300));
  const a = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-')), { open: fake });
  assert.equal((await a.call('projects:import-run', { name: 'X' })).error, 'not-an-archive');
  const bad = await a.call('projects:import-inspect', {});
  assert.equal(bad.error, 'not-an-archive');
  assert.equal(bad.detail, 'factura.pdf');
  assert.equal(
    (await a.call('projects:import-inspect', { path: 'relativo.pdfannotator' })).error,
    'not-an-archive',
  );

  const file = path.join(out, 'p.pdfannotator');
  let cancelled = false;
  const b = boot(docs, mkdtempSync(path.join(os.tmpdir(), 'pa-ud-')), {
    save: file,
    onProgress: () => {
      if (!cancelled) {
        cancelled = true;
        void b.call('projects:cancel');
      }
    },
  });
  const { project } = await b.call('projects:create', { name: 'P', subpath: '' });
  await b.call('projects:open', { ref: project.ref });
  for (const id of ['a', 'b', 'c'])
    await b.call('projects:save-item', { ref: project.ref, id, meta: {}, a: pdf(10) });
  const result = await b.call('projects:export', { ref: project.ref, includeB: true });
  assert.deepEqual(result, { canceled: true });
  assert.equal(existsSync(file) || existsSync(`${file}.part`), false);
  rmSync(docs, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test('sincronizar con una carpeta enlazada entre dos equipos: vincular, subir, bajar, bloqueo y subida al cerrar', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'pa-sync-'));
  const cloud = path.join(tmp, 'nube');
  mkdirSync(cloud);
  const mk = (name) => {
    const docs = path.join(tmp, name);
    mkdirSync(docs);
    return boot(docs, mkdtempSync(path.join(tmp, `ud-${name}-`)), { open: cloud });
  };
  const a = mk('a');
  const b = mk('b');
  assert.deepEqual(await a.call('sync:status'), { linked: false });
  assert.equal((await a.call('sync:link', { accepted: true })).error, 'not-linked');
  const { project } = await a.call('projects:create', { name: 'Cliente', subpath: 'Álvaro/c1' });
  await a.call('projects:open', { ref: project.ref });
  await a.call('projects:save-item', { ref: project.ref, id: 'i1', meta: { name: 'i1.pdf' }, a: pdf(10) });
  await a.call('projects:release', { ref: project.ref });

  const picked = await a.call('sync:choose');
  assert.equal(picked.folder, cloud);
  assert.equal((await a.call('sync:link', { accepted: false })).error, 'not-linked');
  assert.equal((await a.call('sync:link', { accepted: true })).folder, cloud);
  const up = await a.call('sync:all', { mode: 'both' });
  assert.deepEqual([up.synced, up.failed.length, up.conflicts.length], [1, 0, 0]);
  assert.equal((await a.call('sync:status')).statuses[project.ref].state, 'sync');

  await b.call('sync:choose');
  await b.call('sync:link', { accepted: true });
  const seen = await b.call('sync:status');
  assert.deepEqual(seen.available.map((r) => [r.ref, r.pdfs]), [[project.ref, 1]]);
  assert.equal((await b.call('sync:all', { mode: 'down' })).synced, 1);
  assert.equal((await b.call('sync:status')).available.length, 0);

  const bOpen = await b.call('projects:open', { ref: project.ref });
  assert.equal(bOpen.items.length, 1);
  const blocked = await a.call('projects:open', { ref: project.ref });
  assert.equal(blocked.locked.state, 'other');
  assert.equal(blocked.remote, true);

  await b.call('projects:save-item', { ref: project.ref, id: 'i2', meta: { name: 'i2.pdf' }, a: pdf(20) });
  await b.call('projects:release', { ref: project.ref });
  await new Promise((resolve) => {
    const t = setInterval(() => {
      if (b.sent.some(([c, p]) => c === 'projects:sync-event' && p.state === 'done')) {
        clearInterval(t);
        resolve();
      }
    }, 20);
  });
  assert.ok(!existsSync(path.join(cloud, project.ref, '.sync', 'lock.json')));
  assert.equal((await a.call('sync:status')).statuses[project.ref].state, 'pull');
  const pulled = await a.call('sync:project', { ref: project.ref, action: 'sync' });
  assert.equal(pulled.action, 'pull');
  assert.equal((await a.call('projects:open', { ref: project.ref })).items.length, 2);

  assert.equal((await a.call('sync:project', { ref: project.ref, action: 'pause' })).ok, true);
  assert.equal((await a.call('sync:status')).statuses[project.ref].state, 'paused');
  assert.equal((await a.call('sync:project', { ref: project.ref, action: 'stop' })).ok, true);
  assert.equal((await a.call('sync:status')).statuses[project.ref].state, 'none');
  assert.equal((await a.call('sync:project', { ref: '../fuera', action: 'sync' })).error, 'bad-ref');
  assert.deepEqual(await a.call('sync:unlink'), { ok: true });
  assert.deepEqual(await a.call('sync:status'), { linked: false });
  a.api.releaseAll();
  b.api.releaseAll();
  rmSync(tmp, { recursive: true, force: true });
});
