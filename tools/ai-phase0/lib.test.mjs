import assert from 'node:assert/strict';
import test from 'node:test';
import { findText, flattenFields, nearbyTexts, parseJsonFromText, resolveProposal, score, summarize, validateProposals } from './lib.mjs';

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
  assert.deepEqual(resolveProposal(p, entry, textsA, textsB), { ok: true, page: 2, x: 163, y: 501 });
  assert.equal(resolveProposal({ ...p, anchorB: 'Nada' }, entry, textsA, textsB).why, 'ancla_B_no_encontrada');
});

test('score trata los campos ausentes', () => {
  assert.deepEqual(score({ ok: false, why: 'sin_resultado' }, { gone: true }), { gone: true, goneOk: true });
  assert.equal(score({ ok: true, page: 1, x: 1, y: 1 }, { gone: true }).goneOk, false);
});

test('score y summarize', () => {
  const s = score({ ok: true, page: 2, x: 163, y: 501 }, { page: 2, field: { x: 163, y: 503 } });
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
