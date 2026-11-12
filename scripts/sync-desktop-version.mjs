#!/usr/bin/env node
// La versión sale solo de package.json: copia ese número a desktop/package.json (lo que lee electron-builder).
// `--check` solo comprueba (y, con `--tag vX.Y.Z`, que la etiqueta coincida).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const deskUrl = new URL('desktop/package.json', root);
const desk = JSON.parse(readFileSync(deskUrl, 'utf8'));
const args = process.argv.slice(2);
const tagIdx = args.indexOf('--tag');
if (tagIdx >= 0 && args[tagIdx + 1].replace(/^v/, '') !== rootPkg.version) {
  console.error(`La etiqueta ${args[tagIdx + 1]} no coincide con package.json (${rootPkg.version}).`);
  process.exit(1);
}
if (desk.version === rootPkg.version) process.exit(0);
if (args.includes('--check')) {
  console.error(`desktop/package.json (${desk.version}) no coincide con package.json (${rootPkg.version}). Ejecuta: node ${fileURLToPath(import.meta.url)}`);
  process.exit(1);
}
desk.version = rootPkg.version;
writeFileSync(deskUrl, JSON.stringify(desk, null, 2) + '\n');
console.log(`desktop/package.json → ${rootPkg.version}`);
