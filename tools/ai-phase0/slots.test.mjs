import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readPdf } from './pdf.mjs';
import {
  DRAW_OPS,
  PDFJS_OPS,
  asRect,
  boxesFromSegments,
  compose,
  dedupeBoxes,
  mergeLines,
  nearestSlot,
  parsePathBuffer,
  slotsFromOps,
} from './slots.mjs';

const { moveTo: M, lineTo: L, closePath: Z, curveTo: C } = DRAW_OPS;
const O = PDFJS_OPS;
const path_ = (paint, buf) => [O.constructPath, [paint, [Float32Array.from(buf)], [0, 0, 0, 0]]];
const rectBuf = (x, y, w, h) => [M, x, y, L, x + w, y, L, x + w, y + h, L, x, y + h, Z];
const run = (list, opts) => slotsFromOps(list.map((e) => e[0]), list.map((e) => e[1]), opts);

test('los códigos de operador copiados coinciden con los de pdf.js', () => {
  for (const [k, v] of Object.entries(PDFJS_OPS)) assert.equal(pdfjs.OPS[k], v, k);
});

test('compose aplica primero la matriz interior y luego la exterior', () => {
  const m = compose([2, 0, 0, 2, 10, 20], [1, 0, 0, 1, 5, 5]);
  assert.deepEqual(m, [2, 0, 0, 2, 20, 30]);
});

test('parsePathBuffer separa subtrayectos y marca curvas y cierres', () => {
  const subs = parsePathBuffer([M, 0, 0, L, 10, 0, M, 0, 5, C, 1, 1, 2, 2, 3, 3, ...rectBuf(0, 0, 4, 4)]);
  assert.equal(subs.length, 3);
  assert.equal(subs[0].pts.length, 2);
  assert.equal(subs[1].curved, true);
  assert.equal(subs[2].closed, true);
  assert.deepEqual(asRect(subs[2].pts), { x: 0, y: 0, w: 4, h: 4 });
  assert.equal(asRect([[0, 0], [5, 1], [5, 5], [0, 5]]), null);
});

test('slotsFromOps: línea trazada, línea como rectángulo relleno bajo, casilla y descartes', () => {
  const slots = run([
    [O.setLineWidth, [0.6]],
    path_(O.stroke, [M, 100, 700, L, 300, 700]), // línea para escribir
    path_(O.stroke, [M, 100, 650, L, 110, 650]), // demasiado corta
    path_(O.fill, rectBuf(100, 600, 150, 0.8)), // rectángulo muy bajo = línea
    path_(O.stroke, rectBuf(50, 500, 10, 10)), // casilla
    path_(O.fill, rectBuf(50, 400, 200, 100)), // fondo grande: nada
    path_(O.stroke, [M, 300, 300, L, 300, 400]), // vertical suelta: nada
    [O.setLineWidth, [5]],
    path_(O.stroke, [M, 100, 200, L, 300, 200]), // demasiado gruesa
    path_(O.endPath, rectBuf(0, 0, 10, 10)), // sin pintar (recorte)
  ]);
  assert.deepEqual(slots, [
    { page: 1, kind: 'line', x: 100, y: 700, w: 200, h: 0.6 },
    { page: 1, kind: 'line', x: 100, y: 600.4, w: 150, h: 0.8 },
    { page: 1, kind: 'box', x: 50, y: 500, w: 10, h: 10 },
  ]);
});

test('slotsFromOps aplica cm, save/restore, formularios XObject y escala el grosor', () => {
  const slots = run(
    [
      [O.save, null],
      [O.transform, [2, 0, 0, 2, 10, 10]],
      [O.setLineWidth, [1]],
      path_(O.stroke, [M, 0, 0, L, 50, 0]), // → x 10..110, y 10, grosor 2
      [O.restore, null],
      path_(O.stroke, [M, 0, 100, L, 30, 100]), // CTM restaurada: x 0..30, grosor 1
      [O.paintFormXObjectBegin, [[1, 0, 0, 1, 200, 300], [0, 0, 50, 50]]],
      path_(O.stroke, rectBuf(0, 0, 12, 12)),
      [O.paintFormXObjectEnd, null],
      path_(O.stroke, rectBuf(0, 0, 12, 12)),
    ],
    { page: 3 },
  );
  assert.deepEqual(slots, [
    { page: 3, kind: 'box', x: 200, y: 300, w: 12, h: 12 },
    { page: 3, kind: 'line', x: 0, y: 100, w: 30, h: 1 },
    { page: 3, kind: 'line', x: 10, y: 10, w: 100, h: 2 },
    { page: 3, kind: 'box', x: 0, y: 0, w: 12, h: 12 },
  ]);
});

test('slotsFromOps: discontinua, recuadro alargado y casilla dibujada con cuatro trazos', () => {
  const slots = run([
    [O.setDash, [[3, 2], 0]],
    path_(O.stroke, [M, 100, 700, L, 250, 700]),
    [O.setDash, [[], 0]],
    path_(O.stroke, rectBuf(100, 600, 180, 18)),
    path_(O.stroke, [M, 40, 500, L, 52, 500, M, 40, 512, L, 52, 512, M, 40, 500, L, 40, 512, M, 52, 500, L, 52, 512]),
  ]);
  assert.deepEqual(slots, [
    { page: 1, kind: 'line', x: 100, y: 700, w: 150, h: 1, dashed: true },
    { page: 1, kind: 'line', x: 100, y: 600, w: 180, h: 1, frame: 18 },
    { page: 1, kind: 'box', x: 40, y: 500, w: 12, h: 12 },
  ]);
});

test('mergeLines une trozos contiguos o repetidos y respeta los huecos grandes', () => {
  const l = (x, w, y = 100) => ({ page: 1, x, y, w, h: 0.5 });
  const out = mergeLines([l(10, 15), l(26, 15), l(40, 10), l(10, 40), l(100, 30), l(10, 20, 80)]);
  assert.deepEqual(
    out.map(({ x, y, w }) => ({ x, y, w })),
    [
      { x: 10, y: 80, w: 20 },
      { x: 10, y: 100, w: 40 },
      { x: 100, y: 100, w: 30 },
    ],
  );
});

test('dedupeBoxes se queda con la casilla exterior de dos concéntricas', () => {
  const out = dedupeBoxes([
    { page: 1, x: 11, y: 11, w: 8, h: 8 },
    { page: 1, x: 10, y: 10, w: 10, h: 10 },
    { page: 1, x: 30, y: 10, w: 10, h: 10 },
  ]);
  assert.deepEqual(out.map((b) => b.x), [10, 30]);
});

test('boxesFromSegments exige las dos verticales', () => {
  const h = [{ x: 0, y: 0, w: 10, h: 1 }, { x: 0, y: 10, w: 10, h: 1 }];
  assert.equal(boxesFromSegments(h, [{ x: 0, y: 0, w: 1, h: 10 }]).length, 0);
  assert.equal(boxesFromSegments(h, [{ x: 0, y: 0, w: 1, h: 10 }, { x: 10, y: 0, w: 1, h: 10 }]).length, 1);
});

const line = (x, y, w, page = 1) => ({ page, kind: 'line', x, y, w, h: 0.6 });
const box = (x, y, s = 10, page = 1) => ({ page, kind: 'box', x, y, w: s, h: s });

test('nearestSlot: línea a la derecha en la misma línea base', () => {
  const slots = [line(150, 697, 200), line(50, 670, 200), line(150, 660, 200)];
  const r = nearestSlot({ page: 1, x: 50, y: 700, w: 60 }, slots);
  assert.equal(r.side, 'right');
  assert.equal(r.slot, slots[0]);
  assert.deepEqual(r.point, { x: 152, y: 699 });
});

test('nearestSlot: línea debajo; ignora el subrayado del propio texto y otras páginas', () => {
  const slots = [line(50, 698.5, 60), line(50, 680, 200), line(150, 697, 200, 2)];
  const r = nearestSlot({ page: 1, x: 50, y: 700, w: 60 }, slots);
  assert.equal(r.side, 'below');
  assert.equal(r.slot, slots[1]);
  assert.deepEqual(r.point, { x: 52, y: 682 });
});

test('nearestSlot: con textos, no baja hasta la línea de la fila siguiente', () => {
  const texts = [{ page: 1, text: 'Nombre', x: 50, y: 700 }, { page: 1, text: 'Calle', x: 50, y: 685 }];
  const slots = [line(50, 677, 200)];
  assert.equal(nearestSlot({ page: 1, x: 50, y: 700, w: 40 }, slots).side, 'below');
  assert.equal(nearestSlot({ page: 1, x: 50, y: 700, w: 40 }, slots, { texts }), null);
});

test('mergeLines no une líneas de la misma altura separadas aunque lleguen desordenadas', () => {
  const out = mergeLines([{ page: 1, x: 370, y: 756.9, w: 180, h: 0.8 }, { page: 1, x: 84, y: 757, w: 216, h: 0.6 }]);
  assert.equal(out.length, 2);
});

test('nearestSlot: la preferencia decide entre derecha y debajo; el radio limita', () => {
  const slots = [line(300, 697, 100), line(50, 690, 200)];
  const a = { page: 1, x: 50, y: 700, w: 60 };
  assert.equal(nearestSlot(a, slots).side, 'below');
  assert.equal(nearestSlot(a, slots, { prefer: 'right' }).side, 'right');
  assert.equal(nearestSlot(a, slots, { prefer: 'below' }).side, 'below');
  assert.equal(nearestSlot(a, [slots[0]], { radius: 100 }), null);
});

test('nearestSlot: con textos, descarta la línea que pertenece a otra etiqueta', () => {
  const texts = [{ page: 1, text: 'Nombre', x: 50, y: 700 }, { page: 1, text: 'Apellidos', x: 250, y: 700 }];
  const slots = [line(300, 697, 150)];
  assert.equal(nearestSlot({ page: 1, x: 50, y: 700, w: 40 }, slots, { texts }), null);
  assert.equal(nearestSlot({ page: 1, x: 250, y: 700, w: 45 }, slots, { texts }).slot, slots[0]);
});

test('nearestSlot: casilla a la izquierda de cada opción (separación 16 y 20 pt)', () => {
  for (const gap of [16, 20]) {
    const ys = [700, 700 - gap, 700 - 2 * gap];
    const slots = ys.map((y) => box(60, y - 1));
    ys.forEach((y, i) => {
      const r = nearestSlot({ page: 1, x: 76, y }, slots, { kind: 'box' });
      assert.equal(r.slot, slots[i], `separación ${gap}, opción ${i}`);
      assert.equal(r.side, 'left');
      assert.deepEqual(r.point, { x: 65, y: y + 4 });
    });
  }
});

test('nearestSlot: opciones en fila; con textos no toma la casilla de la opción anterior', () => {
  const texts = [{ page: 1, text: 'Sí', x: 76, y: 700 }, { page: 1, text: 'No', x: 116, y: 700 }];
  const slots = [box(60, 699), box(100, 699)];
  assert.equal(nearestSlot({ page: 1, x: 116, y: 700 }, slots, { kind: 'box', texts }).slot, slots[1]);
  assert.equal(nearestSlot({ page: 1, x: 76, y: 700, w: 12 }, [box(95, 699)], { kind: 'box', texts: [] }), null);
  assert.equal(nearestSlot({ page: 1, x: 76, y: 700, w: 12 }, [box(95, 699)], { kind: 'box', boxSide: 'right' }).side, 'right');
});

// ---- PDF generados con pdf-lib y leídos con readPdf (pdf.js) ----

async function makePdf(file, spacing) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const text = (s, x, y) => page.drawText(s, { x, y, size: 10, font });
  const width = (s) => font.widthOfTextAtSize(s, 10);
  const gray = rgb(0.6, 0.6, 0.6);
  // etiqueta + línea a la derecha
  text('Titular', 50, 760);
  page.drawLine({ start: { x: 50 + width('Titular') + 6, y: 757 }, end: { x: 300, y: 757 }, thickness: 0.6, color: gray });
  // etiqueta + línea debajo (el hueco «pasa de la derecha a debajo»)
  text('Domicilio', 50, 720);
  page.drawLine({ start: { x: 50, y: 702 }, end: { x: 330, y: 702 }, thickness: 0.6, color: gray });
  // línea como rectángulo relleno muy bajo
  text('IBAN', 340, 760);
  page.drawRectangle({ x: 340 + width('IBAN') + 6, y: 756.5, width: 180, height: 0.8, color: gray });
  // opciones con casilla a la izquierda
  const options = ['Cuenta corriente', 'Cuenta de ahorro', 'Depósito'];
  options.forEach((o, i) => {
    const y = 640 - i * spacing;
    page.drawRectangle({ x: 50, y: y - 1, width: 10, height: 10, borderWidth: 0.8, borderColor: rgb(0, 0, 0) });
    text(o, 66, y);
  });
  await writeFile(file, await doc.save());
  return { options };
}

for (const spacing of [16, 20]) {
  test(`readPdf devuelve los huecos y nearestSlot elige bien (casillas cada ${spacing} pt)`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'slots-'));
    try {
      const file = path.join(dir, 's.pdf');
      const { options } = await makePdf(file, spacing);
      const { texts, slots } = await readPdf(file);
      const lines = slots.filter((s) => s.kind === 'line');
      const boxes = slots.filter((s) => s.kind === 'box');
      assert.equal(lines.length, 3, JSON.stringify(slots));
      assert.equal(boxes.length, 3, JSON.stringify(slots));
      for (const b of boxes) {
        assert.equal(b.x, 50);
        assert.ok(Math.abs(b.w - 10) < 0.2 && Math.abs(b.h - 10) < 0.2);
      }
      const t = (s) => texts.find((x) => x.text === s);
      const titular = nearestSlot(t('Titular'), slots, { texts });
      assert.equal(titular.side, 'right');
      assert.equal(titular.slot.y, 757);
      const domicilio = nearestSlot(t('Domicilio'), slots, { texts });
      assert.equal(domicilio.side, 'below');
      assert.equal(domicilio.slot.y, 702);
      assert.deepEqual(domicilio.point, { x: 52, y: 704 });
      const iban = nearestSlot(t('IBAN'), slots, { texts });
      assert.equal(iban.side, 'right');
      assert.equal(iban.slot.w, 180);
      options.forEach((o, i) => {
        const r = nearestSlot(t(o), slots, { kind: 'box', texts });
        assert.equal(r.side, 'left', o);
        assert.equal(r.point.x, 55);
        assert.ok(Math.abs(r.point.y - (640 - i * spacing + 4)) < 0.2, `${o}: ${r.point.y}`);
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
