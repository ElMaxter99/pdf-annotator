import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBody,
  parseEntry,
  releaseChangelog,
  splitSections,
  touchesProduct,
} from './lib/changelog-utils.mjs';

const REPO = 'https://example.test/repo';

test('parseEntry lee tipo y texto', () => {
  assert.deepEqual(parseEntry('---\ntype: fixed\n---\n**Arreglo:** algo.\n'), {
    type: 'Fixed',
    text: '**Arreglo:** algo.',
  });
  assert.deepEqual(parseEntry('---\ntype: Added\n---\n- Con guion\n'), {
    type: 'Added',
    text: 'Con guion',
  });
  assert.deepEqual(parseEntry('---\ntype: none\n---\n'), { type: 'none', text: '' });
});

test('parseEntry rechaza entradas mal formadas', () => {
  assert.throws(() => parseEntry('sin cabecera'), /cabecera/);
  assert.throws(() => parseEntry('---\ntype: Raro\n---\ntexto'), /type/);
  assert.throws(() => parseEntry('---\ntype: Added\n---\n   \n'), /vacío/);
});

test('splitSections conserva viñetas de varias líneas', () => {
  const sections = splitSections('### Added\n- uno\n  sigue\n- dos\n\n### Fixed\n- tres');
  assert.deepEqual([...sections.keys()], ['Added', 'Fixed']);
  assert.equal(sections.get('Added').length, 2);
  assert.match(sections.get('Added')[0], /sigue/);
});

test('buildBody mezcla lo escrito a mano con las entradas y ordena los tipos', () => {
  const body = buildBody('### Changed\n- viejo', [
    { type: 'Fixed', text: 'f' },
    { type: 'Added', text: 'a' },
    { type: 'Changed', text: 'c' },
    { type: 'none', text: '' },
  ]);
  assert.equal(body, '### Added\n- a\n\n### Changed\n- viejo\n- c\n\n### Fixed\n- f');
});

test('releaseChangelog deja Unreleased vacío y crea la sección', () => {
  const out = releaseChangelog(
    '## Unreleased\n\n## [v1.0.0](x) - 2026-01-01\n### Added\n- viejo\n',
    '1.1.0',
    '2026-02-02',
    [{ type: 'Added', text: 'nuevo' }],
    REPO,
  );
  assert.equal(
    out,
    `## Unreleased\n\n## [v1.1.0](${REPO}/tree/v.1.1.0) - 2026-02-02\n### Added\n- nuevo\n\n## [v1.0.0](x) - 2026-01-01\n### Added\n- viejo\n`,
  );
  assert.throws(
    () => releaseChangelog('## Unreleased\n', '1.1.0', '2026-02-02', [], REPO),
    /nada que publicar/,
  );
});

test('touchesProduct solo exige entrada si cambia la app', () => {
  assert.equal(touchesProduct(['docs/ROADMAP.md', 'e2e/a.spec.ts']), false);
  assert.equal(touchesProduct(['src/app/app.ts']), true);
  assert.equal(touchesProduct(['desktop/main.mjs']), true);
});
