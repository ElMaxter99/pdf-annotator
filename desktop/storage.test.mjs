import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AI_TEMP_MIN_AGE_MS, SIZE_BUDGET_MS, createStorage, displayPath, emptyPath, pathSize, storageEntries, updatesDir } from './storage.mjs';

function sandbox() {
  const base = mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
  const ctx = {
    home: base,
    userData: path.join(base, '.config', 'PDF Annotator'),
    projectsRoot: path.join(base, 'Documentos', 'PDF Annotator'),
    installDir: path.join(base, 'opt', 'PDF Annotator'),
    updatesDir: updatesDir(path.join(base, '.cache'), 'pdf-annotator-desktop-updater'),
    tmpdir: path.join(base, 'tmp'),
  };
  for (const d of [ctx.userData, ctx.projectsRoot, ctx.installDir, ctx.updatesDir, ctx.tmpdir]) mkdirSync(d, { recursive: true });
  const put = (p, n) => (mkdirSync(path.dirname(p), { recursive: true }), writeFileSync(p, Buffer.alloc(n, 1)));
  return { base, ctx, put, done: () => rmSync(base, { recursive: true, force: true }) };
}
const deps = (ctx, extra = {}) => ({ getContext: () => ctx, exists: async (p) => existsSync(p), openPath: async () => '', clearElectronCache: async () => undefined, ...extra });

test('la lista cerrada tiene los tres grupos y ninguna ruta viene de fuera', () => {
  const { ctx, done } = sandbox();
  const entries = storageEntries(ctx);
  assert.deepEqual(entries.map((e) => e.group), ['work', 'work', 'app', 'app', 'clearable', 'clearable', 'clearable', 'clearable']);
  assert.deepEqual(entries.filter((e) => e.clear === null).map((e) => e.id), ['projects', 'editor-data', 'program', 'settings']);
  done();
});

test('displayPath abrevia la carpeta personal', () => {
  assert.equal(displayPath('/home/ana/Documentos/PDF Annotator', '/home/ana'), `~${path.sep}Documentos${path.sep}PDF Annotator`);
  assert.equal(displayPath('/otra/ruta', '/home/ana'), path.normalize('/otra/ruta'));
  assert.equal(displayPath('/home/ana', '/home/ana'), '~');
  assert.equal(displayPath('/home/anabel/x', '/home/ana'), path.normalize('/home/anabel/x'));
});

test('pathSize suma archivos y carpetas, ignora enlaces y se corta con el tiempo', async () => {
  const { base, put, done } = sandbox();
  put(path.join(base, 'a', 'x.bin'), 100);
  put(path.join(base, 'a', 'b', 'y.bin'), 50);
  symlinkSync(path.join(base, 'a'), path.join(base, 'a', 'lazo'));
  assert.deepEqual(await pathSize(path.join(base, 'a')), { bytes: 150, partial: false });
  assert.deepEqual(await pathSize(path.join(base, 'no-existe')), { bytes: 0, partial: false });
  const cut = await pathSize(path.join(base, 'a'), { deadline: Date.now() - 1 });
  assert.equal(cut.partial, true);
  assert.ok(SIZE_BUDGET_MS > 0);
  done();
});

test('list no manda tamaños y abrevia las rutas; size mide cada fila', async () => {
  const { ctx, put, done } = sandbox();
  put(path.join(ctx.projectsRoot, 'p', 'a.pdf'), 400);
  put(path.join(ctx.userData, 'IndexedDB', 'db'), 30);
  put(path.join(ctx.userData, 'Local Storage', 'ls'), 8);
  put(path.join(ctx.userData, 'update-channel.json'), 20);
  const s = createStorage(deps(ctx));
  const list = s.list();
  assert.equal(list.entries.length, 8);
  assert.ok(list.entries.every((e) => !('bytes' in e)));
  assert.equal(list.entries.find((e) => e.id === 'projects').path, displayPath(ctx.projectsRoot, ctx.home));
  assert.equal(list.entries.find((e) => e.id === 'projects').clearable, false);
  assert.equal(list.entries.find((e) => e.id === 'browser-cache').clearable, true);
  assert.deepEqual(await s.size('projects'), { bytes: 400, partial: false, exists: true });
  assert.equal((await s.size('editor-data')).bytes, 38);
  assert.equal((await s.size('settings')).bytes, 20);
  assert.deepEqual(await s.size('update-downloads'), { bytes: 0, partial: false, exists: true });
  assert.equal((await s.size('update-log')).exists, false);
  assert.equal(await s.size('../../etc'), null);
  done();
});

test('clear solo vacía lo vaciable y nunca toca el trabajo ni los ajustes', async () => {
  const { ctx, put, done } = sandbox();
  put(path.join(ctx.projectsRoot, 'p', 'a.pdf'), 400);
  put(path.join(ctx.userData, 'IndexedDB', 'db'), 30);
  put(path.join(ctx.userData, 'update-channel.json'), 20);
  const s = createStorage(deps(ctx));
  for (const id of ['projects', 'editor-data', 'program', 'settings', 'nope', '../projects']) await assert.rejects(() => s.clear(id));
  assert.ok(existsSync(path.join(ctx.projectsRoot, 'p', 'a.pdf')));
  assert.ok(existsSync(path.join(ctx.userData, 'IndexedDB', 'db')));
  assert.ok(existsSync(path.join(ctx.userData, 'update-channel.json')));
  done();
});

test('vaciar las descargas y el registro libera lo medido y deja la carpeta', async () => {
  const { ctx, put, done } = sandbox();
  put(path.join(ctx.updatesDir, 'pending', 'instalador.deb'), 1000);
  put(path.join(ctx.userData, 'update.log'), 14);
  const s = createStorage(deps(ctx));
  assert.deepEqual(await s.clear('update-downloads'), { freed: 1000 });
  assert.ok(existsSync(ctx.updatesDir));
  assert.ok(!existsSync(path.join(ctx.updatesDir, 'pending')));
  assert.deepEqual(await s.clear('update-log'), { freed: 14 });
  assert.ok(!existsSync(path.join(ctx.userData, 'update.log')));
  assert.deepEqual(await s.clear('update-log'), { freed: 0 });
  done();
});

test('la caché del navegador se vacía con las funciones de Electron, no borrando carpetas', async () => {
  const { ctx, put, done } = sandbox();
  put(path.join(ctx.userData, 'Cache', 'f1'), 500);
  let called = 0;
  const s = createStorage(deps(ctx, { clearElectronCache: async () => (called += 1, rmSync(path.join(ctx.userData, 'Cache'), { recursive: true })) }));
  assert.equal((await s.size('browser-cache')).bytes, 500);
  assert.deepEqual(await s.clear('browser-cache'), { freed: 500 });
  assert.equal(called, 1);
  done();
});

test('temporales de la IA: solo carpetas pdfann-ia-* y solo las que no son de ahora', async () => {
  const { ctx, put, done } = sandbox();
  put(path.join(ctx.tmpdir, 'pdfann-ia-viejo', 'p1.png'), 300);
  put(path.join(ctx.tmpdir, 'pdfann-ia-reciente', 'p1.png'), 200);
  put(path.join(ctx.tmpdir, 'otra-cosa', 'dato'), 999);
  put(path.join(ctx.tmpdir, 'pdfann-ia-archivo-suelto'), 5);
  const old = new Date(Date.now() - AI_TEMP_MIN_AGE_MS - 60000);
  utimesSync(path.join(ctx.tmpdir, 'pdfann-ia-viejo'), old, old);
  const s = createStorage(deps(ctx));
  assert.equal((await s.size('ai-temp')).bytes, 500);
  assert.deepEqual(await s.clear('ai-temp'), { freed: 300 });
  assert.ok(!existsSync(path.join(ctx.tmpdir, 'pdfann-ia-viejo')));
  assert.ok(existsSync(path.join(ctx.tmpdir, 'pdfann-ia-reciente')));
  assert.ok(existsSync(path.join(ctx.tmpdir, 'otra-cosa')));
  assert.ok(existsSync(path.join(ctx.tmpdir, 'pdfann-ia-archivo-suelto')));
  done();
});

test('emptyPath no se sale de su carpeta base', async () => {
  const { base, put, done } = sandbox();
  put(path.join(base, 'dentro', 'x'), 10);
  put(path.join(base, 'fuera', 'y'), 10);
  await assert.rejects(() => emptyPath(path.join(base, 'fuera'), path.join(base, 'dentro')));
  await assert.rejects(() => emptyPath(path.join(base, 'dentro', '..', 'fuera'), path.join(base, 'dentro')));
  assert.ok(existsSync(path.join(base, 'fuera', 'y')));
  done();
});

test('reveal abre solo carpetas de la lista y dice si ya no existen', async () => {
  const { ctx, done } = sandbox();
  const opened = [];
  const s = createStorage(deps(ctx, { openPath: async (p) => (opened.push(p), '') }));
  assert.equal(await s.reveal('projects'), '');
  assert.deepEqual(opened, [ctx.projectsRoot]);
  assert.equal(await s.reveal('../../etc'), 'unknown');
  rmSync(ctx.projectsRoot, { recursive: true });
  assert.equal(await s.reveal('projects'), 'missing');
  const failing = createStorage(deps(ctx, { openPath: async () => 'no se pudo' }));
  assert.equal(await failing.reveal('program'), 'no se pudo');
  done();
});
