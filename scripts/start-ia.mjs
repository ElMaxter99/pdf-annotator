#!/usr/bin/env node
// `npm run start:ia`: la app en local (puerto 4200) + el ayudante de la IA (127.0.0.1:4310). Solo para uso local.
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const phase0 = join(root, 'tools', 'ai-phase0');
if (!existsSync(join(phase0, 'node_modules'))) {
  console.log('Instalando las dependencias del ayudante (una sola vez)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : npm, process.platform === 'win32' ? ['/d', '/s', '/c', 'npm install'] : ['install'], { cwd: phase0, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('No se pudo instalar. Ejecuta «npm install» dentro de tools/ai-phase0 y reintenta.');
    process.exit(1);
  }
}
const children = [
  spawn(process.execPath, [join(root, 'tools', 'ai-helper', 'server.mjs')], { cwd: root, stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [join(root, 'scripts', 'start-local.mjs')], { cwd: root, stdio: 'inherit' }),
];
const stop = () => children.forEach((c) => c.kill());
children.forEach((c) => c.on('exit', () => { stop(); process.exit(0); }));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
