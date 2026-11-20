// Motor del traslado por partes (runPasses), plantillas de prompt del ayudante y contrato de runProposal.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MAX_REQUESTS_PER_PDF, runPasses } from './passes.mjs';
import { PROMPT_NAMES, loadPrompts, requestPrompt } from '../ai-helper/prompts.mjs';

const entry = (page, i) => ({ id: `p${page}-f${i}`, page, index: i - 1, field: { x: 10, y: 10, mapField: `Campo ${page}.${i}` } });
/** Plan a mano: grupos de A con sus candidatas y el orden completo de B. */
const item = (pageA, candidatesB, rankB, n = 2) => ({ group: `A-p${pageA}`, pageA, candidatesB, rankB, fields: Array.from({ length: n }, (_, i) => entry(pageA, i + 1)) });
const codesFor = (names) => Object.fromEntries(names.map((n) => [n, 'K7F2']));
const allCodes = codesFor(['A-p1', 'A-p2', 'A-p3', 'A-p4', 'A-p5', 'B-p1', 'B-p2', 'B-p3', 'B-p4', 'B-p5', 'B-p6', 'B-p7']);
const placedAt = (id, page = 1, confidence = 0.9) => ({ id, found: true, page, anchorA: 'X', anchorB: 'X', dx: 0, dy: 0, confidence });
const notFound = (id) => ({ id, found: false, reason: 'no está' });
/** `resolve` de prueba: colocado si la IA dijo found (la conversión real se prueba en lib.test.mjs). */
const resolve = (p) => (p.found ? { ok: true, page: p.page, x: 1, y: 1 } : { ok: false, why: 'sin_resultado' });
const reply = (request, fields, codes = allCodes) => JSON.stringify({ images: Object.fromEntries([`A-p${request.pageA}`, ...request.pagesB.map((p) => `B-p${p}`)].map((n) => [n, codes[n]])), fields });

test('pasada 1: una petición por página útil, con solo sus imágenes y campos; exige solo los códigos de esa petición', async () => {
  const calls = [];
  const stages = [];
  const plan = [item(1, [1, 2], [1, 2, 3]), item(3, [3], [3, 2, 1], 1)];
  const r = await runPasses({
    plan,
    codes: allCodes,
    resolve,
    onStage: (s, n) => stages.push(`${s}${n}`),
    call: async (req, info) => {
      calls.push({ group: req.group, pass: req.pass, pagesB: req.pagesB, ids: req.entries.map((e) => e.id), info });
      return reply(req, req.entries.map((e) => placedAt(e.id)));
    },
  });
  assert.deepEqual(calls.map((c) => [c.group, c.pass, c.pagesB, c.ids]), [
    ['A-p1', 1, [1, 2], ['p1-f1', 'p1-f2']],
    ['A-p3', 1, [3], ['p3-f1']],
  ]);
  assert.deepEqual(stages, ['asking1', 'asking2']);
  assert.equal(r.requests, 2);
  assert.equal(r.outcomes.size, 3);
  assert.deepEqual(r.attempts.map((a) => ({ n: a.n, pass: a.pass, group: a.group, images: a.images, fields: a.fields })), [
    { n: 1, pass: 1, group: 'A-p1', images: ['A-p1', 'B-p1', 'B-p2'], fields: 2 },
    { n: 2, pass: 1, group: 'A-p3', images: ['A-p3', 'B-p3'], fields: 1 },
  ]);
  assert.equal(r.capReached, false);
});

test('pasada 2: re-pregunta solo lo no colocado, primero con páginas nuevas y luego con las mismas y el motivo', async () => {
  const calls = [];
  const plan = [item(1, [1, 2, 3], [2, 1, 3, 4, 5], 3)];
  const r = await runPasses({
    plan,
    codes: allCodes,
    resolve,
    maxAttempts: 1,
    call: async (req) => {
      calls.push(req);
      if (req.pass === 1) return reply(req, [placedAt('p1-f1', 1, 0.5), notFound('p1-f2')]);
      return reply(req, [placedAt('p1-f2', 4, 0.7), notFound('p1-f3')]);
    },
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].entries.map((e) => e.id), ['p1-f2', 'p1-f3']);
  assert.deepEqual(calls[1].pagesB, [4, 5]);
  assert.equal(calls[1].fresh, true);
  assert.match(calls[1].notes[0], /p1-f2 .*respondiste found:false/);
  assert.match(calls[1].notes[1], /p1-f3 .*no venía en la respuesta anterior/);
  assert.equal(r.outcomes.get('p1-f2').resolved.page, 4);
  assert.equal(r.outcomes.get('p1-f3').resolved.ok, false);

  // B entera ya enviada: mismas candidatas y nota con el motivo.
  const again = [];
  await runPasses({ plan: [item(1, [1, 2], [1, 2], 1)], resolve, maxAttempts: 1, call: async (req) => (again.push(req), reply(req, [notFound('p1-f1')])) });
  assert.equal(again.length, 2);
  assert.deepEqual(again[1].pagesB, [1, 2]);
  assert.equal(again[1].fresh, false);
});

test('mezcla: lo colocado en la pasada 2 sustituye al fallo de la 1; lo que no se preguntó en esa petición se ignora', async () => {
  const plan = [item(1, [1], [1, 2], 2)];
  const r = await runPasses({
    plan,
    resolve,
    maxAttempts: 1,
    call: async (req) => (req.pass === 1 ? reply(req, [placedAt('p1-f1', 1, 0.6), notFound('p1-f2')]) : reply(req, [placedAt('p1-f1', 2, 0.99), placedAt('p1-f2', 2, 0.3)])),
  });
  assert.deepEqual([r.outcomes.get('p1-f1').resolved.page, r.outcomes.get('p1-f1').pass], [1, 1], 'p1-f1 no se re-preguntó');
  assert.deepEqual([r.outcomes.get('p1-f2').resolved.page, r.outcomes.get('p1-f2').pass], [2, 2]);
});

test('reintentos: JSON inválido, menos de la mitad válidas o códigos que faltan; maxAttempts=1 no reintenta', async () => {
  const retries = [];
  const plan = [item(1, [1], [1], 2)];
  let n = 0;
  const r = await runPasses({
    plan,
    codes: allCodes,
    resolve,
    call: async (req, info, retry) => {
      retries.push(retry?.kind ?? null);
      n++;
      if (n === 1) return 'no sé';
      if (n === 2) return reply(req, [placedAt('p1-f1'), placedAt('p1-f2')]);
      return reply(req, []);
    },
  });
  assert.deepEqual(retries, [null, 'json']);
  assert.equal(r.outcomes.size, 2);
  assert.equal(r.attempts[1].retry, true);

  const kinds = [];
  let m = 0;
  await runPasses({
    plan: [item(1, [1], [1], 2), item(2, [1], [1], 4)],
    codes: allCodes,
    resolve,
    call: async (req, info, retry) => {
      kinds.push([req.group, retry?.kind ?? null]);
      m++;
      if (m === 2) return reply(req, [placedAt('p2-f1')]); // 1 válida de 4: se reintenta
      return reply(req, req.entries.map((e) => placedAt(e.id)));
    },
  });
  assert.deepEqual(kinds, [
    ['A-p1', null],
    ['A-p2', null],
    ['A-p2', 'json'],
  ]);

  const once = [];
  await runPasses({ plan, resolve, maxAttempts: 1, call: async (req, info, retry) => (once.push(retry), 'nada') });
  assert.equal(once.length, 2, 'una llamada por pasada, sin reintentos');
  assert.ok(once.every((x) => x === null));
});

test('los códigos que faltan provocan un reintento con aviso de imágenes y solo cuentan los de la petición', async () => {
  const seen = [];
  let n = 0;
  const r = await runPasses({
    plan: [item(2, [3], [3], 1)],
    codes: allCodes,
    resolve,
    call: async (req, info, retry) => {
      seen.push(retry);
      n++;
      // A-p1 o B-p9 no están en la petición: no se exigen.
      if (n === 1) return JSON.stringify({ images: { 'A-p2': 'K7F2' }, fields: [placedAt('p2-f1')] });
      return JSON.stringify({ images: { 'A-p2': 'K7F2', 'B-p3': 'k7f2' }, fields: [placedAt('p2-f1')] });
    },
  });
  assert.deepEqual(seen, [null, { kind: 'images', missing: ['B-p3'] }]);
  assert.equal(r.attempts[0].imagesMissing, 1);
  assert.equal(r.outcomes.get('p2-f1').resolved.ok, true);
});

test('la primera petición hace de prueba: si no lee las imágenes, images_not_read y no se gastan más', async () => {
  let calls = 0;
  await assert.rejects(
    runPasses({ plan: [item(1, [1], [1]), item(2, [2], [2])], codes: allCodes, resolve, call: async () => (calls++, JSON.stringify({ images: { 'A-p1': 'ZZZZ' }, fields: [] })) }),
    (e) => e.code === 'images_not_read' && /2 de 2 imágenes sin leer/.test(e.message) && e.request.group === 'A-p1',
  );
  assert.equal(calls, 2, 'los dos intentos de la primera petición');

  // Una petición posterior que no lee las imágenes solo deja sus campos sin colocar.
  const r = await runPasses({
    plan: [item(1, [1], [1, 2], 1), item(2, [2], [2, 1], 1)],
    codes: allCodes,
    resolve,
    maxAttempts: 1,
    call: async (req) => (req.group === 'A-p1' ? reply(req, [placedAt('p1-f1')]) : JSON.stringify({ images: {}, fields: [placedAt('p2-f1')] })),
  });
  assert.equal(r.outcomes.get('p1-f1').resolved.ok, true);
  assert.equal(r.outcomes.has('p2-f1'), false);
});

test('Copilot (minMatch 2) tolera lecturas parciales de los códigos', async () => {
  const r = await runPasses({
    plan: [item(1, [1], [1], 1)],
    codes: { 'A-p1': 'V62J', 'B-p1': 'CVBH' },
    minMatch: 2,
    resolve,
    call: async () => JSON.stringify({ images: { 'A-p1': '?62?', 'B-p1': 'CV??' }, fields: [placedAt('p1-f1')] }),
  });
  assert.equal(r.requests, 1);
  assert.equal(r.outcomes.get('p1-f1').resolved.ok, true);
});

test(`tope: como mucho ${MAX_REQUESTS_PER_PDF} llamadas por PDF (reintentos incluidos) y se devuelve lo colocado`, async () => {
  const plan = [1, 2, 3, 4, 5].map((p) => item(p, [p], [p, 6, 7], 2));
  const stages = [];
  const r = await runPasses({
    plan,
    resolve,
    onStage: (s, n) => stages.push(n),
    call: async (req) => (req.pageA === 1 ? reply(req, [placedAt('p1-f1'), placedAt('p1-f2')]) : 'sin json'),
  });
  assert.equal(r.requests, MAX_REQUESTS_PER_PDF);
  assert.deepEqual(stages, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(r.capReached, true);
  assert.equal(r.outcomes.size, 2);
  // Sin trabajo pendiente no se marca el tope aunque se gaste justo el máximo.
  const exact = await runPasses({ plan: [item(1, [1], [1], 1)], resolve, maxRequests: 1, call: async (req) => reply(req, [placedAt('p1-f1')]) });
  assert.equal(exact.capReached, false);
});

test('errores: timeout/cli_error/images_not_read con campos colocados dejan parcial; sin colocados, o limit/aborted/missing, se lanzan', async () => {
  const plan = [item(1, [1], [1], 1), item(2, [2], [2], 1)];
  const fail = (code) => async (req) => {
    if (req.group === 'A-p1') return reply(req, [placedAt('p1-f1')]);
    throw Object.assign(new Error(code), { code });
  };
  for (const code of ['timeout', 'cli_error']) {
    const r = await runPasses({ plan, resolve, call: fail(code) });
    assert.equal(r.aborted, code);
    assert.equal(r.outcomes.get('p1-f1').resolved.ok, true);
    assert.equal(r.requests, 2, 'no sigue preguntando');
  }
  for (const code of ['limit', 'aborted', 'missing']) await assert.rejects(runPasses({ plan, resolve, call: fail(code) }), (e) => e.code === code);
  // images_not_read (solo la primera petición): parcial si el pase sin IA ya colocó algo; si no, se lanza.
  const unread = async () => JSON.stringify({ images: {}, fields: [] });
  const partial = await runPasses({ plan, resolve, codes: allCodes, alreadyPlaced: 3, call: unread });
  assert.equal(partial.aborted, 'images_not_read');
  assert.equal(partial.abortError.code, 'images_not_read');
  assert.equal(partial.abortError.request.group, 'A-p1');
  assert.equal(partial.requests, 2, 'los dos intentos de la prueba y ninguna petición más');
  assert.equal(partial.outcomes.size, 0);
  await assert.rejects(runPasses({ plan, resolve, codes: allCodes, call: unread }), (e) => e.code === 'images_not_read');
  await assert.rejects(runPasses({ plan, resolve, call: async () => { throw Object.assign(new Error('t'), { code: 'timeout' }); } }), (e) => e.code === 'timeout');
});

// ── Plantillas de prompt ──────────────────────────────────────────────────────────────────────────────────────

const ctx = { pagesA: [{ width: 595, height: 842 }, { width: 595, height: 842 }], pagesB: [{ width: 612, height: 792 }, { width: 612, height: 792 }, { width: 612, height: 792 }], pageMap: [null, 1, 2], attached: false };

test('las cuatro plantillas se cargan sin comentarios y se rellenan sin marcadores sueltos', () => {
  const prompts = loadPrompts();
  assert.deepEqual(Object.keys(prompts), PROMPT_NAMES);
  for (const text of Object.values(prompts)) assert.doesNotMatch(text, /<!--/);
  const req1 = { pass: 1, pageA: 2, pagesB: [2, 3], entries: [], notes: [], fresh: true };
  const p1 = requestPrompt(req1, ctx);
  assert.doesNotMatch(p1, /\{\{|\}\}\}/);
  assert.match(p1, /A-p2\.png: la página 2 del PDF A/);
  assert.match(p1, /B-p2\.png, B-p3\.png: páginas del PDF B/);
  assert.match(p1, /B tiene 3 páginas/);
  assert.match(p1, /A 595×842, B 612×792/);
  assert.match(p1, /\(A-p2, B-p2, B-p3\)/);
  assert.match(p1, /\{"images":\{"A-p2":"XXXX","B-p2":"XXXX","B-p3":"XXXX"\},"fields":/);
  assert.match(p1, /B1: sin página de A · B2: A1 · B3: A2/);
  assert.match(p1, /found": false/);
  assert.doesNotMatch(p1, /AVISO|adjuntas a este mensaje/);
  assert.match(requestPrompt(req1, { ...ctx, attached: true, pageMap: undefined }), /adjuntas a este mensaje/);
  assert.doesNotMatch(requestPrompt(req1, { ...ctx, pageMap: undefined }), /Correspondencia/);

  assert.match(requestPrompt(req1, ctx, { kind: 'images', missing: ['B-p3'] }), /AVISO: .*códigos de estas imágenes: B-p3\./);
  assert.match(requestPrompt(req1, ctx, { kind: 'json' }), /AVISO: tu respuesta anterior no era un objeto JSON válido/);

  const req2 = { pass: 2, pageA: 1, pagesB: [3], entries: [], notes: ['- p1-f2 («Razón social»): no venía en la respuesta anterior.'], fresh: true };
  const p2 = requestPrompt(req2, ctx, { kind: 'json' });
  assert.doesNotMatch(p2, /\{\{/);
  assert.match(p2, /segunda vuelta/i);
  assert.match(p2, /páginas de B que aún no habías visto \(B-p3\)/);
  assert.match(p2, /p1-f2 \(«Razón social»\)/);
  assert.match(p2, /AVISO/);
  assert.match(requestPrompt({ ...req2, fresh: false }, ctx), /mismas páginas de B que ya viste/);
});

// ── Contrato de runProposal (proveedor simulado y CLI inyectado) ──────────────────────────────────────────────

const sample = (f) => fileURLToPath(new URL(`./sample-plano/${f}`, import.meta.url));
const load = async (c) => ({ aBytes: await readFile(sample(`A-${c}.pdf`)), bBytes: await readFile(sample(`B-${c}.pdf`)), template: JSON.parse(await readFile(sample(`A-${c}.json`), 'utf8')) });

test('runProposal simulado recorre las pasadas y cumple el contrato con la app', async () => {
  const { runProposal } = await import('../ai-helper/pipeline.mjs');
  process.env.AI_HELPER_FAKE = '1';
  process.env.AI_HELPER_TEXT_FIRST = '0'; // todo por la IA (el pase sin IA tiene sus propias pruebas)
  try {
    const stages = [];
    const events = [];
    const r = await runProposal({ provider: 'fake', ...(await load('solicitud-portada-nueva')), onStage: (s, n) => stages.push(n ? `${s}${n}` : s), onEvent: (e) => events.push(e.type) });
    assert.equal(r.details.placed, r.rows.length);
    assert.deepEqual(stages, ['reading', 'asking1', 'asking2', 'resolving']);
    assert.deepEqual(events, ['sent', 'resolved']);
    assert.equal(r.details.requests, 2);
    assert.deepEqual(r.details.plan, [
      { group: 'A-p1', candidatesB: ['B-p1', 'B-p2', 'B-p3'], fields: 3 },
      { group: 'A-p2', candidatesB: ['B-p1', 'B-p2', 'B-p3'], fields: 3 },
    ]);
    assert.deepEqual(r.details.attempts.map((a) => [a.n, a.pass, a.group, a.images.length, a.fields]), [
      [1, 1, 'A-p1', 4, 3],
      [2, 1, 'A-p2', 4, 3],
    ]);
    assert.ok(r.details.sent.files.some((f) => f.name === 'fields.json'));
    assert.ok(!r.details.sent.files.some((f) => f.name.endsWith('.pdf')), 'los PDF no se envían');
    assert.equal(r.details.diagnosis, null);

    // Un campo que ya no existe en B se re-pregunta (pasada 2) y queda sin colocar: diagnóstico «partial».
    const c = await runProposal({ provider: 'fake', ...(await load('contrato-etiquetas-cambian')) });
    assert.ok(c.details.attempts.some((a) => a.pass === 2));
    assert.equal(c.details.diagnosis, 'partial');
    // B tiene 1 página y ya se envió: el simulado dice absent y el campo queda como «no existe en B».
    assert.ok(c.details.notPlaced.no_existe_en_b > 0);
    assert.ok(c.rows.some((r) => !r.ok && r.why === 'no_existe_en_b'));
    assert.ok(c.rows.filter((r) => r.ok).every((r) => r.source === 'ai' && typeof r.snapped === 'boolean'));
    assert.equal(c.details.placedWithoutAi, 0);
  } finally {
    delete process.env.AI_HELPER_FAKE;
    delete process.env.AI_HELPER_TEXT_FIRST;
  }
});

test('runProposal: el pase sin IA coloca sin llamadas y lo marca en el contrato (source, snapped, placedWithoutAi)', async () => {
  const { runProposal } = await import('../ai-helper/pipeline.mjs');
  process.env.AI_HELPER_FAKE = '1';
  try {
    const stages = [];
    // Todas las etiquetas de A están idénticas y únicas en B, con su línea a la derecha: 0 peticiones.
    const r = await runProposal({ provider: 'fake', ...(await load('solicitud-portada-nueva')), onStage: (st, n) => stages.push(n ? `${st}${n}` : st) });
    assert.equal(r.details.requests, 0);
    assert.deepEqual(r.details.attempts, []);
    assert.deepEqual(r.details.plan, []);
    assert.deepEqual(stages, ['reading', 'resolving']);
    assert.equal(r.details.placed, 6);
    assert.equal(r.details.placedWithoutAi, 6);
    assert.equal(r.details.diagnosis, null);
    for (const row of r.rows) {
      assert.equal(row.ok, true);
      assert.equal(row.source, 'text');
      assert.equal(row.snapped, true);
      assert.equal(row.confidence, 0.75);
      assert.match(row.reason, /^Colocado sin IA: etiqueta «.+» idéntica y única en B, hueco a la derecha$/);
    }
    // Mezcla: lo que no se coloca sin IA va a la IA (y solo eso se envía).
    const f = await runProposal({ provider: 'fake', ...(await load('factura-desplazada')) });
    assert.equal(f.details.placedWithoutAi, 7);
    assert.ok(f.details.requests >= 1);
    assert.equal(f.details.plan.reduce((n, p) => n + p.fields, 0), 3);
    assert.equal(f.rows.filter((x) => x.source === 'text').length, 7);
    assert.ok(f.rows.some((x) => x.source === 'ai'));

    // AI_HELPER_TEXT_FIRST=0 lo desactiva.
    process.env.AI_HELPER_TEXT_FIRST = '0';
    const off = await runProposal({ provider: 'fake', ...(await load('solicitud-portada-nueva')) });
    assert.equal(off.details.placedWithoutAi, 0);
    assert.equal(off.details.requests, 2);
  } finally {
    delete process.env.AI_HELPER_FAKE;
    delete process.env.AI_HELPER_TEXT_FIRST;
  }
});

test('runProposal: tras dos intentos sin códigos y sin nada colocado falla con images_not_read y lleva los detalles', async () => {
  const { runProposal } = await import('../ai-helper/pipeline.mjs');
  const dirs = [];
  const runCliImpl = async (provider, cwd) => {
    dirs.push(cwd);
    return { ok: true, seconds: 1, code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', result: '{"images":{},"fields":[]}', num_turns: 1 }) };
  };
  process.env.AI_HELPER_TEXT_FIRST = '0'; // sin el pase sin IA no hay nada colocado antes de la prueba
  try {
    await assert.rejects(runProposal({ provider: 'claude', ...(await load('alta-banco-otra-pagina')), runCliImpl }), (e) => {
      assert.equal(e.code, 'images_not_read');
      assert.equal(e.details.requests, 2);
      assert.deepEqual(e.details.attempts.map((a) => [a.n, a.group, a.retry]), [[1, 'A-p1', false], [2, 'A-p1', true]]);
      return true;
    });
  } finally {
    delete process.env.AI_HELPER_TEXT_FIRST;
  }
  assert.equal(dirs[0], dirs[1], 'los reintentos reutilizan la carpeta de la petición');
});

test('runProposal: images_not_read con campos colocados sin IA devuelve un parcial con ellos (aborted, partial)', async () => {
  const { runProposal } = await import('../ai-helper/pipeline.mjs');
  let calls = 0;
  const runCliImpl = async () => (calls++, { ok: true, seconds: 1, code: 0, stderr: '', stdout: JSON.stringify({ type: 'result', result: '{"images":{},"fields":[]}', num_turns: 1 }) });
  const r = await runProposal({ provider: 'claude', ...(await load('alta-banco-otra-pagina')), runCliImpl });
  assert.equal(calls, 2, 'solo los dos intentos de la primera petición');
  assert.equal(r.details.aborted, 'images_not_read');
  assert.equal(r.details.diagnosis, 'partial');
  assert.equal(r.details.requests, 2);
  assert.ok(r.details.placedWithoutAi > 0);
  assert.equal(r.details.placed, r.details.placedWithoutAi);
  const ok = r.rows.filter((x) => x.ok);
  assert.equal(ok.length, r.details.placedWithoutAi);
  assert.ok(ok.every((x) => x.source === 'text' && x.snapped === true));
  // Los no colocados siguen el contrato de siempre (sin respuesta de la IA).
  assert.ok(r.rows.filter((x) => !x.ok).every((x) => x.why === 'sin_respuesta'));
  assert.equal(r.details.notPlaced.sin_respuesta, r.rows.length - ok.length);
  assert.match(r.warnings[0], /^Lectura de imágenes fallida en la primera petición: \d+ de \d+ imágenes sin leer/);
});
