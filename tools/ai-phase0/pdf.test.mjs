import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvas } from '@napi-rs/canvas';
import { CODE_GLYPHS, codeWidth, drawCode, newCode } from './pdf.mjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

test('hay un glifo distinto para cada carácter del alfabeto del código', () => {
  for (const ch of ALPHABET) assert.ok(CODE_GLYPHS[ch], `falta el glifo de ${ch}`);
  assert.equal(new Set(ALPHABET.split('').map((c) => CODE_GLYPHS[c])).size, ALPHABET.length);
  assert.ok(newCode().split('').every((c) => ALPHABET.includes(c)));
});

test('el código se pinta sin fuentes y se puede leer de vuelta del PNG (sin recuadros vacíos)', () => {
  const cell = 6;
  const code = 'AB9Z';
  const canvas = createCanvas(codeWidth(code, cell) + 20, 7 * cell + 20);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCode(ctx, code, 10, 10, cell);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const dark = (px, py) => data[(py * canvas.width + px) * 4] < 128;
  const decoded = [...code].map((_, i) => {
    const rows = Array.from({ length: 7 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (dark(10 + (i * 7 + c) * cell + cell / 2, 10 + r * cell + cell / 2) ? '1' : '0')).join(''),
    ).join(',');
    return Object.entries(CODE_GLYPHS).find(([, g]) => g === rows)?.[0] ?? '?';
  });
  assert.equal(decoded.join(''), code);
});
