// Las apps gráficas de macOS y Linux no heredan el PATH de la terminal: sin él no se encuentran `claude` ni `copilot`.
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const MARK = '__PA_PATH__';

export function extraDirs(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === 'win32') return [path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'npm'), path.join(home, '.local', 'bin')];
  const dirs = [path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), path.join(home, '.claude', 'local'), '/usr/local/bin'];
  if (platform === 'darwin') dirs.push('/opt/homebrew/bin');
  return dirs;
}

export function mergePath(current, extra, delimiter = path.delimiter) {
  const seen = new Set();
  return [...String(current || '').split(delimiter), ...extra].filter((d) => d && !seen.has(d) && seen.add(d)).join(delimiter);
}

/** PATH del shell de login (macOS/Linux) fusionado con las carpetas habituales de los CLI. */
export function resolvePath(env = process.env) {
  const base = mergePath(env.PATH, extraDirs());
  if (process.platform === 'win32') return Promise.resolve(base);
  const shell = env.SHELL || '/bin/sh';
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', `echo ${MARK}$PATH${MARK}`], { timeout: 5000, env }, (err, stdout) => {
      const m = !err && new RegExp(`${MARK}(.*)${MARK}`).exec(String(stdout));
      resolve(m ? mergePath(m[1], base.split(path.delimiter)) : base);
    });
  });
}
