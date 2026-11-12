// Lectura de PDF en Node: textos con posición y páginas a PNG (pdf.js + @napi-rs/canvas).
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const pdfjsRoot = path.dirname(path.dirname(require.resolve('pdfjs-dist/package.json')));
const standardFontDataUrl = pathToFileURL(path.join(pdfjsRoot, 'pdfjs-dist', 'standard_fonts') + path.sep).href;

async function open(file) {
  const data = new Uint8Array(await readFile(file));
  return pdfjs.getDocument({ data, standardFontDataUrl, useSystemFonts: true, verbosity: 0 }).promise;
}

/** Devuelve { pages: [{ num, width, height }], texts: [{ page, text, x, y }] } y escribe PNGs si se pide. */
export async function readPdf(file, { prefix, outDir, scale = 1.5 } = {}) {
  const doc = await open(file);
  const pages = [];
  const texts = [];
  for (let num = 1; num <= doc.numPages; num++) {
    const page = await doc.getPage(num);
    const [x0, y0, x1, y1] = page.view;
    pages.push({ num, width: x1 - x0, height: y1 - y0 });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      texts.push({ page: num, text: item.str, x: Math.round(item.transform[4] * 10) / 10, y: Math.round(item.transform[5] * 10) / 10 });
    }
    if (outDir) {
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      await writeFile(path.join(outDir, `${prefix}-p${num}.png`), canvas.toBuffer('image/png'));
    }
  }
  await doc.destroy();
  return { pages, texts };
}
