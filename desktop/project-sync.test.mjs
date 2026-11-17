import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createProject, readJson, resolveRef, writeItem } from './projects.mjs';
import {
  acquireRemoteLock,
  listRemote,
  projectStatus,
  pushProject,
  pullProject,
  readState,
  releaseRemoteLock,
  remoteDirOf,
  remoteLockState,
  renewRemoteLock,
  syncProject,
  validateFolder,
} from './project-sync.mjs';

const pdf = (text) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);
const setup = () => {
  const base = mkdtempSync(path.join(os.tmpdir(), 'sync-'));
  const rootA = path.join(base, 'a');
  const rootB = path.join(base, 'b');
  const folder = path.join(base, 'nube');
  for (const d of [rootA, rootB, folder]) mkdirSync(d);
  return { base, rootA, rootB, folder, done: () => rmSync(base, { recursive: true, force: true }) };
};
const A = { host: 'PC-A', token: 'tok-a' };
const B = { host: 'PC-B', token: 'tok-b' };
const seed = (root, name, sub, items = { i1: 'uno' }) => {
  const created = createProject(root, name, sub);
  const { dir } = resolveRef(root, created.ref);
  for (const [id, text] of Object.entries(items))
    writeItem(dir, id, { name: `${id}.pdf`, status: 'ready' }, { a: pdf(text) });
  return { ...created, dir };
};
const later = () => new Promise((r) => setTimeout(r, 15));

test('primera subida y bajada en otro equipo', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'Cliente 1', 'Álvaro/cliente1', { i1: 'uno', i2: 'dos' });
    const up = await syncProject(s.folder, s.rootA, p.ref, A);
    assert.equal(up.action, 'push');
    assert.equal(up.rev, 1);
    assert.equal(up.uploaded, 5);
    assert.equal(projectStatus(s.folder, p.ref, p.dir, A.token).state, 'sync');
    const avail = listRemote(s.folder);
    assert.equal(avail.length, 1);
    assert.deepEqual(
      [avail[0].ref, avail[0].pdfs, avail[0].name],
      ['Álvaro/cliente1', 2, 'Cliente 1'],
    );
    const dirB = resolveRef(s.rootB, p.ref).dir;
    const down = await syncProject(s.folder, s.rootB, p.ref, B);
    assert.equal(down.action, 'pull');
    assert.equal(readFileSync(path.join(dirB, 'batch/i2.a.pdf')).toString(), pdf('dos').toString());
    assert.equal(readJson(path.join(dirB, 'project.json')).id, p.id);
    assert.equal(projectStatus(s.folder, p.ref, dirB, B.token).state, 'sync');
    assert.ok(!existsSync(path.join(dirB, '.sync-tmp')));
  } finally {
    s.done();
  }
});

test('solo se sube lo que cambió y se recoge en la otra copia', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'uno', i2: 'dos' });
    await syncProject(s.folder, s.rootA, p.ref, A);
    await syncProject(s.folder, s.rootB, p.ref, B);
    await later();
    writeItem(p.dir, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('uno v2') });
    assert.equal(projectStatus(s.folder, p.ref, p.dir, A.token).state, 'pend');
    const up = await syncProject(s.folder, s.rootA, p.ref, A);
    assert.deepEqual([up.action, up.rev, up.uploaded], ['push', 2, 2]);
    const dirB = resolveRef(s.rootB, p.ref).dir;
    assert.equal(projectStatus(s.folder, p.ref, dirB, B.token).state, 'pull');
    const down = await syncProject(s.folder, s.rootB, p.ref, B);
    assert.deepEqual([down.action, down.downloaded], ['pull', 2]);
    assert.equal(
      readFileSync(path.join(dirB, 'batch/i1.a.pdf')).toString(),
      pdf('uno v2').toString(),
    );
    assert.equal((await syncProject(s.folder, s.rootB, p.ref, B)).action, 'none');
  } finally {
    s.done();
  }
});

test('un PDF quitado se quita también en la otra copia', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'uno', i2: 'dos' });
    await syncProject(s.folder, s.rootA, p.ref, A);
    await syncProject(s.folder, s.rootB, p.ref, B);
    for (const f of ['i2.json', 'i2.a.pdf']) rmSync(path.join(p.dir, 'batch', f));
    await later();
    await syncProject(s.folder, s.rootA, p.ref, A);
    await syncProject(s.folder, s.rootB, p.ref, B);
    assert.deepEqual(readdirSync(path.join(resolveRef(s.rootB, p.ref).dir, 'batch')).sort(), [
      'i1.a.pdf',
      'i1.json',
    ]);
  } finally {
    s.done();
  }
});

test('conflicto: no pisa nada sin decidir; «theirs» guarda lo mío como copia', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'Cliente 1', 'c1', { i1: 'uno', i2: 'dos' });
    await syncProject(s.folder, s.rootA, p.ref, A);
    await syncProject(s.folder, s.rootB, p.ref, B);
    const dirB = resolveRef(s.rootB, p.ref).dir;
    await later();
    writeItem(p.dir, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('A cambia') });
    await syncProject(s.folder, s.rootA, p.ref, A);
    writeItem(dirB, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('B cambia') });
    writeItem(dirB, 'i3', { name: 'i3.pdf', status: 'ready' }, { a: pdf('nuevo') });
    assert.equal(projectStatus(s.folder, p.ref, dirB, B.token).state, 'conflict');
    const ask = await syncProject(s.folder, s.rootB, p.ref, B);
    assert.equal(ask.conflict.kind, 'both');
    assert.deepEqual([ask.conflict.mine, ask.conflict.theirs, ask.conflict.both], [2, 1, 1]);
    assert.equal(
      readFileSync(path.join(dirB, 'batch/i1.a.pdf')).toString(),
      pdf('B cambia').toString(),
    );
    const out = await syncProject(s.folder, s.rootB, p.ref, { ...B, resolution: 'theirs' });
    assert.equal(out.action, 'pull');
    assert.match(out.copy, /^c1-conflicto-\d{4}-\d\d-\d\d$/);
    assert.equal(
      readFileSync(path.join(dirB, 'batch/i1.a.pdf')).toString(),
      pdf('A cambia').toString(),
    );
    assert.ok(!existsSync(path.join(dirB, 'batch/i3.a.pdf')));
    const copyDir = resolveRef(s.rootB, out.copy).dir;
    assert.equal(
      readFileSync(path.join(copyDir, 'batch/i3.a.pdf')).toString(),
      pdf('nuevo').toString(),
    );
    const copy = readJson(path.join(copyDir, 'project.json'));
    assert.match(copy.name, /^Cliente 1 \(conflicto \d+ \w+\)$/);
    assert.notEqual(copy.id, p.id);
    assert.equal(readState(copyDir), null);
  } finally {
    s.done();
  }
});

test('conflicto: «mine» sube lo mío y guarda la revisión sustituida', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'uno' });
    await syncProject(s.folder, s.rootA, p.ref, A);
    await syncProject(s.folder, s.rootB, p.ref, B);
    const dirB = resolveRef(s.rootB, p.ref).dir;
    await later();
    writeItem(p.dir, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('de A') });
    await syncProject(s.folder, s.rootA, p.ref, A);
    writeItem(dirB, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('de B') });
    const out = await syncProject(s.folder, s.rootB, p.ref, { ...B, resolution: 'mine' });
    assert.deepEqual([out.action, out.rev], ['push', 3]);
    const rdir = remoteDirOf(s.folder, p.ref);
    assert.equal(
      readFileSync(path.join(rdir, 'batch/i1.a.pdf')).toString(),
      pdf('de B').toString(),
    );
    assert.equal(
      readFileSync(path.join(rdir, '.sync/backups/rev2/batch/i1.a.pdf')).toString(),
      pdf('de A').toString(),
    );
    assert.equal(
      (await syncProject(s.folder, s.rootB, p.ref, { ...B, resolution: 'later' })).action,
      'none',
    );
  } finally {
    s.done();
  }
});

test('mismo nombre pero otro proyecto: pide decidir', async () => {
  const s = setup();
  try {
    const a = seed(s.rootA, 'X', 'x', { i1: 'a' });
    await syncProject(s.folder, s.rootA, a.ref, A);
    const b = seed(s.rootB, 'X distinto', 'x', { i9: 'b' });
    const ask = await syncProject(s.folder, s.rootB, b.ref, B);
    assert.equal(ask.conflict.kind, 'ref-taken');
    assert.equal(projectStatus(s.folder, b.ref, b.dir, B.token).state, 'none');
    await assert.rejects(pushProject(s.folder, b.ref, b.dir, B), { code: 'ref-taken' });
  } finally {
    s.done();
  }
});

test('bloqueo remoto: toma, ocupado, caducidad, renovar y soltar', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c');
    await syncProject(s.folder, s.rootA, p.ref, A);
    const rdir = remoteDirOf(s.folder, p.ref);
    const now = Date.now();
    assert.equal((await acquireRemoteLock(rdir, A.host, A.token, { settleMs: 0, now })).ok, true);
    const busy = await acquireRemoteLock(rdir, B.host, B.token, { settleMs: 0, now: now + 1000 });
    assert.equal(busy.ok, false);
    assert.equal(busy.holder.host, 'PC-A');
    assert.equal(remoteLockState(rdir, B.token, now + 14 * 60000).state, 'other');
    const stale = remoteLockState(rdir, B.token, now + 16 * 60000);
    assert.equal(stale.state, 'free');
    assert.equal(stale.stale.host, 'PC-A');
    assert.equal(
      (await acquireRemoteLock(rdir, B.host, B.token, { settleMs: 0, now: now + 16 * 60000 })).ok,
      true,
    );
    assert.equal(renewRemoteLock(rdir, A.host, A.token, now + 17 * 60000), false);
    releaseRemoteLock(rdir, A.token);
    assert.equal(remoteLockState(rdir, B.token, now + 17 * 60000).state, 'mine');
    releaseRemoteLock(rdir, B.token);
    assert.ok(!existsSync(path.join(rdir, '.sync/lock.json')));
  } finally {
    s.done();
  }
});

test('subir con otro equipo en el bloqueo falla; el estado lo muestra', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c');
    await syncProject(s.folder, s.rootA, p.ref, A);
    await acquireRemoteLock(remoteDirOf(s.folder, p.ref), B.host, B.token, { settleMs: 0 });
    writeItem(p.dir, 'i1', { name: 'i1.pdf', status: 'ready' }, { a: pdf('cambio') });
    const status = projectStatus(s.folder, p.ref, p.dir, A.token);
    assert.equal(status.state, 'other');
    assert.equal(status.holder.host, 'PC-B');
    await assert.rejects(syncProject(s.folder, s.rootA, p.ref, A), {
      code: 'in-use',
      detail: 'PC-B',
    });
  } finally {
    s.done();
  }
});

test('carpeta no disponible: estado off y error claro; lo local no se toca', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c');
    await syncProject(s.folder, s.rootA, p.ref, A);
    const gone = path.join(s.base, 'desaparecida');
    assert.equal(projectStatus(gone, p.ref, p.dir, A.token).state, 'off');
    await assert.rejects(syncProject(gone, s.rootA, p.ref, A), { code: 'folder-missing' });
    assert.ok(existsSync(path.join(p.dir, 'batch/i1.a.pdf')));
  } finally {
    s.done();
  }
});

test('validar carpeta: no existe, solapada, de solo lectura', () => {
  const s = setup();
  try {
    assert.throws(() => validateFolder(path.join(s.base, 'no'), s.rootA), {
      code: 'folder-missing',
    });
    assert.throws(() => validateFolder(s.rootA, s.rootA), { code: 'folder-overlaps' });
    mkdirSync(path.join(s.rootA, 'dentro'));
    assert.throws(() => validateFolder(path.join(s.rootA, 'dentro'), s.rootA), {
      code: 'folder-overlaps',
    });
    assert.throws(() => validateFolder(s.base, s.rootA), { code: 'folder-overlaps' });
    assert.equal(validateFolder(s.folder, s.rootA).folder, s.folder);
  } finally {
    s.done();
  }
});

test('bajar rechaza huellas que no cuadran y no deja nada a medias', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'uno' });
    await syncProject(s.folder, s.rootA, p.ref, A);
    const rdir = remoteDirOf(s.folder, p.ref);
    writeFileSync(path.join(rdir, 'batch/i1.a.pdf'), pdf('manipulado!!'));
    const dirB = resolveRef(s.rootB, p.ref).dir;
    await assert.rejects(pullProject(s.folder, p.ref, dirB), (e) =>
      ['cloud-pending', 'remote-incomplete'].includes(e.code),
    );
    assert.ok(!existsSync(path.join(dirB, '.sync-tmp')));
    assert.ok(!existsSync(path.join(dirB, 'batch/i1.a.pdf')));
    assert.equal(readState(dirB), null);
  } finally {
    s.done();
  }
});

test('un rev.json hostil o de formato nuevo no se acepta', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c');
    await syncProject(s.folder, s.rootA, p.ref, A);
    const rdir = remoteDirOf(s.folder, p.ref);
    const rev = readJson(path.join(rdir, '.sync/rev.json'));
    writeFileSync(
      path.join(rdir, '.sync/rev.json'),
      JSON.stringify({
        ...rev,
        files: { ...rev.files, '../../x.json': { size: 1, sha256: 'a'.repeat(64) } },
      }),
    );
    assert.equal(listRemote(s.folder).length, 0);
    writeFileSync(path.join(rdir, '.sync/rev.json'), JSON.stringify({ ...rev, v: 2 }));
    await assert.rejects(pullProject(s.folder, p.ref, resolveRef(s.rootB, p.ref).dir), {
      code: 'newer-format',
    });
  } finally {
    s.done();
  }
});

test('detecta copias en conflicto del servicio de sincronización', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c');
    await syncProject(s.folder, s.rootA, p.ref, A);
    const rdir = remoteDirOf(s.folder, p.ref);
    writeFileSync(path.join(rdir, 'project-PORTATIL (conflicto).json'), '{}');
    writeFileSync(path.join(rdir, '.sync/lock (1).json'), '{}');
    writeFileSync(path.join(rdir, 'batch/i1.a (1).pdf'), 'x');
    const dups = projectStatus(s.folder, p.ref, p.dir, A.token).duplicates;
    assert.deepEqual(dups.sort(), [
      '.sync/lock (1).json',
      'batch/i1.a (1).pdf',
      'project-PORTATIL (conflicto).json',
    ]);
  } finally {
    s.done();
  }
});

test('cancelar a mitad deja la revisión anterior intacta', async () => {
  const s = setup();
  try {
    const p = seed(s.rootA, 'C', 'c', { i1: 'a', i2: 'b', i3: 'c' });
    let n = 0;
    await assert.rejects(
      syncProject(s.folder, s.rootA, p.ref, A, {
        onProgress: () => (n += 1),
        shouldCancel: () => n >= 1,
      }),
      { code: 'canceled' },
    );
    const rdir = remoteDirOf(s.folder, p.ref);
    assert.ok(!existsSync(path.join(rdir, '.sync/rev.json')));
    assert.deepEqual(
      readdirSync(path.join(rdir, 'batch')).filter((f) => f.endsWith('.part')),
      [],
    );
    assert.equal(readState(p.dir), null);
  } finally {
    s.done();
  }
});
