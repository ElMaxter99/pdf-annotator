import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setupProjectsIpc } from './projects-ipc.mjs';

function boot(documents, userData) {
  const handlers = new Map();
  const api = setupProjectsIpc({
    handle: (channel, fn) => handlers.set(channel, fn),
    app: { getPath: (name) => (name === 'documents' ? documents : userData) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getWindow: () => null,
  });
  return { call: (channel, input) => handlers.get(channel)(input), api };
}

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
