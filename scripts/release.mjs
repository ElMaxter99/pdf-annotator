// npm run release:deploy [-- comando] [opciones]
//   (sin comando)   Simulacro: comprueba que todo cuadra y enseña qué haría.
//   --execute       Tras las comprobaciones y escribiendo la versión para confirmar, hace el release:
//                   alinea develop y master (solo avance rápido, sin forzar), crea la rama release/vX.Y.Z
//                   y el tag vX.Y.Z sobre ese commit, y sube las tres cosas a origin.
//   bump X.Y.Z      Edita package.json, el badge del README y la cabecera del CHANGELOG
//                   (solo ficheros locales; no hace commit ni push).
// Parte de que la versión ya está hecha y fusionada en develop (npm run release:guide).
// El despliegue en Vercel queda a mano. Nunca empuja sin confirmación.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  changelogSection, currentVersion, DEV_BRANCH, MAIN_BRANCH, normalizeVersion, read, REPO_URL, ROOT, takeFlag,
} from './lib/release-utils.mjs';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const fail = (m) => { console.error(`✖ ${m}`); process.exit(1); };

const bump = (raw) => {
  const v = normalizeVersion(raw);
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = readFileSync(pkgPath, 'utf8').replace(/("version":\s*")[^"]+(")/, `$1${v}$2`);
  writeFileSync(pkgPath, pkg);
  const readmePath = resolve(ROOT, 'README.md');
  writeFileSync(readmePath, readFileSync(readmePath, 'utf8')
    .replace(/version-\d+\.\d+\.\d+-/, `version-${v}-`)
    .replace(/Versión \d+\.\d+\.\d+/, `Versión ${v}`));
  console.log(`✔ package.json y README.md en v${v}.`);
  if (changelogSection(v)) console.log('✔ CHANGELOG.md ya tiene la sección.');
  else console.log(`! Añade a mano la cabecera «## [v${v}](${REPO_URL}/tree/v.${v}) - AAAA-MM-DD» en CHANGELOG.md.`);
  console.log('Revisa con git diff, haz commit y abre la PR a develop (npm run release:guide).');
};

const isAncestor = (a, b) => {
  try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; }
};

const check = () => {
  const v = currentVersion();
  const tag = `v${v}`;
  const branch = `release/${tag}`;
  const problems = [];
  const ok = (m) => console.log(`✔ ${m}`);
  const bad = (m) => { problems.push(m); console.log(`✖ ${m}`); };

  if (git('status', '--porcelain')) bad('Hay cambios sin commit.'); else ok('Árbol limpio.');
  if (changelogSection(v)) ok(`CHANGELOG.md tiene la sección de ${tag}.`); else bad(`Falta la sección de ${tag} en CHANGELOG.md.`);
  if (read('README.md').includes(`version-${v}-`)) ok('El badge del README coincide.'); else bad('El badge del README no coincide con package.json.');

  try { git('fetch', 'origin', DEV_BRANCH, MAIN_BRANCH, '--tags', '--quiet'); } catch { bad('No se pudo hacer fetch de origin.'); return { v, tag, branch, problems }; }
  const dev = git('rev-parse', `origin/${DEV_BRANCH}`);
  const main = git('rev-parse', `origin/${MAIN_BRANCH}`);

  const pkgOnDev = JSON.parse(git('show', `origin/${DEV_BRANCH}:package.json`)).version;
  if (pkgOnDev === v && git('rev-parse', 'HEAD') === dev) ok(`Estás en el último origin/${DEV_BRANCH}, que está en v${v}.`);
  else bad(`Ejecuta desde ${DEV_BRANCH} actualizado (git switch ${DEV_BRANCH} && git pull) con la versión ${v} ya fusionada.`);

  let target = dev;
  let align = null;
  if (dev === main) ok(`${DEV_BRANCH} y ${MAIN_BRANCH} ya están alineadas.`);
  else if (isAncestor(main, dev)) { align = MAIN_BRANCH; ok(`${MAIN_BRANCH} se puede avanzar a ${DEV_BRANCH} (avance rápido).`); }
  else if (isAncestor(dev, main)) { align = DEV_BRANCH; target = main; ok(`${DEV_BRANCH} se puede avanzar a ${MAIN_BRANCH} (avance rápido).`); }
  else bad(`${DEV_BRANCH} y ${MAIN_BRANCH} han divergido: fusiona una en la otra por PR; el script no fuerza nada.`);

  if (git('tag', '--list', tag)) bad(`El tag ${tag} ya existe.`); else ok(`El tag ${tag} está libre.`);
  if (git('ls-remote', '--heads', 'origin', branch)) bad(`La rama ${branch} ya existe en origin.`); else ok(`La rama ${branch} está libre.`);
  return { v, tag, branch, target, align, problems };
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === 'bump') return bump(args[1]);
  const execute = takeFlag(args, '--execute');
  if (args.length) fail(`Argumento desconocido: ${args.join(' ')}`);

  const { tag, branch, target, align, problems } = check();
  if (problems.length) fail('Resuelve lo anterior antes de hacer el release.');
  const short = target.slice(0, 7);
  console.log(`\nSe haría, sobre ${short}:`);
  if (align) console.log(`  1. Avanzar ${align} a ${short} (push normal, sin --force).`);
  console.log(`  ${align ? 2 : 1}. Crear y subir la rama ${branch}.`);
  console.log(`  ${align ? 3 : 2}. Crear y subir el tag anotado ${tag}.`);
  console.log('  Después: desplegar en Vercel a mano y publicar las notas (npm run release:notes).');
  if (!execute) return console.log('\nSimulacro: no se ha cambiado nada. Usa --execute para continuar con confirmación.');
  if (!process.stdin.isTTY) fail('--execute necesita una terminal interactiva para confirmar.');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`Escribe ${tag} para confirmar (otra cosa cancela): `)).trim();
  rl.close();
  if (answer !== tag) return console.log('Cancelado. No se ha cambiado nada.');

  if (align) { git('push', 'origin', `${target}:refs/heads/${align}`); console.log(`✔ ${align} avanzada a ${short}.`); }
  git('push', 'origin', `${target}:refs/heads/${branch}`); console.log(`✔ Rama ${branch} subida.`);
  git('tag', '-a', tag, target, '-m', `Release ${tag}`);
  git('push', 'origin', tag); console.log(`✔ Tag ${tag} subido.`);
  console.log(`Listo. Despliega en Vercel a mano y publica la release: ${REPO_URL}/releases/new?tag=${tag}`);
};

main().catch((e) => fail(e.message));
