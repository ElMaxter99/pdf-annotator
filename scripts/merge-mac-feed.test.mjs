import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFeed, mergeFeeds, parseFeed } from './merge-mac-feed.mjs';

const feed = (arch, date) => `version: 1.17.0
files:
  - url: PDF-Annotator-1.17.0-mac-${arch}.zip
    sha512: zip${arch}==
    size: 100
  - url: PDF-Annotator-1.17.0-mac-${arch}.dmg
    sha512: dmg${arch}==
    size: 200
path: PDF-Annotator-1.17.0-mac-${arch}.zip
sha512: zip${arch}==
releaseDate: '${date}'
`;

test('parseFeed lee el formato de electron-builder', () => {
  const f = parseFeed(feed('x64', '2026-11-22T18:26:25.100Z'));
  assert.equal(f.version, '1.17.0');
  assert.deepEqual(f.files[1], { url: 'PDF-Annotator-1.17.0-mac-x64.dmg', sha512: 'dmgx64==', size: 200 });
  assert.equal(f.path, 'PDF-Annotator-1.17.0-mac-x64.zip');
  assert.equal(f.releaseDate, '2026-11-22T18:26:25.100Z');
});

test('parseFeed rechaza un archivo incompleto', () => {
  assert.throws(() => parseFeed('version: 1.0.0\nfiles:\n'));
  assert.throws(() => parseFeed('files:\n  - url: a.zip\n    sha512: x\n    size: 1\n'));
});

test('mergeFeeds lista arm64 e Intel, con path del de Intel y la fecha más reciente', () => {
  const arm = parseFeed(feed('arm64', '2026-11-22T18:20:00.000Z'));
  const intel = parseFeed(feed('x64', '2026-11-22T18:26:25.100Z'));
  for (const merged of [mergeFeeds(arm, intel), mergeFeeds(intel, arm)]) {
    assert.equal(merged.files.length, 4);
    assert.equal(merged.path, 'PDF-Annotator-1.17.0-mac-x64.zip');
    assert.equal(merged.sha512, 'zipx64==');
    assert.equal(merged.releaseDate, '2026-11-22T18:26:25.100Z');
  }
  // Ida y vuelta: lo que se escribe se vuelve a leer igual.
  const merged = mergeFeeds(arm, intel);
  assert.deepEqual(parseFeed(formatFeed(merged)), merged);
});

test('mergeFeeds no repite archivos y se niega con versiones distintas', () => {
  const a = parseFeed(feed('x64', '2026-11-22T00:00:00.000Z'));
  assert.equal(mergeFeeds(a, a).files.length, 2);
  const b = parseFeed(feed('arm64', '2026-11-22T00:00:00.000Z').replace(/1\.17\.0/g, '1.18.0'));
  assert.throws(() => mergeFeeds(a, b), /Versiones distintas/);
});
