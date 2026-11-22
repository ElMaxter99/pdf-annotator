// Lectura de PDF en Node: textos con posición y páginas a PNG (pdf.js + @napi-rs/canvas).
import { randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';

/** Para el ayudante (prueba de vista): el lienzo se resuelve aquí, donde están sus dependencias también al empaquetar. */
export { createCanvas };
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { slotsFromOps, slotsFromTexts } from './slots.mjs';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(path.dirname(require.resolve('pdfjs-dist/package.json')));
const standardFontDataUrl = pathToFileURL(path.join(pdfjsRoot, 'pdfjs-dist', 'standard_fonts') + path.sep).href;

async function open(file) {
  const data = new Uint8Array(await readFile(file));
  return pdfjs.getDocument({ data, standardFontDataUrl, useSystemFonts: true, verbosity: 0 }).promise;
}

/** Glifos 5×7 del código de verificación: se dibujan con rectángulos, sin depender de ninguna fuente del sistema
 * (en algunos equipos `monospace` no tenía las letras y salían recuadros vacíos). */
export const CODE_GLYPHS = {
  A: '01110,10001,10001,11111,10001,10001,10001',
  B: '11110,10001,10001,11110,10001,10001,11110',
  C: '01110,10001,10000,10000,10000,10001,01110',
  D: '11110,10001,10001,10001,10001,10001,11110',
  E: '11111,10000,10000,11110,10000,10000,11111',
  F: '11111,10000,10000,11110,10000,10000,10000',
  G: '01110,10001,10000,10111,10001,10001,01111',
  H: '10001,10001,10001,11111,10001,10001,10001',
  J: '00111,00010,00010,00010,00010,10010,01100',
  K: '10001,10010,10100,11000,10100,10010,10001',
  L: '10000,10000,10000,10000,10000,10000,11111',
  M: '10001,11011,10101,10101,10001,10001,10001',
  N: '10001,11001,10101,10011,10001,10001,10001',
  P: '11110,10001,10001,11110,10000,10000,10000',
  Q: '01110,10001,10001,10001,10101,10010,01101',
  R: '11110,10001,10001,11110,10100,10010,10001',
  S: '01111,10000,10000,01110,00001,00001,11110',
  T: '11111,00100,00100,00100,00100,00100,00100',
  U: '10001,10001,10001,10001,10001,10001,01110',
  V: '10001,10001,10001,10001,10001,01010,00100',
  W: '10001,10001,10001,10101,10101,11011,10001',
  X: '10001,10001,01010,00100,01010,10001,10001',
  Y: '10001,10001,01010,00100,00100,00100,00100',
  Z: '11111,00001,00010,00100,01000,10000,11111',
  2: '01110,10001,00001,00010,00100,01000,11111',
  3: '11110,00001,00001,01110,00001,00001,11110',
  4: '00010,00110,01010,10010,11111,00010,00010',
  5: '11111,10000,11110,00001,00001,10001,01110',
  6: '00110,01000,10000,11110,10001,10001,01110',
  7: '11111,00001,00010,00100,01000,01000,01000',
  8: '01110,10001,10001,01110,10001,10001,01110',
  9: '01110,10001,10001,01111,00001,00010,01100',
};

/** Dibuja `code` con su esquina superior izquierda en (x, y); `cell` es el lado de cada píxel del glifo. */
export function drawCode(ctx, code, x, y, cell) {
  ctx.fillStyle = '#000';
  [...code].forEach((ch, i) => {
    const rows = (CODE_GLYPHS[ch] ?? '').split(',');
    rows.forEach((row, r) => {
      [...row].forEach((bit, c) => {
        if (bit === '1') ctx.fillRect(x + (i * 7 + c) * cell, y + r * cell, cell, cell);
      });
    });
  });
}

/** Ancho total de `code` en píxeles para un `cell` dado. */
export const codeWidth = (code, cell) => (code.length * 7 - 2) * cell;

// Sin caracteres que un modelo pequeño confunde al leerlos en la imagen (5/S, 8/B, 2/Z, 6/G, 0/O/D/Q, 1/I/L): con ellos se
// descartaban respuestas buenas por «no leyó las imágenes» (medido con haiku: «7Q85» por «7Q8S»).
export const CODE_ALPHABET = 'ACEFHJKMNPRTUVWXY3479';
export const newCode = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** Devuelve { pages: [{ num, width, height }], texts: [{ page, text, x, y, w? }], slots, codes } y escribe PNGs si se pide.
 * `slots` = huecos de escritura (líneas y casillas, ver slots.mjs): [{ page, kind: 'line' | 'box', x, y, w, h }]; los
 * dibujados y, detrás, las líneas escritas con «____» o «....» en los textos (`fromText: true`).
 * Con `stamp`, cada PNG lleva un código aleatorio en la esquina: la IA debe devolverlo para demostrar que ha mirado la imagen. */
export async function readPdf(file, { prefix, outDir, scale = 1.5, stamp = false } = {}) {
  const doc = await open(file);
  const pages = [];
  const codes = {};
  const texts = [];
  const slots = [];
  for (let num = 1; num <= doc.numPages; num++) {
    const page = await doc.getPage(num);
    const [x0, y0, x1, y1] = page.view;
    pages.push({ num, width: x1 - x0, height: y1 - y0 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const t = { page: num, text: item.str, x: Math.round(item.transform[4] * 10) / 10, y: Math.round(item.transform[5] * 10) / 10 };
      // ancho en puntos (pdf.js ya lo da escalado): permite medir «a la derecha» desde el final del texto
      if (Number.isFinite(item.width) && item.width > 0) t.w = Math.round(item.width * 10) / 10;
      texts.push(t);
    }
    const drawn = [];
    try {
      const opList = await page.getOperatorList();
      drawn.push(...slotsFromOps(opList.fnArray, opList.argsArray, { page: num, ops: pdfjs.OPS }));
    } catch {
      // un dibujo que pdf.js no sabe leer no debe impedir leer los textos
    }
    // Huecos escritos con caracteres («Nombre: ________», «.......»), marcados con `fromText: true`.
    slots.push(...drawn, ...slotsFromTexts(texts.filter((t) => t.page === num), { drawn }));
    if (outDir) {
      const viewport = page.getViewport({ scale });
      let canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      if (stamp) {
        const code = newCode();
        codes[`${prefix}-p${num}`] = code;
        // Franja añadida DEBAJO de la página (no tapa contenido) con el código enorme y en alto contraste:
        // Copilot reescala las imágenes y con un código pequeño solo lee parte de los caracteres.
        const strip = Math.round(canvas.width * 0.22);
        const tall = createCanvas(canvas.width, canvas.height + strip);
        const tctx = tall.getContext('2d');
        tctx.fillStyle = '#fff';
        tctx.fillRect(0, 0, tall.width, tall.height);
        tctx.drawImage(canvas, 0, 0);
        tctx.fillStyle = '#000';
        tctx.fillRect(0, canvas.height, tall.width, 6);
        const cell = Math.max(2, Math.floor(Math.min((strip * 0.72) / 7, (canvas.width * 0.9) / (4 * 7 - 2))));
        drawCode(tctx, code, Math.round((tall.width - codeWidth(code, cell)) / 2), canvas.height + Math.round((strip - 7 * cell) / 2) + 3, cell);
        canvas = tall;
      }
      await writeFile(path.join(outDir, `${prefix}-p${num}.png`), canvas.toBuffer('image/png'));
    }
  }
  await doc.destroy();
  return { pages, texts, slots, codes };
}
