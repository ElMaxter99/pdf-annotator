import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { crc32, deflateRawSync } from 'node:zlib';
import {
  exportInfo,
  exportProject,
  importArchive,
  inspectArchive,
  replaceImpact,
} from './project-archive.mjs';
import { acquireLock, createProject, readItems, resolveRef, writeItem } from './projects.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'pa-arc-'));
const pdf = (n, fill = 1) => Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(n, fill)]);
const code = async (fn) => {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail('no ha lanzado');
};

function seed(root, name = 'Cliente 1', sub = 'Álvaro/cliente1') {
  const p = createProject(root, name, sub);
  const { dir } = resolveRef(root, p.ref);
  writeItem(
    dir,
    'a1',
    { name: 'uno.pdf', status: 'ready', fields: [{ x: 1 }] },
    { a: pdf(30), b: pdf(40, 2) },
  );
  writeItem(dir, 'a2', { name: 'dos.pdf', status: 'todo' }, { a: pdf(20, 3) });
  return { dir, ref: p.ref };
}

/** Construye un ZIP a mano (con el manifiesto al día) para probar archivos manipulados. */
function craft(file, files, { manifest = {}, entries = {} } = {}) {
  const list = Object.entries(files).map(([name, data]) => ({ name, data: Buffer.from(data) }));
  const body = {
    format: 'pdf-annotator-project',
    formatVersion: 1,
    app: { name: 'PDF Annotator', version: '1.0.0' },
    exportedAt: 1000,
    files: list.map((f) => ({
      path: f.name,
      size: f.data.length,
      sha256: createHash('sha256').update(f.data).digest('hex'),
    })),
    ...manifest,
  };
  list.push({ name: 'manifest.json', data: Buffer.from(JSON.stringify(body)) });
  const parts = [];
  const central = [];
  let pos = 0;
  for (const f of list) {
    const o = {
      method: 0,
      usize: f.data.length,
      crc: crc32(f.data) >>> 0,
      payload: f.data,
      ...(entries[f.name] ?? {}),
    };
    if (o.method === 8 && !entries[f.name]?.payload) o.payload = deflateRawSync(f.data);
    const name = Buffer.from(f.name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(o.method, 8);
    head.writeUInt32LE(o.crc, 14);
    head.writeUInt32LE(o.payload.length, 18);
    head.writeUInt32LE(o.usize, 22);
    head.writeUInt16LE(name.length, 26);
    parts.push(head, name, o.payload);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(o.method, 10);
    c.writeUInt32LE(o.crc, 16);
    c.writeUInt32LE(o.payload.length, 20);
    c.writeUInt32LE(o.usize, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(pos, 42);
    central.push(c, name);
    pos += head.length + name.length + o.payload.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(list.length, 8);
  end.writeUInt16LE(list.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(pos, 16);
  writeFileSync(file, Buffer.concat([...parts, cd, end]));
}

const PROJECT = JSON.stringify({ v: 1, name: 'Hecho a mano', createdAt: 5 });
const goodFiles = () => ({
  'project.json': PROJECT,
  'batch/x1.json': JSON.stringify({ name: 'x.pdf' }),
  'batch/x1.a.pdf': pdf(10),
});

test('exportar e importar conserva PDFs, anotaciones y estado, y crea un proyecto nuevo', async () => {
  const dir = tmp();
  const src = seed(dir);
  const file = path.join(dir, 'Cliente 1.pdfannotator');
  const progress = [];
  const out = await exportProject(
    src.dir,
    file,
    { appVersion: '1.2.3', ref: src.ref },
    { onProgress: (d, t) => progress.push([d, t]) },
  );
  assert.equal(out.pdfs, 3);
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.equal(existsSync(`${file}.part`), false);

  const info = await inspectArchive(file);
  assert.equal(info.name, 'Cliente 1');
  assert.equal(info.pdfsA, 2);
  assert.equal(info.pdfsB, 1);
  assert.equal(info.appVersion, '1.2.3');
  assert.equal(info.ref, 'Álvaro/cliente1');
  assert.equal(info.oversize.length, 0);

  const root2 = tmp();
  const res = await importArchive(file, root2, { name: info.name, subpath: info.ref });
  assert.equal(res.project.pdfs, 2);
  assert.equal(res.project.done, 1);
  assert.notEqual(
    res.project.id,
    JSON.parse(readFileSync(path.join(src.dir, 'project.json'), 'utf8')).id,
  );
  const items = readItems(resolveRef(root2, res.project.ref).dir);
  const orig = readItems(src.dir);
  assert.deepEqual(
    items.map((i) => i.id),
    orig.map((i) => i.id),
  );
  assert.deepEqual(items[0].meta, orig[0].meta);
  assert.ok(items[0].a.equals(orig[0].a));
  assert.ok(items[0].b.equals(orig[0].b));
  assert.equal(items[1].b, null);
  assert.deepEqual(
    readdirSync(root2).filter((n) => n.startsWith('.import')),
    [],
  );
  rmSync(dir, { recursive: true, force: true });
  rmSync(root2, { recursive: true, force: true });
});

test('sin las versiones nuevas (B) el archivo solo lleva los PDFs originales', async () => {
  const root = tmp();
  const src = seed(root);
  assert.deepEqual(Object.keys(exportInfo(src.dir)).sort(), [
    'bytesA',
    'bytesB',
    'bytesMeta',
    'pdfsA',
    'pdfsB',
  ]);
  const file = path.join(root, 'sin-b.pdfannotator');
  const out = await exportProject(src.dir, file, { includeB: false });
  assert.equal(out.pdfs, 2);
  assert.equal((await inspectArchive(file)).pdfsB, 0);
  rmSync(root, { recursive: true, force: true });
});

test('un proyecto sin PDFs no se puede exportar y no deja archivos a medias', async () => {
  const root = tmp();
  const p = createProject(root, 'Vacío', '');
  const file = path.join(root, 'v.pdfannotator');
  assert.equal((await code(() => exportProject(resolveRef(root, p.ref).dir, file))).code, 'empty');
  assert.equal(existsSync(file) || existsSync(`${file}.part`), false);
  rmSync(root, { recursive: true, force: true });
});

test('cancelar una exportación borra el archivo parcial', async () => {
  const root = tmp();
  const src = seed(root);
  const file = path.join(root, 'c.pdfannotator');
  let calls = 0;
  const err = await code(() =>
    exportProject(src.dir, file, {}, { shouldCancel: () => ++calls > 1 }),
  );
  assert.equal(err.code, 'canceled');
  assert.equal(existsSync(file) || existsSync(`${file}.part`), false);
  rmSync(root, { recursive: true, force: true });
});

test('si el proyecto ya existe pregunta; copia nueva y reemplazar con copia de seguridad', async () => {
  const root = tmp();
  const src = seed(root);
  const file = path.join(root, 'p.pdfannotator');
  await exportProject(src.dir, file, { ref: src.ref });
  const info = await inspectArchive(file);

  const conflict = await importArchive(file, root, { name: info.name, subpath: info.ref });
  assert.equal(conflict.conflict.ref, 'Álvaro/cliente1');
  assert.equal(conflict.conflict.pdfs, 2);

  const copy = await importArchive(file, root, {
    name: info.name,
    subpath: info.ref,
    mode: 'copy',
  });
  assert.equal(copy.project.ref, 'Álvaro/cliente1-2');
  assert.equal(copy.project.name, 'Cliente 1 (2)');
  assert.notEqual(copy.project.id, conflict.conflict.id);

  writeItem(src.dir, 'a9', { name: 'solo-aqui.pdf' }, { a: pdf(5) });
  const impact = replaceImpact(src.dir, info);
  assert.equal(impact.onlyHere, 1);

  const res = await importArchive(file, root, {
    name: info.name,
    subpath: info.ref,
    mode: 'replace',
  });
  assert.equal(res.backup, 'Álvaro/cliente1-antes-de-importar');
  assert.equal(readItems(src.dir).length, 2);
  const backup = readItems(resolveRef(root, res.backup).dir);
  assert.equal(backup.length, 3);
  rmSync(root, { recursive: true, force: true });
});

test('no se reemplaza un proyecto abierto en otro equipo', async () => {
  const root = tmp();
  const src = seed(root);
  const file = path.join(root, 'p.pdfannotator');
  await exportProject(src.dir, file);
  acquireLock(src.dir, 'PORTATIL-ALVARO', 'otro');
  const err = await code(() =>
    importArchive(file, root, {
      name: 'Cliente 1',
      subpath: src.ref,
      mode: 'replace',
      token: 'mio',
    }),
  );
  assert.equal(err.code, 'in-use');
  assert.equal(err.detail, 'PORTATIL-ALVARO');
  assert.equal(readItems(src.dir).length, 2);
  rmSync(root, { recursive: true, force: true });
});

test('lo que no es un archivo de proyecto se rechaza', async () => {
  const root = tmp();
  const fake = path.join(root, 'factura.pdf');
  writeFileSync(fake, pdf(500));
  assert.equal((await code(() => inspectArchive(fake))).code, 'not-an-archive');
  const tiny = path.join(root, 'tiny.pdfannotator');
  writeFileSync(tiny, 'hola');
  assert.equal((await code(() => inspectArchive(tiny))).code, 'not-an-archive');
  // Un ZIP cualquiera, sin manifiesto
  const zip = path.join(root, 'otro.zip');
  craft(zip, goodFiles());
  const bytes = readFileSync(zip);
  const generic = path.join(root, 'generico.zip');
  craft(generic, {}, { manifest: { format: 'otra-cosa' } });
  assert.equal((await code(() => inspectArchive(generic))).code, 'not-an-archive');
  assert.ok(bytes.length > 0);
  rmSync(root, { recursive: true, force: true });
});

test('rutas que se salen del proyecto, absolutas o raras se rechazan sin escribir nada', async () => {
  const root = tmp();
  for (const bad of [
    '../evil.json',
    '/etc/passwd',
    'batch/../../x.json',
    'batch\\x1.json',
    'C:/x.json',
    'batch/x1.txt',
  ]) {
    const file = path.join(root, 'bad.pdfannotator');
    craft(file, { ...goodFiles(), [bad]: '{}' });
    const err = await code(() => importArchive(file, root, { name: 'X', subpath: '' }));
    assert.ok(['unsafe', 'corrupt'].includes(err.code), `${bad} → ${err.code}`);
  }
  assert.deepEqual(
    readdirSync(root).filter((n) => !n.endsWith('.pdfannotator')),
    [],
  );
  rmSync(root, { recursive: true, force: true });
});

test('huellas, CRC o tamaños que no cuadran, y bombas de descompresión', async () => {
  const root = tmp();
  const file = path.join(root, 'x.pdfannotator');
  craft(file, goodFiles(), {
    manifest: {
      files: [
        { path: 'project.json', size: PROJECT.length, sha256: '0'.repeat(64) },
        { path: 'batch/x1.json', size: 17, sha256: '1'.repeat(64) },
        { path: 'batch/x1.a.pdf', size: 19, sha256: '2'.repeat(64) },
      ],
    },
  });
  assert.equal((await code(() => inspectArchive(file))).code, 'corrupt');

  craft(file, goodFiles(), { entries: { 'batch/x1.a.pdf': { crc: 123 } } });
  assert.equal((await code(() => inspectArchive(file))).code, 'corrupt');

  // Declara 10 bytes pero se descomprime a muchos más.
  const big = Buffer.alloc(5_000_000, 7);
  craft(
    file,
    { ...goodFiles(), 'batch/x1.a.pdf': big },
    {
      entries: { 'batch/x1.a.pdf': { method: 8, usize: 10, payload: deflateRawSync(big) } },
      manifest: { files: [] },
    },
  );
  assert.equal((await code(() => inspectArchive(file))).code, 'corrupt');

  // Un archivo cortado
  const good = path.join(root, 'good.pdfannotator');
  craft(good, goodFiles());
  const full = readFileSync(good);
  writeFileSync(file, full.subarray(0, full.length - 40));
  assert.ok(['not-an-archive', 'corrupt'].includes((await code(() => inspectArchive(file))).code));
  rmSync(root, { recursive: true, force: true });
});

test('un formato más nuevo que la app pide actualizar', async () => {
  const root = tmp();
  const file = path.join(root, 'v2.pdfannotator');
  craft(file, { ...goodFiles(), 'extra/nuevo.bin': 'x' }, { manifest: { formatVersion: 2 } });
  const err = await code(() => inspectArchive(file));
  assert.equal(err.code, 'newer-format');
  assert.equal(err.detail, '2');
  rmSync(root, { recursive: true, force: true });
});

test('los topes de PDFs y de tamaño se aplican con un recuento claro', async () => {
  const root = tmp();
  const src = seed(root);
  const file = path.join(root, 'p.pdfannotator');
  await exportProject(src.dir, file);
  const err = await code(() =>
    inspectArchive(file, { limits: { maxPdfs: 1, maxBytes: 1e9, maxPdfBytes: 1e9 } }),
  );
  assert.equal(err.code, 'too-many-pdfs');
  assert.equal(err.detail.pdfs, 2);
  const big = await code(() =>
    inspectArchive(file, { limits: { maxPdfs: 10, maxBytes: 50, maxPdfBytes: 1e9 } }),
  );
  assert.equal(big.code, 'too-big');
  rmSync(root, { recursive: true, force: true });
});

test('un PDF demasiado pesado se deja fuera solo si la persona lo acepta', async () => {
  const root = tmp();
  const src = seed(root);
  writeItem(src.dir, 'grande', { name: 'contrato-final.pdf' }, { a: pdf(60) });
  const file = path.join(root, 'p.pdfannotator');
  await exportProject(src.dir, file);
  // Con este tope solo sobran el PDF de 69 bytes y la B de 49.
  const limits = { maxPdfs: 10, maxBytes: 1e9, maxPdfBytes: 45 };
  const info = await inspectArchive(file, { limits });
  assert.deepEqual(
    info.oversize.map((o) => [o.name, o.which]).sort(),
    [
      ['contrato-final.pdf', 'a'],
      ['uno.pdf', 'b'],
    ].sort(),
  );
  const dest = tmp();
  const err = await code(() => importArchive(file, dest, { name: 'P', subpath: '', limits }));
  assert.equal(err.code, 'pdf-too-big');
  assert.deepEqual(readdirSync(dest), []);
  const ok = await importArchive(file, dest, {
    name: 'P',
    subpath: '',
    limits,
    skipOversize: true,
  });
  assert.equal(ok.skipped.length, 2);
  const items = readItems(resolveRef(dest, ok.project.ref).dir);
  assert.deepEqual(items.map((i) => i.id).sort(), ['a1', 'a2']);
  assert.equal(items.find((i) => i.id === 'a1').b, null);
  rmSync(dest, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test('cancelar una importación no deja nada en la carpeta de proyectos', async () => {
  const root = tmp();
  const src = seed(root);
  const file = path.join(root, 'p.pdfannotator');
  await exportProject(src.dir, file);
  const dest = tmp();
  let n = 0;
  const err = await code(() =>
    importArchive(file, dest, { name: 'P', subpath: '' }, { shouldCancel: () => ++n > 2 }),
  );
  assert.equal(err.code, 'canceled');
  assert.deepEqual(readdirSync(dest), []);
  rmSync(dest, { recursive: true, force: true });
  rmSync(root, { recursive: true, force: true });
});

test('el nombre y la subcarpeta del destino se limpian como en un proyecto nuevo', async () => {
  const root = tmp();
  const file = path.join(root, 'p.pdfannotator');
  craft(file, goodFiles());
  const res = await importArchive(file, root, { name: 'Con: nombre?', subpath: '../fuera/CON' });
  assert.equal(res.project.ref, 'fuera/_CON');
  assert.equal(
    (await code(() => importArchive(file, root, { name: '  ', subpath: '' }))).code,
    'bad-name',
  );
  rmSync(root, { recursive: true, force: true });
});
