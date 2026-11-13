#!/usr/bin/env node
// La versión sale solo de package.json: copia ese número a desktop/package.json (lo que lee electron-builder).
// Sin argumentos copia la versión; `--check` solo comprueba (y, con `--tag vX.Y.Z`, que la etiqueta coincida). Los workflows lo ejecutan antes de empaquetar, así subir la versión en package.json no obliga a tocar desktop/.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const deskUrl = new URL('desktop/package.json', root);
const desk = JSON.parse(readFileSync(deskUrl, 'utf8'));
const args = process.argv.slice(2);
const tagIdx = args.indexOf('--tag');
const tagVersion = tagIdx >= 0 ? args[tagIdx + 1].replace(/^v/, '') : null;
// Release candidate (vX.Y.Z-rc.N): la versión sale de la etiqueta y se estampa en el árbol de trabajo del CI
// (package.json y desktop/package.json); nunca se confirma. Así el instalador y el actualizador ven X.Y.Z-rc.N.
if (tagVersion && /^\d+\.\d+\.\d+-rc\.\d+$/.test(tagVersion)) {
  if (args.includes('--check')) {
    console.error('--check no se puede combinar con una etiqueta rc.');
    process.exit(1);
  }
  if (tagVersion.split('-')[0] !== rootPkg.version.split('-')[0]) {
    console.log(`Aviso: package.json (${rootPkg.version}) no coincide con la base de ${tagVersion}; se usa la de la etiqueta.`);
  }
  rootPkg.version = tagVersion;
  writeFileSync(new URL('package.json', root), JSON.stringify(rootPkg, null, 2) + '\n');
  console.log(`package.json → ${tagVersion}`);
} else if (tagVersion && tagVersion !== rootPkg.version) {
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
