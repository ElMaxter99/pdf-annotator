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
