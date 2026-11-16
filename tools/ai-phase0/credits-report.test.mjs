import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReport } from './credits-report.mjs';

const cases = [
  {
    name: 'a',
    total: 4,
    attempts: 1,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_read_input_tokens: 5,
      cache_creation_input_tokens: 1,
    },
    aiCredits: 2,
    premiumRequests: 1,
  },
  { name: 'b', total: 3, attempts: 1, aiCredits: 4 },
  { name: 'c', total: 2, attempts: 1 },
];

test('suma solo lo medido y no inventa lo que falta', () => {
  const r = buildReport(cases, null);
  assert.equal(r.total, 6);
  assert.equal(r.perCase, 3);
  assert.match(r.lines.join('\n'), /Total \(2 de 3 con dato\)/);
  assert.match(r.lines.join('\n'), /\| c \| 2 \| 1 \| – \| – \| – \|/);
});

test('compara con la diferencia que marca GitHub', () => {
  const r = buildReport(cases, { before: 10, after: 19 });
  assert.equal(r.github.delta, 9);
  assert.equal(r.github.ratio, 1.5);
});

test('sin datos de GitHub no hay comparación', () => {
  assert.equal(buildReport(cases, { before: null, after: null }).github, undefined);
});
