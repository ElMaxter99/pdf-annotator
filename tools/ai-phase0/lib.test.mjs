import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPlan, candidatePagesB, norm, readingOrder, textHits, failureNote, fillTemplate, findText, flattenFields, mergeOutcome, nearbyTexts, pagesFromMap, parseJsonFromText, planRetry, rankPagesB, resolveProposal, score, stripTemplateComments, summarize, usefulPagesA, validateProposals, wordsOf } from './lib.mjs';

const textsA = [{ page: 1, text: 'Cliente', x: 50, y: 720 }, { page: 1, text: 'NIF', x: 50, y: 680 }];
const textsB = [{ page: 2, text: 'Cliente', x: 60, y: 500 }, { page: 1, text: 'Cliente', x: 10, y: 10 }];
const entry = { id: 'p1-f1', page: 1, field: { x: 150, y: 722 } };

test('flattenFields da ids estables', () => {
  const f = flattenFields({ pages: [{ num: 1, fields: [{}, {}] }, { num: 2, fields: [{}] }] });
  assert.deepEqual(f.map((e) => e.id), ['p1-f1', 'p1-f2', 'p2-f1']);
});

test('nearbyTexts ordena por cercanía con desplazamiento', () => {
  const n = nearbyTexts(textsA, 1, { x: 150, y: 722 });
  assert.equal(n[0].text, 'Cliente');
  assert.deepEqual([n[0].dx, n[0].dy], [100, 2]);
});

test('parseJsonFromText admite vallas y texto alrededor', () => {
  assert.deepEqual(parseJsonFromText('Aquí va:\n```json\n[{"a":"x]"}]\n```\nfin'), [{ a: 'x]' }]);
  assert.equal(parseJsonFromText('sin json'), null);
});

test('validateProposals descarta ids desconocidos y marca los que faltan', () => {
  const r = validateProposals([{ id: 'p1-f1', page: 2, anchorA: 'Cliente', anchorB: 'Cliente' }, { id: 'zzz' }], new Set(['p1-f1', 'p1-f2']));
  assert.equal(r.proposals.length, 1);
  assert.equal(r.errors.length, 2);
});

test('findText elige el texto más cercano y tolera acentos y mayúsculas', () => {
  assert.equal(findText([{ page: 1, text: 'Dirección', x: 1, y: 1 }], 1, 'DIRECCION', 0, 0).x, 1);
  assert.equal(findText(textsB, 2, 'cliente', 0, 0).y, 500);
  assert.equal(findText(textsB, 3, 'cliente', 0, 0), null);
});

test('resolveProposal suma el desplazamiento del campo al ancla de B', () => {
  const p = { found: true, page: 2, anchorA: 'Cliente', anchorB: 'Cliente', dx: 3, dy: -1 };
  assert.deepEqual(resolveProposal(p, entry, textsA, textsB), { ok: true, page: 2, x: 163, y: 501, snapped: false, method: 'offset' });
  assert.equal(resolveProposal({ ...p, anchorB: 'Nada' }, entry, textsA, textsB).why, 'ancla_B_no_encontrada');
});

test('score trata los campos ausentes', () => {
  assert.deepEqual(score({ ok: false, why: 'sin_resultado' }, { gone: true }), { gone: true, goneOk: true });
  assert.equal(score({ ok: true, page: 1, x: 1, y: 1 }, { gone: true }).goneOk, false);
});

test('score y summarize', () => {
  const s = score({ ok: true, page: 2, x: 163, y: 501, snapped: false, method: 'offset' }, { page: 2, field: { x: 163, y: 503 } });
  assert.deepEqual(s, { pageOk: true, err: 2 });
  assert.equal(summarize([{ resolved: { ok: true }, score: s }]).within2, 1);
});

test('parseJsonFromText con predicado salta listas ajenas como [1]', async () => {
  const { looksLikeProposals } = await import('./lib.mjs');
  const txt = 'He mirado [1] y [A-p1.png]. Resultado:\n[{"id":"p1-f1","found":false}]';
  assert.deepEqual(parseJsonFromText(txt, looksLikeProposals), [{ id: 'p1-f1', found: false }]);
});

test('missingImageCodes exige el código de cada imagen y buildPrompt los pide', async () => {
  const { missingImageCodes, buildPrompt } = await import('./lib.mjs');
  const codes = { 'A-p1': 'K7F2', 'B-p1': 'QW9X' };
  assert.deepEqual(missingImageCodes({ images: { 'A-p1': 'k7f2', 'B-p1': 'QW9X' }, fields: [] }, codes), []);
  assert.deepEqual(missingImageCodes({ images: { 'A-p1': 'K7F2' }, fields: [] }, codes), ['B-p1']);
  assert.deepEqual(missingImageCodes([{ id: 'x' }], codes), ['A-p1', 'B-p1']);
  assert.deepEqual(missingImageCodes(null, codes), ['A-p1', 'B-p1']);
  assert.match(buildPrompt({ pagesA: 1, pagesB: 1, sizeA: '1×1', sizeB: '1×1', codes }), /"images"/);
  assert.doesNotMatch(buildPrompt({ pagesA: 1, pagesB: 1, sizeA: '1×1', sizeB: '1×1' }), /"images"/);
});

test('missingImageCodes admite «A-p1.png» y un carácter mal transcrito, pero no una respuesta inventada', async () => {
  const { missingImageCodes } = await import('./lib.mjs');
  const codes = { 'A-p1': 'K7F2', 'B-p1': 'QW9X' };
  assert.deepEqual(missingImageCodes({ images: { 'A-p1.png': 'K7F2', 'B-p1.png': 'QW9Y' }, fields: [] }, codes), []);
  assert.deepEqual(missingImageCodes({ images: { 'A-p1': 'K7F2', 'B-p1': 'ZZZZ' }, fields: [] }, codes), ['B-p1']);
  assert.deepEqual(missingImageCodes({ images: { 'A-p1': 'K7', 'B-p1': 'QW9X' }, fields: [] }, codes), ['A-p1']);
});

test('describeImageCodes explica qué devolvió la IA en cada imagen que falla', async () => {
  const { describeImageCodes } = await import('./lib.mjs');
  const r = describeImageCodes({ images: { 'A-p1': 'zzzz', 'B-p1.png': 'wxyz' } }, { 'A-p1': 'ABCD', 'B-p1': 'WXYZ', 'B-p2': 'QRST' });
  assert.deepEqual(r.missing, ['A-p1', 'B-p2']);
  assert.deepEqual(r.given[0], { name: 'A-p1', got: 'ZZZZ', expected: 'ABCD' });
  assert.equal(r.returned, 2);
});

test('describeImageCodes con minMatch acepta lecturas parciales con «?»', async () => {
  const { describeImageCodes } = await import('./lib.mjs');
  const codes = { 'A-p1': 'V62J', 'B-p1': 'CVBH' };
  assert.deepEqual(describeImageCodes({ images: { 'A-p1': '?62?', 'B-p1': 'CVBH' } }, codes).missing, ['A-p1']);
  assert.deepEqual(describeImageCodes({ images: { 'A-p1': '?62?', 'B-p1': 'CVBH' } }, codes, { minMatch: 2 }).missing, []);
  assert.deepEqual(describeImageCodes({ images: { 'A-p1': '????', 'B-p1': 'C???' } }, codes, { minMatch: 2 }).missing, ['A-p1', 'B-p1']);
});

test('buildPrompt cuenta la correspondencia de páginas solo si el usuario la dio', async () => {
  const { buildPrompt } = await import('./lib.mjs');
  const base = { pagesA: 3, pagesB: 4, sizeA: '1×1', sizeB: '1×1' };
  assert.doesNotMatch(buildPrompt(base), /Correspondencia de páginas/);
  const prompt = buildPrompt({ ...base, pageMap: [null, 1, 2, 3] });
  assert.match(prompt, /B1: sin página de A · B2: A1 · B3: A2 · B4: A3/);
});

// ── Traslado por partes ───────────────────────────────────────────────────────────────────────────────────────

test('usefulPagesA: solo las páginas de A con campos, sin repetir, en orden y existentes', () => {
  const entries = [{ page: 3 }, { page: 1 }, { page: 3 }, { page: 12 }];
  assert.deepEqual(usefulPagesA(entries, 10), [1, 3]);
  assert.deepEqual(usefulPagesA([]), []);
});

test('wordsOf normaliza y descarta palabras cortas y con números', () => {
  assert.deepEqual(wordsOf('Razón SOCIAL: 2024 N.º abc12 de IVA'), ['razon', 'social', 'iva']);
});

const tA = [
  { page: 1, text: 'Datos del cliente', x: 0, y: 0 },
  { page: 1, text: 'Dirección postal', x: 0, y: 0 },
  { page: 2, text: 'Firma', x: 0, y: 0 },
];
const tB = [
  { page: 1, text: 'Portada nueva', x: 0, y: 0 },
  { page: 2, text: 'Condiciones 2024', x: 0, y: 0 },
  { page: 3, text: 'Firma del cliente', x: 0, y: 0 },
  { page: 4, text: 'Datos del cliente', x: 0, y: 0 },
  { page: 4, text: 'Dirección postal', x: 0, y: 0 },
  { page: 5, text: 'Anexo', x: 0, y: 0 },
];

test('rankPagesB ordena por palabras compartidas y desempata por cercanía', () => {
  assert.deepEqual(rankPagesB({ pageA: 1, textsA: tA, textsB: tB, pagesB: 5 }), [4, 3, 1, 2, 5]);
  assert.deepEqual(rankPagesB({ pageA: 2, textsA: tA, textsB: tB, pagesB: 5 }).slice(0, 2), [3, 2]);
});

test('candidatePagesB sin tabla: las K mejores, o todas si B tiene K o menos', () => {
  assert.deepEqual(candidatePagesB({ pageA: 1, textsA: tA, textsB: tB, pagesB: 5 }), [1, 3, 4]);
  assert.deepEqual(candidatePagesB({ pageA: 1, textsA: tA, textsB: tB, pagesB: 5, k: 1 }), [4]);
  assert.deepEqual(candidatePagesB({ pageA: 1, textsA: tA, textsB: tB.filter((t) => t.page <= 3), pagesB: 3 }), [1, 2, 3]);
});

test('candidatePagesB con tabla: las páginas de B que apuntan a esa A (sin tope); si ninguna, por palabras', () => {
  const pageMap = [null, 1, 1, 1, 2];
  assert.deepEqual(pagesFromMap(pageMap, 1, 5), [2, 3, 4]);
  assert.deepEqual(candidatePagesB({ pageA: 1, textsA: tA, textsB: tB, pagesB: 5, pageMap }), [2, 3, 4]);
  assert.deepEqual(candidatePagesB({ pageA: 2, textsA: tA, textsB: tB, pagesB: 5, pageMap }), [5]);
  assert.deepEqual(candidatePagesB({ pageA: 3, textsA: tA, textsB: tB, pagesB: 5, pageMap }), [2, 3, 4]);
  assert.deepEqual(pagesFromMap([1, 1, 1], 1, 2), [1, 2], 'ignora páginas de la tabla que B ya no tiene');
  assert.deepEqual(pagesFromMap('basura', 1, 2), []);
});

test('buildPlan: una petición por página útil con solo sus campos', () => {
  const entries = flattenFields({ pages: [{ num: 1, fields: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, { num: 2, fields: [{ x: 3, y: 3 }] }] });
  const plan = buildPlan({ entries, pagesA: 3, textsA: tA, pagesB: 5, textsB: tB });
  assert.deepEqual(plan.map((p) => [p.group, p.candidatesB, p.fields.map((f) => f.id)]), [
    ['A-p1', [1, 3, 4], ['p1-f1', 'p1-f2']],
    ['A-p2', [1, 2, 3], ['p2-f1']],
  ]);
  assert.equal(plan[0].rankB.length, 5);
});

test('planRetry: siguientes páginas no enviadas de 3 en 3; si no quedan, las mismas', () => {
  const rankB = [4, 3, 1, 2, 5, 6, 7];
  assert.deepEqual(planRetry({ candidatesB: [1, 3, 4], rankB, sentB: new Set([1, 3, 4]) }), { pagesB: [2, 5, 6], fresh: true });
  assert.deepEqual(planRetry({ candidatesB: [1, 3, 4], rankB, sentB: new Set([1, 2, 3, 4, 5, 6]) }), { pagesB: [7], fresh: true });
  assert.deepEqual(planRetry({ candidatesB: [1, 3, 4], rankB, sentB: new Set(rankB) }), { pagesB: [1, 3, 4], fresh: false });
});

test('mergeOutcome: gana el colocado y, entre colocados, la mayor confianza', () => {
  const ok = (c) => ({ proposal: { confidence: c }, resolved: { ok: true } });
  const bad = { proposal: { confidence: 1 }, resolved: { ok: false, why: 'sin_resultado' } };
  assert.equal(mergeOutcome(undefined, bad), bad);
  const low = ok(0.4);
  const high = ok(0.8);
  assert.equal(mergeOutcome(low, bad), low);
  assert.equal(mergeOutcome(bad, low), low);
  assert.equal(mergeOutcome(low, high), high);
  assert.equal(mergeOutcome(high, low), high);
  assert.equal(mergeOutcome(low, ok(0.4)), low, 'empate: se queda el primero');
});

test('failureNote explica el motivo de cada fallo', () => {
  const e = { id: 'p1-f2', field: { mapField: 'Razón social' } };
  assert.match(failureNote(e, { proposal: { reason: 'no está' }, resolved: { ok: false, why: 'sin_resultado' } }), /p1-f2 \(«Razón social»\): respondiste found:false \(«no está»\)/);
  assert.match(failureNote(e, { proposal: { anchorA: 'Razon' }, resolved: { ok: false, why: 'ancla_A_no_encontrada' } }), /«Razon» no existe literalmente en textsA\.json/);
  assert.match(failureNote(e, { proposal: { anchorB: 'Razón social', page: 2 }, resolved: { ok: false, why: 'ancla_B_no_encontrada' } }), /«Razón social» no existe literalmente en textsB\.json en la página 2/);
  assert.match(failureNote(e, undefined), /no venía en la respuesta anterior/);
  assert.match(failureNote({ id: 'p1-f1', field: {} }, undefined), /sin nombre/);
});

test('fillTemplate rellena en una pasada y exige todos los marcadores', () => {
  assert.equal(fillTemplate('Hola {{nombre}}, {{ n }}', { nombre: 'Ana', n: 2 }), 'Hola Ana, 2');
  assert.equal(fillTemplate('{{a}}', { a: '{{b}} $& $1' }), '{{b}} $& $1', 'lo insertado no se vuelve a interpretar');
  assert.throws(() => fillTemplate('{{falta}}', {}), /Falta el marcador \{\{falta\}\}/);
  assert.equal(stripTemplateComments('<!-- nota {{x}} -->\n# T\n\n\n\nfin'), '# T\n\nfin\n');
});

test('norm iguala ligaduras, viñetas y espacios alrededor de signos', () => {
  assert.equal(norm('Nombre y apellidos/Razón social:'), norm('Nombre y apellidos / Razón social :'));
  assert.equal(norm('• Productos Especialmente Complejos:'), norm('Productos Especialmente Complejos:'));
  assert.equal(norm('operativa con Renta Fĳa.'), norm('operativa con Renta Fija.'));
  assert.equal(norm('  - Teléfono:'), 'telefono:');
});

test('findText encuentra la etiqueta aunque cambien los espacios alrededor de «/»', () => {
  const texts = [{ page: 1, text: 'Nombre y apellidos / Razón social:', x: 40, y: 700 }];
  const hit = findText(texts, 1, 'Nombre y apellidos/Razón social:', 0, 0);
  assert.equal(hit?.x, 40);
});

test('resolveProposal empareja etiquetas repetidas por orden de lectura y no por cercanía a A', () => {
  // A: dos bloques «Nombre y apellidos:» (arriba y abajo); el campo es del 2.º bloque.
  const tA = [
    { page: 1, text: 'Nombre y apellidos:', x: 50, y: 700 },
    { page: 1, text: 'Nombre y apellidos:', x: 50, y: 400 },
  ];
  // B reestructurada: los dos bloques suben; el 1.º queda más cerca de donde estaba el 2.º de A.
  const tB = [
    { page: 1, text: 'Nombre y apellidos:', x: 60, y: 420 },
    { page: 1, text: 'Nombre y apellidos:', x: 60, y: 200 },
  ];
  const e = { id: 'p1-f2', page: 1, field: { x: 150, y: 400 } };
  const p = { found: true, page: 1, anchorA: 'Nombre y apellidos:', anchorB: 'Nombre y apellidos:', dx: 0, dy: 0 };
  assert.deepEqual(resolveProposal(p, e, tA, tB), { ok: true, page: 1, x: 160, y: 200, snapped: false, method: 'offset' });
});

test('si el número de apariciones no coincide se usa la más cercana, como antes', () => {
  const tA = [
    { page: 1, text: 'Firma', x: 50, y: 700 },
    { page: 1, text: 'Firma', x: 50, y: 400 },
  ];
  const tB = [{ page: 1, text: 'Firma', x: 60, y: 300 }];
  const e = { id: 'p1-f1', page: 1, field: { x: 120, y: 400 } };
  const p = { found: true, page: 1, anchorA: 'Firma', anchorB: 'Firma', dx: 0, dy: 0 };
  assert.deepEqual(resolveProposal(p, e, tA, tB), { ok: true, page: 1, x: 130, y: 300, snapped: false, method: 'offset' });
});

test('readingOrder y textHits: de arriba abajo y exactos antes que parciales', () => {
  const ts = [
    { page: 1, text: 'Total', x: 300, y: 500 },
    { page: 1, text: 'Total', x: 50, y: 500 },
    { page: 1, text: 'Total parcial', x: 50, y: 700 },
  ];
  assert.deepEqual(textHits(ts, 1, 'Total').sort(readingOrder).map((t) => t.x), [50, 300]);
  assert.equal(textHits(ts, 1, 'parcial')[0].text, 'Total parcial');
});


test('códigos de imagen: los caracteres que se confunden al leer cuentan como iguales y el alfabeto no los usa', async () => {
  const { describeImageCodes } = await import('./lib.mjs');
  const { CODE_ALPHABET } = await import('./pdf.mjs');
  // medido con haiku: «7Q85» por «7Q8S», «FOWS» por «F0WS», «NJ2Z» por «NJZ2»
  assert.deepEqual(describeImageCodes({ images: { 'A-p1': '7Q85', 'B-p1': 'FOWS' } }, { 'A-p1': '7Q8S', 'B-p1': 'F0WS' }).missing, []);
  assert.deepEqual(describeImageCodes({ images: { 'A-p1': 'XXXX' } }, { 'A-p1': '7Q8S' }).missing, ['A-p1']);
  for (const c of 'SBZGODQIL502681') assert.ok(!CODE_ALPHABET.includes(c), `el alfabeto no debe tener «${c}»`);
});

test('«igual que en A»: se acepta sin anchorB, la confianza no pasa de 0,6 y se coloca en la posición de A ajustada al hueco', async () => {
  const { validateProposals, resolveProposal, SAME_AS_A_CONFIDENCE } = await import('./lib.mjs');
  const known = new Set(['p1-f1', 'p1-f2']);
  const { proposals, errors } = validateProposals({ fields: [
    { id: 'p1-f1', found: true, page: 2, sameAsA: true, confidence: 0.95, reason: 'misma zona' },
    { id: 'p1-f2', found: true, sameAsA: true, confidence: 0.9 }, // sin página: no vale
  ] }, known);
  assert.equal(proposals.length, 1);
  assert.deepEqual([proposals[0].sameAsA, proposals[0].page, proposals[0].confidence], [true, 2, SAME_AS_A_CONFIDENCE]);
  assert.ok(errors.some((e) => e.startsWith('p1-f2')));
  const entry = { id: 'p1-f1', page: 1, field: { x: 100, y: 500, type: 'text', fontSize: 10 } };
  // sin hueco cerca: misma x,y que en A
  const r = resolveProposal(proposals[0], entry, [], [], { slots: [] });
  assert.deepEqual([r.ok, r.page, r.x, r.y, r.method, r.snapped, r.maxConfidence], [true, 2, 100, 500, 'sameAsA', false, SAME_AS_A_CONFIDENCE]);
  // con una línea a 6 pt: se ajusta a ella
  const snapped = resolveProposal(proposals[0], entry, [], [], { slots: [{ page: 2, kind: 'line', x: 95, y: 494, w: 120, h: 0.6 }] });
  assert.equal(snapped.snapped, true);
  assert.equal(snapped.page, 2);
});
