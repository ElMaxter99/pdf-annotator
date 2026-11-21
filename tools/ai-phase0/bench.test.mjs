import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildReport, failedCase, listCases, renderMarkdown, scoreCase, stamp, totals, truthMap, usageOf } from './bench-lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = path.join(here, 'sample-plano');
const run = promisify(execFile);

const entries = [
  { id: 'p1-f1', page: 1, index: 0, field: { mapField: '{{a}}', x: 10, y: 10 } },
  { id: 'p1-f2', page: 1, index: 1, field: { mapField: '{{b}}', x: 20, y: 20 } },
  { id: 'p1-f3', page: 1, index: 2, field: { mapField: '{{c}}', x: 30, y: 30 } },
  { id: 'p1-f4', page: 1, index: 3, field: { mapField: '{{d}}', x: 40, y: 40 } },
];
const result = {
  rows: [
    { id: 'p1-f1', page: 1, ok: true, newPage: 1, x: 13, y: 14, source: 'text', reason: 'Colocado sin IA: etiqueta «Nombre»', anchorB: 'Nombre' },
    { id: 'p1-f2', page: 1, ok: true, newPage: 2, x: 20, y: 30, source: 'ai', reason: 'secreto', anchorB: 'Dirección' },
    { id: 'p1-f3', page: 1, ok: false, why: 'no_existe_en_b', reason: 'ya no está' },
    { id: 'p1-f4', page: 1, ok: false, why: 'ancla_B_no_encontrada', reason: '' },
  ],
  details: { requests: 3, attempts: [{ seconds: 2, usage: { input: 10, output: 5, cacheRead: 100, cacheWrite: 1 }, costUsd: 0.01 }, { seconds: 3, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 }, costUsd: 0.02 }] },
};
const truth = truthMap([{ id: 'p1-f1', page: 1, x: 10, y: 10 }, { id: 'p1-f2', page: 2, x: 30, y: 30 }, { id: 'p1-f3', gone: true }, { id: 'p1-f4', page: 1, x: 0, y: 0 }]);

test('truthMap admite posiciones y ausentes e ignora entradas mal formadas', () => {
  const m = truthMap([{ id: 'a', page: 1, x: 1, y: 2 }, { id: 'b', gone: true }, { id: 'c', page: 'x' }, null]);
  assert.deepEqual([...m.entries()], [['a', { page: 1, x: 1, y: 2 }], ['b', { gone: true }]]);
  assert.equal(truthMap(null), null);
});

test('usageOf suma lo medido y deja null lo que el CLI no da', () => {
  assert.deepEqual(usageOf([]), { tokens: null, aiCredits: null, premiumRequests: null, costUsd: null, cliSeconds: 0 });
  const u = usageOf(result.details.attempts);
  assert.deepEqual(u.tokens, { input: 11, output: 6, cacheRead: 100, cacheWrite: 1 });
  assert.equal(u.costUsd, 0.03);
  assert.equal(u.aiCredits, null);
  assert.equal(u.cliSeconds, 5);
});

test('scoreCase cuenta colocados, sin IA, no existe en B, motivos y aciertos en la misma página', () => {
  const r = scoreCase({ name: 'x', textFirst: true, result, entries, truth, seconds: 1.234 });
  assert.equal(r.total, 4);
  assert.equal(r.placed, 2);
  assert.equal(r.placedWithoutAi, 1);
  assert.equal(r.placedByAi, 1);
  assert.equal(r.absent, 1);
  assert.deepEqual(r.notPlaced, { ancla_B_no_encontrada: 1 });
  // p1-f1 a 5 pt; p1-f2 en su página a 10 pt; p1-f4 sin colocar.
  assert.deepEqual(r.known, { withPosition: 3, pageOk: 2, within5: 1, within15: 2, medianErrPt: 10, gone: 1, goneOk: 1 });
  assert.equal(r.requests, 3);
  assert.equal(r.seconds, 1.2);
  assert.equal(r.fields[0].mapField, '{{a}}');
  // Nada del texto de los PDF: ni motivos de la IA ni anclas.
  assert.ok(!JSON.stringify(r).includes('Nombre'));
  assert.ok(!JSON.stringify(r).includes('secreto'));
});

test('totals suma los casos y deja fuera los fallidos', () => {
  const a = scoreCase({ name: 'a', textFirst: true, result, entries, truth, seconds: 1 });
  const b = failedCase({ name: 'b', textFirst: true, error: Object.assign(new Error('El CLI dijo «Nombre»'), { code: 'cli_error' }), seconds: 2, total: 4 });
  assert.deepEqual(b.error, { code: 'cli_error', reset: null });
  const t = totals([a, a, b]);
  assert.equal(t.cases, 3);
  assert.equal(t.failed, 1);
  assert.equal(t.placed, 4);
  assert.equal(t.tokens, 236);
  assert.equal(t.known.within15, 4);
  assert.equal(t.seconds, 4);
});

test('renderMarkdown pinta una tabla por modo y la comparación', () => {
  const on = scoreCase({ name: 'a', textFirst: true, result, entries, truth, seconds: 1 });
  const off = { ...on, textFirst: false, requests: 5, placedWithoutAi: 0 };
  const md = renderMarkdown(buildReport({ date: 'hoy', provider: 'fake', model: null, retry: true, maxRequests: 8, cases: 1, casesDir: 'x' }, [{ textFirst: true, runs: [on] }, { textFirst: false, runs: [off] }]));
  assert.match(md, /## Con pase sin IA/);
  assert.match(md, /## Sin pase sin IA/);
  assert.match(md, /\| a \| 4 \| 2 \| 1 \| 1 \| 1: 1 ancla_B_no_encontrada \| 2\/3 \| 1\/3 \| 2\/3 \| 1\/1 \| 3 \| 118 \| \$0\.030 \| 1 \|/);
  assert.match(md, /\| \*\*Total\*\* \| 2 \/ 2 \| 3 \/ 5 \|/);
  assert.match(md, /Ahorro del pase sin IA: 2 \(40 %\) peticiones/);
  assert.doesNotMatch(md, /indicaciones de la persona/);
  const withHints = renderMarkdown(buildReport({ date: 'hoy', provider: 'fake', model: null, retry: true, maxRequests: 8, instructions: 31, cases: 1, casesDir: 'x' }, [{ textFirst: true, runs: [on] }]));
  assert.match(withHints, /Con indicaciones de la persona \(31 caracteres; el texto no se copia aquí\)/);
});

test('scoreCase y renderMarkdown marcan el parcial cuando la IA cortó el PDF (A4)', () => {
  const partial = { ...result, details: { ...result.details, aborted: 'images_not_read' } };
  const r = scoreCase({ name: 'p', textFirst: true, result: partial, entries, truth, seconds: 1 });
  assert.equal(r.aborted, 'images_not_read');
  const md = renderMarkdown(buildReport({ date: 'hoy', provider: 'fake', model: null, retry: true, maxRequests: 8, cases: 1, casesDir: 'x' }, [{ textFirst: true, runs: [r] }]));
  assert.match(md, /\| 3 \(parcial: images_not_read\) \|/);
});

test('stamp da una marca ordenable sin caracteres raros', () => {
  assert.equal(stamp(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02-030405');
});

test('listCases lee sample-plano (planos), una carpeta de un caso y subcarpetas', async () => {
  const flat = await listCases(sample);
  assert.equal(flat.length, 6);
  assert.ok(flat.every((c) => c.a.endsWith(`A-${c.name}.pdf`)));
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'bench-cases-'));
  try {
    const one = path.join(tmp, 'mio');
    await mkdir(one);
    await copyFile(path.join(sample, 'A-factura-desplazada.pdf'), path.join(one, 'A.pdf'));
    await copyFile(path.join(sample, 'A-factura-desplazada.json'), path.join(one, 'A.json'));
    await copyFile(path.join(sample, 'B-factura-desplazada.pdf'), path.join(one, 'B.pdf'));
    await mkdir(path.join(tmp, 'incompleto'));
    assert.deepEqual((await listCases(tmp)).map((c) => c.name), ['mio']);
    assert.deepEqual((await listCases(one)).map((c) => c.name), ['mio']);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('bench.mjs con el proveedor simulado saca la tabla y el JSON y cuadran', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'bench-out-'));
  try {
    await run(process.execPath, [path.join(here, 'bench.mjs'), '--provider', 'fake', '--out', out], { cwd: here, env: { ...process.env, AI_HELPER_TEXT_FIRST: '' } });
    const files = (await readdir(out)).sort();
    assert.equal(files.length, 2);
    assert.match(files[0], /^bench-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);
    assert.equal(files[1], files[0].replace(/\.json$/, '.md'));
    const report = JSON.parse(await readFile(path.join(out, files[0]), 'utf8'));
    const md = await readFile(path.join(out, files[1]), 'utf8');

    assert.deepEqual(report.modes.map((m) => m.textFirst), [true, false]);
    const [on, off] = report.modes;
    for (const m of report.modes) {
      assert.equal(m.runs.length, 6);
      assert.ok(m.runs.every((r) => !r.error));
      assert.equal(m.totals.total, 45);
      assert.equal(m.totals.placed, m.runs.reduce((n, r) => n + r.placed, 0));
      assert.equal(m.totals.requests, m.runs.reduce((n, r) => n + r.requests, 0));
      for (const r of m.runs) {
        assert.equal(r.fields.length, r.total);
        assert.equal(r.placed + r.absent + Object.values(r.notPlaced).reduce((n, v) => n + v, 0), r.total);
        assert.equal(r.placedWithoutAi + r.placedByAi, r.placed);
      }
    }
    // Sin el pase, nada se coloca sin IA; con él, el pase coloca y ahorra peticiones.
    assert.equal(off.totals.placedWithoutAi, 0);
    assert.ok(on.totals.placedWithoutAi > 0);
    assert.ok(on.totals.requests < off.totals.requests);
    assert.deepEqual(report.comparison.totals.requests, [on.totals.requests, off.totals.requests]);
    // La tabla dice lo mismo que el JSON.
    assert.ok(md.includes(`| ${on.totals.placed} / ${off.totals.placed} | ${on.totals.requests} / ${off.totals.requests} |`));
    for (const r of on.runs) assert.ok(md.includes(`| ${r.case} | ${r.total} | ${r.placed} | ${r.placedWithoutAi} | ${r.absent} |`));

    // Ningún texto libre: solo cadenas en claves permitidas (ids, mapField, motivos en código, metadatos).
    const allowed = new Set(['date', 'provider', 'model', 'casesDir', 'modes', 'stopped', 'case', 'id', 'mapField', 'why', 'source', 'code', 'reset']);
    const walk = (v, key) => {
      if (typeof v === 'string') assert.ok(allowed.has(key), `cadena en «${key}»`);
      else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, /^\w+$/.test(k) && !['notPlaced'].includes(key) ? k : key);
    };
    walk(report, '');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('bench.mjs se para si no encuentra el CLI y guarda solo el código del error', async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), 'bench-out-'));
  try {
    // PATH vacío: aunque el equipo tenga Copilot instalado, no se lanza.
    await run(process.execPath, [path.join(here, 'bench.mjs'), '--provider', 'copilot', '--out', out], { cwd: here, env: { ...process.env, PATH: out, Path: out } });
    const json = (await readdir(out)).find((f) => f.endsWith('.json'));
    const report = JSON.parse(await readFile(path.join(out, json), 'utf8'));
    assert.match(report.meta.stopped, /copilot/);
    const runs = report.modes.flatMap((m) => m.runs);
    assert.equal(runs.length, 1);
    assert.deepEqual(runs[0].error, { code: 'missing', reset: null });
    assert.match(await readFile(path.join(out, json.replace(/\.json$/, '.md')), 'utf8'), /\*\*Parado\*\*/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
