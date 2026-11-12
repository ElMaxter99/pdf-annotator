import test from 'node:test';
import assert from 'node:assert/strict';
import { extraDirs, mergePath } from './shell-path.mjs';

test('mergePath une sin duplicar y descarta vacíos', () => {
  assert.equal(mergePath('/a:/b::/a', ['/b', '/c'], ':'), '/a:/b:/c');
  assert.equal(mergePath(undefined, ['/x'], ':'), '/x');
});

test('extraDirs incluye las carpetas habituales de cada sistema', () => {
  assert.ok(extraDirs('darwin', '/Users/u', {}).includes('/opt/homebrew/bin'));
  assert.ok(extraDirs('linux', '/home/u', {}).includes('/home/u/.local/bin'));
  assert.ok(extraDirs('win32', 'C:\\Users\\u', { APPDATA: 'C:\\Users\\u\\AppData\\Roaming' }).some((d) => d.endsWith('npm')));
});
