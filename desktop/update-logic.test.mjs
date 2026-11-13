import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isNewer, normalizeChannel, parseLatestRelease, parseReleaseForChannel, parseVersion, updateMode } from './update-logic.mjs';

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

const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: /-/.test(tag), html_url: `https://github.com/ElMaxter99/pdf-annotator/releases/tag/${tag}`, ...extra });

test('normalizeChannel: solo «beta» activa las pruebas', () => {
  assert.equal(normalizeChannel('beta'), 'beta');
  assert.equal(normalizeChannel('stable'), 'stable');
  assert.equal(normalizeChannel('rc'), 'stable');
  assert.equal(normalizeChannel(undefined), 'stable');
});

test('parseReleaseForChannel: estable ignora las RC y los borradores', () => {
  const list = [rel('v1.9.0-rc.2'), rel('v1.9.0-rc.1'), rel('v1.8.5', { draft: true }), rel('v1.8.4')];
  assert.deepEqual(parseReleaseForChannel(list)?.version, '1.8.4');
  assert.equal(parseReleaseForChannel(list)?.prerelease, false);
});

test('parseReleaseForChannel: pruebas ofrece la RC más alta y la final gana a sus RC', () => {
  const list = [rel('v1.9.0-rc.1'), rel('v1.9.0-rc.10'), rel('v1.9.0-rc.2'), rel('v1.8.4')];
  const best = parseReleaseForChannel(list, { prerelease: true });
  assert.equal(best?.version, '1.9.0-rc.10');
  assert.equal(best?.prerelease, true);
  assert.equal(parseReleaseForChannel([...list, rel('v1.9.0')], { prerelease: true })?.version, '1.9.0');
});

test('parseReleaseForChannel: solo acepta rc.N, valores raros y una release suelta', () => {
  assert.equal(parseReleaseForChannel([rel('v2.0.0-beta.1')], { prerelease: true }), null);
  assert.equal(parseReleaseForChannel(null), null);
  assert.equal(parseReleaseForChannel(rel('v1.8.4'))?.version, '1.8.4');
});

test('una RC instalada no se «actualiza» a otra anterior ni a la misma; sí a la siguiente y a la final', () => {
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.1'), false);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.2'), false);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.3'), true);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0'), true);
  assert.equal(isNewer('1.8.4', '1.9.0-rc.1'), true);
});
