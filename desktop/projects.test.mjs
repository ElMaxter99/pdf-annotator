import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  LIMITS,
  LOCK_STALE_MS,
  acquireLock,
  createProject,
  folderRefFor,
  listProjects,
  lockState,
  moveProjectFolder,
  readItems,
  releaseLock,
  removeItem,
  renewLock,
  resolveRef,
  safeSegments,
  writeItem,
} from './projects.mjs';

const root = () => mkdtempSync(path.join(os.tmpdir(), 'pa-proj-'));
const pdf = (n = 10) => new Uint8Array(n).fill(37);

test('safeSegments limpia rutas peligrosas', () => {
  assert.deepEqual(safeSegments('Álvaro/cliente1'), ['Álvaro', 'cliente1']);
  assert.deepEqual(safeSegments('../../etc/passwd'), ['etc', 'passwd']);
  assert.deepEqual(safeSegments('a:b/c*?'), ['ab', 'c']);
  assert.deepEqual(safeSegments('..'), []);
  assert.deepEqual(safeSegments('NUL/com1.txt/Cliente'), ['_NUL', '_com1.txt', 'Cliente']);
});

test('resolveRef no sale de la raíz', () => {
  const r = root();
  assert.equal(resolveRef(r, 'Álvaro/cliente1').ref, 'Álvaro/cliente1');
  assert.throws(() => resolveRef(r, '../fuera'), { code: 'bad-ref' });
  assert.ok(resolveRef(r, '/etc').dir.startsWith(path.resolve(r) + path.sep));
  assert.throws(() => resolveRef(r, ''), { code: 'bad-ref' });
  rmSync(r, { recursive: true });
});

test('crear, listar y no duplicar proyectos', () => {
  const r = root();
  const a = createProject(r, 'Cliente 1', 'Álvaro/cliente1');
  assert.equal(a.ref, 'Álvaro/cliente1');
  createProject(r, 'Cliente 2', '');
  const list = listProjects(r, 'tok');
  assert.equal(list.length, 2);
  assert.throws(() => createProject(r, 'Otra vez', 'Álvaro/cliente1'), { code: 'exists' });
  assert.throws(() => createProject(r, '   ', ''), { code: 'bad-name' });
  assert.throws(() => createProject(path.join(r, 'nada'), 'X', ''), { code: 'root-missing' });
  rmSync(r, { recursive: true });
});

test('guardar y leer PDFs del lote, y quitar uno', () => {
  const r = root();
  const p = createProject(r, 'P', '');
  const { dir } = resolveRef(r, p.ref);
  writeItem(
    dir,
    'item-1',
    { id: 'item-1', name: 'a.pdf', status: 'ready' },
    { a: pdf(), b: pdf(5) },
  );
  writeItem(dir, 'item-2', { id: 'item-2', name: 'b.pdf', status: 'review' }, { a: pdf() });
  const items = readItems(dir);
  assert.equal(items.length, 2);
  assert.equal(items.find((i) => i.id === 'item-1').b.length, 5);
  const [summary] = listProjects(r, 't');
  assert.equal(summary.pdfs, 2);
  assert.equal(summary.done, 1);
  writeItem(dir, 'item-1', { id: 'item-1', name: 'a.pdf', status: 'review' }, { b: null });
  assert.equal(readItems(dir).find((i) => i.id === 'item-1').b, null);
  removeItem(dir, 'item-2');
  assert.equal(readItems(dir).length, 1);
  assert.throws(() => writeItem(dir, '../x', {}, { a: pdf() }), { code: 'bad-item' });
  rmSync(r, { recursive: true });
});

test('aplica el tope de PDFs y de tamaño', () => {
  const r = root();
  const { dir } = resolveRef(r, createProject(r, 'P', '').ref);
  assert.throws(() => writeItem(dir, 'big', {}, { a: new Uint8Array(LIMITS.maxPdfBytes + 1) }), {
    code: 'pdf-too-big',
  });
  for (let i = 0; i < LIMITS.maxPdfs; i += 1) writeItem(dir, `i${i}`, {}, { a: pdf(1) });
  assert.throws(() => writeItem(dir, 'extra', {}, { a: pdf(1) }), { code: 'too-many-pdfs' });
  writeItem(dir, 'i0', { again: true }, { a: pdf(1) });
  rmSync(r, { recursive: true });
});

test('bloqueo: otro equipo, caducidad y tomar el control', () => {
  const r = root();
  const { dir } = resolveRef(r, createProject(r, 'P', '').ref);
  const now = 1_000_000;
  assert.equal(lockState(dir, 'A', now).state, 'free');
  assert.deepEqual(acquireLock(dir, 'PC-A', 'A', { now }), { ok: true });
  assert.equal(lockState(dir, 'A', now).state, 'mine');
  const denied = acquireLock(dir, 'PC-B', 'B', { now: now + 60_000 });
  assert.equal(denied.ok, false);
  assert.equal(denied.holder.host, 'PC-A');
  assert.equal(renewLock(dir, 'PC-A', 'A', now + 60_000), true);
  assert.equal(lockState(dir, 'B', now + 60_000 + LOCK_STALE_MS + 1).state, 'free');
  assert.equal(acquireLock(dir, 'PC-B', 'B', { force: true, now: now + 120_000 }).ok, true);
  assert.equal(renewLock(dir, 'PC-A', 'A', now + 130_000), false);
  releaseLock(dir, 'A');
  assert.equal(existsSync(path.join(dir, '.lock')), true);
  releaseLock(dir, 'B');
  assert.equal(existsSync(path.join(dir, '.lock')), false);
  rmSync(r, { recursive: true });
});

test('renombrar la carpeta cambia solo el último tramo y no pisa otra', () => {
  const r = root();
  createProject(r, 'Cliente 2', 'Álvaro/cliente2');
  createProject(r, 'Cliente 3', 'Álvaro/Cliente 3');
  assert.equal(
    folderRefFor('Álvaro/cliente2', 'Cliente 2 · Facturas'),
    'Álvaro/Cliente 2 · Facturas',
  );
  assert.equal(folderRefFor('Álvaro/cliente2', 'CON'), 'Álvaro/_CON');
  assert.equal(folderRefFor('Álvaro/cliente2', 'a:b/c?'), 'Álvaro/ab c');
  assert.throws(() => folderRefFor('x', '???'), { code: 'bad-name' });
  assert.throws(() => moveProjectFolder(r, 'Álvaro/cliente2', 'Cliente 3'), { code: 'exists' });
  assert.ok(existsSync(path.join(r, 'Álvaro', 'cliente2', 'project.json')));
  const moved = moveProjectFolder(r, 'Álvaro/cliente2', 'Facturas 2027');
  assert.equal(moved.ref, 'Álvaro/Facturas 2027');
  assert.ok(existsSync(path.join(r, 'Álvaro', 'Facturas 2027', 'project.json')));
  assert.ok(!existsSync(path.join(r, 'Álvaro', 'cliente2')));
  assert.equal(
    moveProjectFolder(r, 'Álvaro/Facturas 2027', 'Facturas 2027').ref,
    'Álvaro/Facturas 2027',
  );
  const caps = moveProjectFolder(r, 'Álvaro/Facturas 2027', 'FACTURAS 2027');
  assert.equal(caps.ref, 'Álvaro/FACTURAS 2027');
  rmSync(r, { recursive: true });
});
