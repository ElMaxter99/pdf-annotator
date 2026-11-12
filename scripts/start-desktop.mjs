#!/usr/bin/env node
// `npm run start:desktop`: compila la web, instala lo que falte (desktop y ayudante) y abre la app de escritorio.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const win = process.platform === 'win32';

function run(cmd, cwd) {
  const r = win
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd], { cwd, stdio: 'inherit' })
    : spawnSync('sh', ['-c', cmd], { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`Falló «${cmd}» en ${cwd}.`);
    process.exit(r.status || 1);
  }
}

for (const dir of [join(root, 'desktop'), join(root, 'tools', 'ai-phase0')]) {
  if (!existsSync(join(dir, 'node_modules'))) {
    console.log(`Instalando dependencias de ${dir} (una sola vez)…`);
    run('npm install --no-fund --no-audit', dir);
  }
}
run('npm run build', root);
run('npx electron desktop', root);
