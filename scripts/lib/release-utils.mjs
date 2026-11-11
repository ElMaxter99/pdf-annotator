// Utilidades compartidas por release-notes, release-guide y release.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const REPO_URL = 'https://github.com/ElMaxter99/pdf-annotator';
export const DEV_BRANCH = 'develop';
export const MAIN_BRANCH = 'master';

export const read = (file) => readFileSync(resolve(ROOT, file), 'utf8');

export const currentVersion = () => JSON.parse(read('package.json')).version;

export const normalizeVersion = (raw) => {
  const v = String(raw ?? '').trim().replace(/^v\.?/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`Versión no válida: «${raw}». Usa X.Y.Z (por ejemplo 1.7.0).`);
  }
  return v;
};

/** Devuelve { heading, body } de la sección de CHANGELOG.md de esa versión, o null. */
export const changelogSection = (version, changelog = read('CHANGELOG.md')) => {
  const lines = changelog.split('\n');
  const isHeading = (l) => /^## /.test(l);
  const start = lines.findIndex((l) => isHeading(l) && l.replace(/v\.?/i, 'v').includes(`v${version}]`));
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && isHeading(l));
  if (end === -1) end = lines.length;
  return { heading: lines[start], body: lines.slice(start + 1, end).join('\n').trim() };
};

/** Quita «--flag» de los argumentos y dice si estaba. */
export const takeFlag = (args, flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

/** Quita «--flag valor» de los argumentos y devuelve el valor. */
export const takeOption = (args, flag) => {
  const i = args.indexOf(flag);
  if (i === -1) return undefined;
  const [, value] = args.splice(i, 2);
  if (!value) throw new Error(`Falta el valor de ${flag}.`);
  return value;
};
