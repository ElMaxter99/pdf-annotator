#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const angularBuilderPath = join(projectRoot, 'node_modules', '@angular', 'build', 'package.json');

if (!existsSync(angularBuilderPath)) {
  console.error(
    '\n❌ No se encontraron las dependencias de Angular necesarias (por ejemplo @angular/build). ' +
      'Ejecuta "npm install" en la raíz del proyecto y vuelve a lanzar "npm run start:local".'
  );
  process.exit(1);
}

const serve = spawn(
  npmCmd,
  ['run', 'ng', '--', 'serve', '--host', '0.0.0.0', '--port', '4200'],
  {
    cwd: projectRoot,
    stdio: 'inherit'
  }
);

serve.on('exit', (code, signal) => {
  if (typeof code === 'number') {
    process.exit(code);
  }

  if (signal) {
    process.kill(process.pid, signal);
  }
});
