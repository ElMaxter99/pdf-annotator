import test from 'node:test';
import assert from 'node:assert/strict';
import { isAppUrl } from './trusted-origin.mjs';

const ORIGIN = 'app://pdf-annotator';

test('reconoce las páginas de la app (el origen de app:// en Node es «null»)', () => {
  assert.equal(new URL(`${ORIGIN}/landing`).origin, 'null');
  assert.equal(isAppUrl(`${ORIGIN}/landing`, ORIGIN), true);
  assert.equal(isAppUrl(`${ORIGIN}/workspace?lote=1#x`, ORIGIN), true);
});

test('rechaza otros hosts, otros esquemas y basura', () => {
  assert.equal(isAppUrl('app://evil/landing', ORIGIN), false);
  assert.equal(isAppUrl('https://pdf-annotator/landing', ORIGIN), false);
  assert.equal(isAppUrl('https://github.com/x', ORIGIN), false);
  assert.equal(isAppUrl('app://pdf-annotator.evil.com/', ORIGIN), false);
  assert.equal(isAppUrl('', ORIGIN), false);
  assert.equal(isAppUrl(undefined, ORIGIN), false);
});
