import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isNewer, parseLatestRelease, parseVersion, updateMode } from './update-logic.mjs';

test('parseVersion acepta v y prerelease, rechaza basura', () => {
  assert.deepEqual(parseVersion('v1.6.0')?.nums, [1, 6, 0]);
  assert.equal(parseVersion('1.6.0-beta.1')?.pre, 'beta.1');
  assert.equal(parseVersion('1.6'), null);
  assert.equal(parseVersion('latest'), null);
});

test('compareVersions ordena numéricamente y trata las prereleases', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.5.0', '1.6.0') < 0);
  assert.equal(compareVersions('1.5.0', 'v1.5.0'), 0);
  assert.ok(compareVersions('1.6.0-beta.1', '1.6.0') < 0);
  assert.ok(compareVersions('1.6.0-beta.2', '1.6.0-beta.10') < 0);
});

test('isNewer: instalada 1.5 y publicada 1.6 avisa; igual o inválida no', () => {
  assert.equal(isNewer('1.5.0', '1.6.0'), true);
  assert.equal(isNewer('1.6.0', '1.6.0'), false);
  assert.equal(isNewer('1.6.0', '1.5.0'), false);
  assert.equal(isNewer('1.6.0', 'basura'), false);
});

test('updateMode: automático en Windows y AppImage, manual en macOS sin firma y deb/rpm', () => {
  assert.equal(updateMode({ platform: 'win32' }), 'auto');
  assert.equal(updateMode({ platform: 'linux', appImage: true }), 'auto');
  assert.equal(updateMode({ platform: 'linux', appImage: false }), 'manual');
  assert.equal(updateMode({ platform: 'darwin' }), 'manual');
  assert.equal(updateMode({ platform: 'darwin', macSigned: true }), 'auto');
});

test('parseLatestRelease ignora borradores y prereleases y fija la URL al repositorio', () => {
  const ok = { tag_name: 'v1.6.0', html_url: 'https://github.com/ElMaxter99/pdf-annotator/releases/tag/v1.6.0' };
  assert.deepEqual(parseLatestRelease(ok), { version: '1.6.0', url: ok.html_url });
  assert.equal(parseLatestRelease({ ...ok, draft: true }), null);
  assert.equal(parseLatestRelease({ ...ok, prerelease: true }), null);
  assert.equal(parseLatestRelease({ tag_name: 'v1.6.0-rc.1' }), null);
  assert.equal(parseLatestRelease(null), null);
  assert.equal(parseLatestRelease({ tag_name: 'v1.6.0', html_url: 'https://evil.example/x' }).url, 'https://github.com/ElMaxter99/pdf-annotator/releases/tag/v1.6.0');
});
