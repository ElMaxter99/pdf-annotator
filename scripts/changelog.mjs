#!/usr/bin/env node
// CHANGELOG por ficheros: cada PR añade un fichero en `changelog/unreleased/` y se juntan al subir de versión.
//   node scripts/changelog.mjs check [--base origin/develop]   valida los ficheros (y, con --base, que la PR traiga uno)
//   node scripts/changelog.mjs preview                         enseña cómo quedaría la próxima sección
//   node scripts/changelog.mjs release X.Y.Z [--date AAAA-MM-DD]  los junta en CHANGELOG.md y los borra
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBody, parseEntry, releaseChangelog, touchesProduct } from './lib/changelog-utils.mjs';
import { normalizeVersion, REPO_URL, ROOT, takeOption } from './lib/release-utils.mjs';

const DIR = 'changelog/unreleased';
const dirPath = join(ROOT, DIR);

const files = () =>
  existsSync(dirPath)
    ? readdirSync(dirPath)
        .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
        .sort()
    : [];

const load = () =>
  files().map((name) => ({
    name,
    ...parseEntry(readFileSync(join(dirPath, name), 'utf8'), `${DIR}/${name}`),
  }));

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'check') {
    const entries = load();
    console.log(`✔ ${entries.length} entradas válidas en ${DIR}/.`);
    const base = takeOption(rest, '--base');
    if (base) {
      const changed = execFileSync('git', ['diff', '--name-status', `${base}...HEAD`], {
        cwd: ROOT,
        encoding: 'utf8',
      })
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t'));
      const names = changed.map((parts) => parts[parts.length - 1]);
      const added = changed.filter(
        (parts) => parts[0] !== 'D' && parts[parts.length - 1].startsWith(`${DIR}/`),
      );
      if (touchesProduct(names) && added.length === 0) {
        console.error(
          `✖ Esta PR cambia código de la app pero no añade ningún fichero en ${DIR}/. Crea uno (o con «type: none» si no necesita entrada). Ver changelog/README.md.`,
        );
        process.exit(1);
      }
      console.log('✔ La PR trae su entrada (o no toca la app).');
    }
  } else if (command === 'preview') {
    const current = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8');
    const lines = current.split('\n');
    const start = lines.findIndex((line) => /^## Unreleased\s*$/.test(line));
    let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
    if (end === -1) end = lines.length;
    console.log(buildBody(lines.slice(start + 1, end).join('\n'), load()) || '(sin entradas)');
  } else if (command === 'release') {
    const version = normalizeVersion(rest.shift());
    const date = takeOption(rest, '--date') ?? new Date().toISOString().slice(0, 10);
    const entries = load();
    const path = join(ROOT, 'CHANGELOG.md');
    writeFileSync(
      path,
      releaseChangelog(readFileSync(path, 'utf8'), version, date, entries, REPO_URL),
    );
    for (const entry of entries) {
      unlinkSync(join(dirPath, entry.name));
    }
    console.log(
      `✔ CHANGELOG.md: sección v${version} (${date}) con ${entries.length} entradas de ${DIR}/ (borradas).`,
    );
  } else {
    console.error(
      'Uso: changelog.mjs check [--base ref] | preview | release X.Y.Z [--date AAAA-MM-DD]',
    );
    process.exit(2);
  }
} catch (error) {
  console.error(`✖ ${error.message}`);
  process.exit(1);
}
