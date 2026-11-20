// Anclar en B y encajar en el hueco (rc.4): esquema nuevo, resolución por lado, ajuste ≤ 15 pt, convención x,y de la
// app, pase sin IA y «no existe en B». Incluye PDF generados con pdf-lib y leídos con readPdf.
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { failureNote, missingWhy, resolveProposal, validateProposals } from './lib.mjs';
import { runPasses } from './passes.mjs';
import { readPdf } from './pdf.mjs';
import { DEFAULT_FONT_SIZE, FALLBACK_CONFIDENCE, X_CAP, X_WIDTH, boxCenterOf, sideInA, slotKind, slotOnSide, snapToSlot, toFieldXY } from './place.mjs';
import { looksLikeLabel, matchLabelInB, placeByText, placeEntryByText, textFirstEnabled } from './text-first.mjs';
import { slotsFromTexts } from './slots.mjs';

const line = (x, y, w, page = 1) => ({ page, kind: 'line', x, y, w, h: 0.6 });
const box = (x, y, page = 1) => ({ page, kind: 'box', x, y, w: 10, h: 10 });
const T = (text, x, y, page = 1, w) => ({ page, text, x, y, ...(w ? { w } : {}) });
const entry = (field, page = 1, id = 'p1-f1') => ({ id, page, index: 0, field: { fontSize: 10, mapField: 'campo', type: 'text', ...field } });

// ── Esquema de la respuesta ───────────────────────────────────────────────────────────────────────────────────

test('validateProposals: anchorA opcional, side válido o ignorado, absent y anchorB/page obligatorios', () => {
  const ids = new Set(['a', 'b', 'c', 'd', 'e']);
  const { proposals, errors } = validateProposals(
    {
      fields: [
        { id: 'a', found: true, page: 1, anchorB: 'NIF:', side: 'right', confidence: 0.9, reason: 'r' },
        { id: 'b', found: true, page: 2, anchorB: 'Email', anchorA: 'Correo', side: 'diagonal', dx: '3', confidence: 2 },
        { id: 'c', found: false, absent: true, reason: 'B ya no lo pide' },
        { id: 'd', found: true, page: 1, anchorA: 'Solo A' },
        { id: 'e', found: true, anchorB: 'X' },
      ],
    },
    ids,
  );
  assert.deepEqual(proposals[0], { id: 'a', found: true, page: 1, anchorA: null, anchorB: 'NIF:', dx: 0, dy: 0, confidence: 0.9, reason: 'r', side: 'right' });
  assert.equal(proposals[1].side, undefined, 'un lado desconocido se ignora');
  assert.equal(proposals[1].anchorA, 'Correo');
  assert.equal(proposals[1].dx, 3);
  assert.equal(proposals[1].confidence, 1);
  assert.deepEqual(proposals[2], { id: 'c', found: false, absent: true, reason: 'B ya no lo pide' });
  assert.equal(proposals.length, 3);
  assert.deepEqual(errors, ['d: faltan page o anchorB.', 'e: faltan page o anchorB.']);
  // found:false sin absent no lleva la marca
  assert.deepEqual(validateProposals([{ id: 'a', found: false, absent: 'sí' }], new Set(['a'])).proposals[0], { id: 'a', found: false, reason: '' });
});

// ── Convención x,y de la app ──────────────────────────────────────────────────────────────────────────────────

test('toFieldXY: línea = inicio de la línea base tal cual; casilla = «X» de Helvetica centrada (inversa de boxCenterOf)', async () => {
  // Las métricas copiadas coinciden con las de pdf-lib (la app exporta con Helvetica por defecto).
  const doc = await PDFDocument.create();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(helv.widthOfTextAtSize('X', 1), X_WIDTH);
  assert.equal(helv.embedder.font.CapHeight / 1000, X_CAP);

  assert.deepEqual(toFieldXY({ x: 102, y: 702 }, 'line', { fontSize: 11 }), { x: 102, y: 702 });
  const xy = toFieldXY({ x: 55, y: 645 }, 'box', { fontSize: 10 });
  assert.deepEqual(xy, { x: round1(55 - 3.335), y: round1(645 - 3.59) });
  const c = boxCenterOf(xy, { fontSize: 10 });
  assert.ok(Math.abs(c.x - 55) < 0.1 && Math.abs(c.y - 645) < 0.1);
  // sin fontSize, el de la app (14)
  assert.deepEqual(toFieldXY({ x: 50, y: 50 }, 'box', {}), { x: round1(50 - (X_WIDTH * DEFAULT_FONT_SIZE) / 2), y: round1(50 - (X_CAP * DEFAULT_FONT_SIZE) / 2) });
  assert.equal(slotKind({ type: 'check' }), 'box');
  assert.equal(slotKind({ type: 'radio' }), 'box');
  assert.equal(slotKind({ type: 'number' }), 'line');
  assert.equal(slotKind({}), 'line');
});
const round1 = (n) => Math.round(n * 10) / 10;

// ── Resolución por lado ───────────────────────────────────────────────────────────────────────────────────────

test('resolveProposal con side: hueco de ese lado del ancla de B (sin anchorA)', () => {
  const textsB = [T('NIF:', 50, 700, 1, 18), T('Domicilio', 50, 660, 1, 40)];
  const slots = [line(74, 697, 200), line(50, 640, 300)];
  const e = entry({ x: 999, y: 999 });
  const right = resolveProposal({ found: true, page: 1, anchorA: null, anchorB: 'NIF:', side: 'right', dx: 0, dy: 0 }, e, [], textsB, { slots });
  // en la misma línea que la etiqueta: se escribe en su línea base (la raya queda 3 pt por debajo)
  assert.deepEqual(right, { ok: true, page: 1, x: 76, y: 700, snapped: true, method: 'side' });
  const below = resolveProposal({ found: true, page: 1, anchorA: null, anchorB: 'Domicilio', side: 'below', dx: 0, dy: 0 }, e, [], textsB, { slots });
  assert.deepEqual(below, { ok: true, page: 1, x: 52, y: 642, snapped: true, method: 'side' });
});

test('resolveProposal: casilla para check/radio (box-left por defecto si la IA dice «left»)', () => {
  const textsB = [T('Titular', 66, 640), T('Autorizado', 66, 620)];
  const slots = [box(50, 639), box(50, 619)];
  const e = entry({ type: 'check', x: 0, y: 0, fontSize: 10 });
  const r = resolveProposal({ found: true, page: 1, anchorA: null, anchorB: 'Autorizado', side: 'left', dx: 0, dy: 0 }, e, [], textsB, { slots });
  assert.equal(r.method, 'side');
  assert.deepEqual({ x: r.x, y: r.y }, toFieldXY({ x: 55, y: 624 }, 'box', e.field));
});

test('resolveProposal con anchorA y sin side: fórmula de A y ajuste al hueco solo a ≤ 15 pt', () => {
  const textsA = [T('Nombre', 50, 700)];
  const textsB = [T('Nombre', 60, 650)];
  const e = entry({ x: 100, y: 690 });
  const p = { found: true, page: 1, anchorA: 'Nombre', anchorB: 'Nombre', dx: 0, dy: 0 };
  // fórmula: (60 + 50, 650 − 10) = (110, 640); hay una línea a 12 pt por debajo → se ajusta
  const near = resolveProposal(p, e, textsA, textsB, { slots: [line(100, 626, 200)] });
  assert.deepEqual(near, { ok: true, page: 1, x: 110, y: 628, snapped: true, method: 'offset' });
  // a más de 15 pt no se toca
  const far = resolveProposal(p, e, textsA, textsB, { slots: [line(100, 600, 200)] });
  assert.deepEqual(far, { ok: true, page: 1, x: 110, y: 640, snapped: false, method: 'offset' });
  // una casilla no sirve para un campo de texto
  assert.equal(resolveProposal(p, e, textsA, textsB, { slots: [box(105, 636)] }).snapped, false);
  // side sin hueco en ese lado → fórmula (y ajuste)
  const sideMiss = resolveProposal({ ...p, side: 'above' }, e, textsA, textsB, { slots: [line(100, 626, 200)] });
  assert.equal(sideMiss.method, 'offset');
  assert.equal(sideMiss.snapped, true);
});

test('snapToSlot: casillas por centro de la «X»; líneas metiendo x dentro del trazo', () => {
  const f = { type: 'check', fontSize: 10 };
  const xy = toFieldXY({ x: 62, y: 650 }, 'box', f); // centro a 8,1 pt del de la casilla (55, 645)
  const s = snapToSlot(xy, 'box', f, [box(50, 640)]);
  assert.deepEqual({ x: s.x, y: s.y }, toFieldXY({ x: 55, y: 645 }, 'box', f));
  assert.equal(snapToSlot(toFieldXY({ x: 80, y: 645 }, 'box', f), 'box', f, [box(50, 640)]), null);
  const l = snapToSlot({ x: 40, y: 705 }, 'line', {}, [line(50, 700, 100)]);
  assert.deepEqual({ x: l.x, y: l.y }, { x: 52, y: 702 });
});

test('resolveProposal sin hueco ni anchorA: respaldo junto al ancla de B con confianza ≤ 0,5', () => {
  const textsB = [T('Email', 50, 600, 1, 25)];
  const e = entry({ x: 0, y: 0 });
  const r = resolveProposal({ found: true, page: 1, anchorA: null, anchorB: 'Email', side: 'right', dx: 0, dy: 0 }, e, [], textsB, { slots: [] });
  assert.deepEqual(r, { ok: true, page: 1, x: 81, y: 600, snapped: false, method: 'fallback', maxConfidence: FALLBACK_CONFIDENCE });
  const below = resolveProposal({ found: true, page: 1, anchorA: null, anchorB: 'Email', dx: 0, dy: -2 }, e, [], textsB, { slots: [] });
  assert.equal(below.method, 'fallback');
  assert.equal(below.x, 81, 'sin side: a la derecha');
  assert.equal(below.y, 598, 'dx/dy como último recurso');
  // anchorA que no existe: sin side falla como antes; con side se ignora y se coloca por B
  assert.equal(resolveProposal({ found: true, page: 1, anchorA: 'Nada', anchorB: 'Email', dx: 0, dy: 0 }, e, [], textsB).why, 'ancla_A_no_encontrada');
  assert.equal(resolveProposal({ found: true, page: 1, anchorA: 'Nada', anchorB: 'Email', side: 'right', dx: 0, dy: 0 }, e, [], textsB).ok, true);
});

test('slotOnSide: encima y a la izquierda solo si se piden; estricto (sin hueco en ese lado → null)', () => {
  const slots = [line(50, 715, 150), line(10, 700, 30)];
  const firma = T('Firma', 60, 700, 1, 25);
  assert.equal(slotOnSide(firma, slots, 'above').side, 'above');
  assert.equal(slotOnSide(firma, slots, 'left').side, 'left');
  assert.equal(slotOnSide(firma, slots, 'right'), null);
  assert.equal(slotOnSide(firma, slots, 'below'), null);
  assert.equal(slotOnSide(firma, slots, 'box-left', { kind: 'box' }), null);
});

// ── «No existe en B» ──────────────────────────────────────────────────────────────────────────────────────────

test('missingWhy: no_existe_en_b solo con absent y todas las páginas de B consultadas', () => {
  const absent = { proposal: { found: false, absent: true }, resolved: { ok: false, why: 'sin_resultado' } };
  assert.equal(missingWhy(absent, new Set([1, 2, 3]), 3), 'no_existe_en_b');
  assert.equal(missingWhy(absent, new Set([1, 2]), 3), 'sin_resultado');
  assert.equal(missingWhy({ ...absent, proposal: { found: false } }, new Set([1, 2, 3]), 3), 'sin_resultado');
  assert.equal(missingWhy({ proposal: {}, resolved: { ok: false, why: 'ancla_B_no_encontrada' } }, new Set([1]), 1), 'ancla_B_no_encontrada');
  assert.match(failureNote({ id: 'p1-f1', field: { mapField: 'Fax' } }, absent), /no existe en B.*absent:true/);
});

test('runPasses registra con qué páginas de B se preguntó cada campo (askedB) y cuenta los ya colocados sin IA', async () => {
  const fields = [{ id: 'p1-f1', page: 1, index: 0, field: { x: 1, y: 1 } }];
  const plan = [{ group: 'A-p1', pageA: 1, candidatesB: [1, 2, 3], rankB: [1, 2, 3, 4, 5], fields }];
  const call = async () => JSON.stringify([{ id: 'p1-f1', found: false, absent: true, reason: 'no' }]);
  const resolve = (p) => (p.found ? { ok: true } : { ok: false, why: 'sin_resultado' });
  const r = await runPasses({ plan, call, resolve });
  assert.deepEqual([...r.askedB.get('p1-f1')].sort(), [1, 2, 3, 4, 5]);
  assert.equal(missingWhy(r.outcomes.get('p1-f1'), r.askedB.get('p1-f1'), 5), 'no_existe_en_b');
  // un timeout sin nada colocado por la IA, pero con campos colocados sin IA, deja parcial
  const boom = async () => {
    throw Object.assign(new Error('t'), { code: 'timeout' });
  };
  const partial = await runPasses({ plan, call: boom, resolve, alreadyPlaced: 2 });
  assert.equal(partial.aborted, 'timeout');
  await assert.rejects(runPasses({ plan, call: boom, resolve }), (e) => e.code === 'timeout');
});

// ── Pase sin IA ───────────────────────────────────────────────────────────────────────────────────────────────

test('looksLikeLabel y textFirstEnabled', () => {
  assert.equal(looksLikeLabel('NIF'), true);
  assert.equal(looksLikeLabel('12/34'), false);
  assert.equal(looksLikeLabel('a1'), false);
  assert.equal(looksLikeLabel('x'.repeat(61)), false);
  assert.equal(textFirstEnabled({}), true);
  assert.equal(textFirstEnabled({ AI_HELPER_TEXT_FIRST: '1' }), true);
  assert.equal(textFirstEnabled({ AI_HELPER_TEXT_FIRST: '0' }), false);
});

test('pase sin IA: etiqueta única en B → hueco del mismo lado que en A (aunque B la mueva de página)', () => {
  const textsA = [T('Teléfono', 50, 700, 1, 40)];
  const textsB = [T('Otra cosa', 50, 760, 1, 40), T('Teléfono', 70, 500, 2, 40)];
  const slotsB = [line(116, 497, 150, 2)];
  const e = entry({ x: 96, y: 700 }); // a la derecha de la etiqueta en A
  const r = placeEntryByText(e, { textsA, textsB, slotsB });
  assert.equal(r.resolved.page, 2);
  assert.deepEqual({ x: r.resolved.x, y: r.resolved.y }, { x: 118, y: 500 });
  assert.equal(r.proposal.confidence, 0.75);
  assert.equal(r.proposal.side, 'right');
  assert.equal(r.proposal.reason, 'Colocado sin IA: etiqueta «Teléfono» idéntica y única en B, hueco a la derecha');
});

test('pase sin IA: etiqueta repetida igual en A y B → se empareja por orden de lectura', () => {
  const textsA = [T('Total', 50, 700, 1, 25), T('Total', 50, 500, 1, 25)];
  const textsB = [T('Total', 60, 650, 1, 25), T('Total', 60, 400, 1, 25)];
  const slotsB = [line(90, 647, 100), line(90, 397, 100)];
  const r = placeEntryByText(entry({ x: 80, y: 500 }), { textsA, textsB, slotsB });
  assert.equal(r.resolved.y, 400);
  assert.match(r.proposal.reason, /la 2\.ª de 2 por orden de lectura/);
  assert.deepEqual(matchLabelInB(textsA[0], textsA, textsB), { b: textsB[0], index: 0, of: 2 });
  // distinto número de apariciones: ambiguo, a la IA
  assert.equal(matchLabelInB(textsA[0], textsA, [...textsB, T('Total', 60, 100)]), null);
});

test('pase sin IA: sin hueco claro, etiqueta ausente o ambigua → va a la IA; no salta a la etiqueta de otro dato', () => {
  const textsA = [T('Base imponible', 50, 480, 1, 74), T('IVA', 50, 440, 1, 20)];
  const textsB = [T('Base', 50, 460, 1, 22), T('IVA', 50, 420, 1, 20)];
  const slotsB = [line(80, 457, 200), line(76, 417, 200)];
  // «Base imponible» ya no está igual en B: aunque «IVA» sí esté (y tenga hueco encima), no se usa
  const r = placeByText([entry({ x: 132, y: 482 })], { textsA, textsB, slotsB });
  assert.equal(r.placed.size, 0);
  assert.equal(r.rest.length, 1);
  // etiqueta única pero sin hueco en ese lado
  assert.equal(placeEntryByText(entry({ x: 80, y: 440 }), { textsA, textsB, slotsB: [] }), null);
});

test('pase sin IA: casillas con el texto de la opción a la derecha (box-left)', () => {
  const textsA = [T('Apoderado', 66, 600)];
  const textsB = [T('Apoderado', 166, 300)];
  const slotsB = [box(150, 299)];
  const f = { type: 'check', fontSize: 10, ...toFieldXY({ x: 55, y: 604 }, 'box', { fontSize: 10 }) };
  assert.equal(sideInA(f, textsA[0], 'box'), 'box-left');
  const r = placeEntryByText(entry(f), { textsA, textsB, slotsB });
  assert.equal(r.proposal.side, 'box-left');
  assert.deepEqual({ x: r.resolved.x, y: r.resolved.y }, toFieldXY({ x: 155, y: 304 }, 'box', f));
  assert.match(r.proposal.reason, /casilla a la izquierda$/);
});

// ── De extremo a extremo con PDF generados (pdf-lib → readPdf) ────────────────────────────────────────────────

/** Formulario: etiquetas con su raya y casillas. `variant` B mueve el NIF a otra posición con la raya debajo y
 * añade «Nombre y apellidos:» (que A no tenía cerca del campo). */
async function makeForm(file, variant) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const text = (s, x, y) => page.drawText(s, { x, y, size: 10, font });
  const width = (s) => font.widthOfTextAtSize(s, 10);
  const rule = (x0, x1, y) => page.drawLine({ start: { x: x0, y }, end: { x: x1, y }, thickness: 0.6, color: rgb(0.5, 0.5, 0.5) });
  const check = (x, y) => page.drawRectangle({ x, y, width: 10, height: 10, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
  if (variant === 'A') {
    text('Teléfono', 50, 760);
    rule(50 + width('Teléfono') + 6, 300, 757);
    text('NIF', 50, 720);
    rule(50 + width('NIF') + 6, 300, 717);
    text('Y DE OTRA PARTE', 50, 680);
    rule(50, 400, 650); // nombre sin etiqueta propia
    ['Titular', 'Autorizado'].forEach((o, i) => {
      check(50, 600 - i * 20 - 1);
      text(o, 66, 600 - i * 20);
    });
  } else {
    text('Y DE OTRA PARTE', 50, 790);
    text('Nombre y apellidos:', 50, 770);
    rule(50 + width('Nombre y apellidos:') + 6, 500, 767);
    text('NIF', 300, 700);
    rule(300, 540, 682); // ahora debajo
    text('Teléfono', 50, 700);
    rule(50 + width('Teléfono') + 6, 250, 697);
    ['Autorizado', 'Titular'].forEach((o, i) => {
      check(200, 560 - i * 30 - 1);
      text(o, 216, 560 - i * 30);
    });
  }
  await writeFile(file, await doc.save());
}

test('extremo a extremo: PDF reales, pase sin IA + respuesta de la IA anclada en B', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'place-'));
  try {
    await makeForm(path.join(dir, 'A.pdf'), 'A');
    await makeForm(path.join(dir, 'B.pdf'), 'B');
    const A = await readPdf(path.join(dir, 'A.pdf'));
    const B = await readPdf(path.join(dir, 'B.pdf'));
    assert.ok(A.texts.every((t) => t.w > 0), 'readPdf da el ancho de los textos');
    const tA = (s) => A.texts.find((t) => t.text === s);
    const lineEnd = (s) => tA(s).x + tA(s).w;
    const entries = [
      entry({ x: round1(lineEnd('Teléfono') + 8), y: 760, mapField: 'telefono' }, 1, 'p1-f1'),
      entry({ x: round1(lineEnd('NIF') + 8), y: 720, mapField: 'nif' }, 1, 'p1-f2'),
      entry({ x: 52, y: 652, mapField: 'nombre' }, 1, 'p1-f3'),
      entry({ type: 'check', ...toFieldXY({ x: 55, y: 604 }, 'box', { fontSize: 10 }), mapField: 'titular' }, 1, 'p1-f4'),
      entry({ type: 'check', ...toFieldXY({ x: 55, y: 584 }, 'box', { fontSize: 10 }), mapField: 'autorizado' }, 1, 'p1-f5'),
    ];
    const r = placeByText(entries, { textsA: A.texts, textsB: B.texts, slotsB: B.slots });
    const at = (id) => r.placed.get(id)?.resolved;
    const tB = (s) => B.texts.find((t) => t.text === s);
    // Teléfono: raya a la derecha en B, en la línea base de la etiqueta
    const telLine = B.slots.find((x) => x.kind === 'line' && x.y === 697);
    assert.deepEqual({ x: at('p1-f1').x, y: at('p1-f1').y }, { x: round1(telLine.x + 2), y: 700 });
    // NIF: en A a la derecha; en B esa raya no existe a la derecha (está debajo) → a la IA
    assert.equal(r.placed.has('p1-f2'), false);
    // Nombre: la etiqueta cercana de A es «Y DE OTRA PARTE» con el campo debajo; en B no hay raya debajo → a la IA
    assert.equal(r.placed.has('p1-f3'), false);
    // Casillas: cada opción con su casilla aunque cambien de orden y separación
    assert.deepEqual({ x: at('p1-f4').x, y: at('p1-f4').y }, toFieldXY({ x: 205, y: 534 }, 'box', { fontSize: 10 }));
    assert.deepEqual({ x: at('p1-f5').x, y: at('p1-f5').y }, toFieldXY({ x: 205, y: 564 }, 'box', { fontSize: 10 }));
    assert.deepEqual(r.rest.map((e) => e.id), ['p1-f2', 'p1-f3']);

    // La IA responde por los que faltan anclando en B (sin anchorA) e indicando el lado.
    const answer = validateProposals(
      { fields: [
        { id: 'p1-f2', found: true, page: 1, anchorB: 'NIF', side: 'below', confidence: 0.9, reason: 'NIF con la raya debajo' },
        { id: 'p1-f3', found: true, page: 1, anchorB: 'Nombre y apellidos:', side: 'right', confidence: 0.8, reason: 'B tiene etiqueta propia' },
      ] },
      new Set(['p1-f2', 'p1-f3']),
    );
    const byId = Object.fromEntries(r.rest.map((e) => [e.id, e]));
    const nif = resolveProposal(answer.proposals[0], byId['p1-f2'], A.texts, B.texts, { slots: B.slots });
    assert.deepEqual(nif, { ok: true, page: 1, x: 302, y: 684, snapped: true, method: 'side' });
    const nombre = resolveProposal(answer.proposals[1], byId['p1-f3'], A.texts, B.texts, { slots: B.slots });
    assert.equal(nombre.method, 'side');
    assert.equal(nombre.y, 770);
    assert.equal(nombre.x, round1(B.slots.find((x) => x.kind === 'line' && x.y === 767).x + 2));
    assert.ok(tB('Nombre y apellidos:'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── Huecos escritos con caracteres («____», «....») en el pase sin IA y en la resolución ───────────────────────

test('pase sin IA: etiqueta con su relleno («Nombre: ____») aunque B cambie el número de guiones', () => {
  const textsA = [T('Nombre: ________', 50, 700, 1, 80.6)];
  const textsB = [T('Otra cosa', 50, 760, 1, 40), T('Nombre: ________________', 70, 500, 2, 125)];
  const slotsB = slotsFromTexts(textsB);
  assert.equal(slotsB.length, 1);
  assert.equal(looksLikeLabel('Nombre y apellidos del titular de la cuenta: ______________________________'), true);
  const e = entry({ x: 92, y: 700 }); // sobre los guiones de A
  assert.equal(sideInA(e.field, textsA[0], 'line'), 'right');
  assert.equal(matchLabelInB(textsA[0], textsA, textsB).b, textsB[1]);
  const r = placeEntryByText(e, { textsA, textsB, slotsB });
  assert.equal(r.resolved.page, 2);
  assert.deepEqual({ x: r.resolved.x, y: r.resolved.y }, { x: round1(slotsB[0].x + 2), y: 500 });
  assert.equal(r.proposal.reason, 'Colocado sin IA: etiqueta «Nombre:» idéntica y única en B, hueco a la derecha');
});

test('resolveProposal: la IA ancla en «Fecha:» y el hueco es el relleno del mismo texto de B', () => {
  const textsB = [T('Fecha: ..............', 60, 400, 1, 70)];
  const slots = slotsFromTexts(textsB);
  const p = validateProposals({ fields: [{ id: 'p1-f1', found: true, page: 1, anchorB: 'Fecha:', side: 'right', confidence: 0.9, reason: 'fecha' }] }, new Set(['p1-f1'])).proposals[0];
  const r = resolveProposal(p, entry({ x: 10, y: 10 }), [], textsB, { slots });
  assert.deepEqual(r, { ok: true, page: 1, x: round1(slots[0].x + 2), y: 400, snapped: true, method: 'side' });
  // y el ajuste ≤ 15 pt también vale para un hueco escrito
  assert.equal(snapToSlot({ x: slots[0].x + 5, y: 405 }, 'line', {}, slots).slot.fromText, true);
});

test('extremo a extremo: A con raya dibujada, B con el hueco escrito con guiones o puntos', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'place-text-'));
  try {
    const make = async (file, variant) => {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([595, 842]);
      const text = (s, x, y) => page.drawText(s, { x, y, size: 10, font });
      const width = (s) => font.widthOfTextAtSize(s, 10);
      if (variant === 'A') {
        text('Teléfono', 50, 760);
        page.drawLine({ start: { x: 50 + width('Teléfono') + 6, y: 757 }, end: { x: 300, y: 757 }, thickness: 0.6 });
        text('Localidad', 50, 720);
        page.drawLine({ start: { x: 50 + width('Localidad') + 6, y: 717 }, end: { x: 300, y: 717 }, thickness: 0.6 });
      } else {
        text('Localidad ..................................', 80, 700);
        text('Teléfono', 80, 660);
        text('_______________________', 80 + width('Teléfono') + 4, 660);
      }
      await writeFile(file, await doc.save());
      return width;
    };
    const width = await make(path.join(dir, 'A.pdf'), 'A');
    await make(path.join(dir, 'B.pdf'), 'B');
    const A = await readPdf(path.join(dir, 'A.pdf'));
    const B = await readPdf(path.join(dir, 'B.pdf'));
    assert.equal(B.slots.length, 2);
    assert.ok(B.slots.every((s) => s.fromText));
    const entries = [
      entry({ x: round1(50 + width('Teléfono') + 8), y: 760, mapField: 'telefono' }, 1, 'p1-f1'),
      entry({ x: round1(50 + width('Localidad') + 8), y: 720, mapField: 'localidad' }, 1, 'p1-f2'),
    ];
    const r = placeByText(entries, { textsA: A.texts, textsB: B.texts, slotsB: B.slots });
    assert.equal(r.placed.size, 2);
    const tel = r.placed.get('p1-f1').resolved;
    assert.deepEqual({ x: tel.x, y: tel.y }, { x: round1(80 + width('Teléfono') + 4 + 2), y: 660 });
    const loc = r.placed.get('p1-f2').resolved;
    assert.equal(loc.y, 700);
    assert.ok(Math.abs(loc.x - (80 + width('Localidad ') + 2)) < 2, `x ${loc.x}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
