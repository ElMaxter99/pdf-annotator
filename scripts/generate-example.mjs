#!/usr/bin/env node
// Genera examples/factura-ejemplo.pdf (documento en blanco con etiquetas) usado en el README y las capturas.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFile } from 'node:fs/promises';

const doc = await PDFDocument.create();
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595, 842]);
const ink = rgb(0.12, 0.16, 0.22);
const line = rgb(0.75, 0.78, 0.84);

page.drawRectangle({ x: 0, y: 772, width: 595, height: 70, color: rgb(0.06, 0.61, 0.56) });
page.drawText('FACTURA', { x: 50, y: 795, size: 28, font: bold, color: rgb(1, 1, 1) });
page.drawText('Nº', { x: 400, y: 800, size: 12, font: bold, color: rgb(1, 1, 1) });

const labels = [
  ['Cliente', 50, 720], ['NIF', 50, 680], ['Dirección', 50, 640], ['Fecha', 400, 720],
  ['Concepto', 50, 560], ['Base imponible', 50, 480], ['IVA (21%)', 50, 440], ['Total', 50, 400],
  ['Pagada', 50, 340],
];
for (const [text, x, y] of labels) {
  page.drawText(text, { x, y, size: 11, font: bold, color: ink });
  page.drawLine({ start: { x: x + (text.length > 8 ? 95 : 70), y: y - 4 }, end: { x: x + 290, y: y - 4 }, thickness: 0.6, color: line });
}
page.drawText('Firma', { x: 380, y: 140, size: 11, font: bold, color: ink });
page.drawLine({ start: { x: 380, y: 130 }, end: { x: 545, y: 130 }, thickness: 0.6, color: line });
page.drawText('Documento de ejemplo para PDF Annotator', { x: 50, y: 40, size: 9, font, color: rgb(0.5, 0.55, 0.62) });

await writeFile(new URL('../examples/factura-ejemplo.pdf', import.meta.url), await doc.save());
