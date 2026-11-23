#!/usr/bin/env node
// Comprobación de tipos con TypeScript 7 (compilador nativo), solo informativa.
//
// El build (`ng build`, `ng test`) sigue con TypeScript 6.0.x porque Angular 22 no admite la 7
// (`typescript >=6.0 <6.1`). Aquí se usa TS 7 únicamente para `tsc --noEmit`, sin tocar
// `package.json`: se descarga con `npx` en una caché temporal. Ver `docs/MIGRACION-TS7.md`.
//
// Uso: `npm run typecheck:ts7` (o `node scripts/typecheck-ts7.mjs --strict` para que un error
// devuelva código 1; sin `--strict` siempre sale con 0, que es lo que usa el job de CI).
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

// Versión fijada a propósito: Dependabot no la actualiza. Subirla a mano al revisar.
const TS7_VERSION = '7.0.2';
const PROJECTS = ['tsconfig.app.json', 'tsconfig.spec.json'];
const strict = process.argv.includes('--strict');

let failures = 0;
const rows = [];
for (const project of PROJECTS) {
  const started = performance.now();
  const run = spawnSync(
    'npx',
    ['--yes', '--package', `typescript@${TS7_VERSION}`, 'tsc', '--noEmit', '-p', project],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  const seconds = (performance.now() - started) / 1000;
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`.trim();
  const errors = (output.match(/error TS\d+/g) ?? []).length;
  const crashed = run.status !== 0 && errors === 0;
  if (output) {
    console.log(output);
  }
  rows.push({ project, errors, seconds, crashed });
  if (errors > 0 || crashed) {
    failures += 1;
  }
}

console.log(`\nTypeScript ${TS7_VERSION} (solo comprobación de tipos, no compila la app)`);
for (const row of rows) {
  const state = row.crashed ? 'no se pudo ejecutar' : `${row.errors} errores`;
  console.log(
    `- ${row.project}: ${state} (${row.seconds.toFixed(1)} s, incluye la descarga de la primera vez)`,
  );
}
if (failures > 0) {
  console.log(
    '\nHay errores que TypeScript 7 detecta. No bloquea la versión: revisa si son reales antes de migrar (docs/MIGRACION-TS7.md).',
  );
}
process.exit(strict && failures > 0 ? 1 : 0);
