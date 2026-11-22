// Une los `latest-mac.yml` de los dos empaquetados de macOS (arm64 en macos-latest e Intel en macos-15-intel).
// Cada job sube el suyo a la release y el último pisaba al otro: el archivo final solo listaba un procesador.
// Uso: node scripts/merge-mac-feed.mjs <latest-mac-a.yml> <latest-mac-b.yml> [--out latest-mac.yml]
// El formato es el fijo que escribe electron-builder (version, files[url, sha512, size], path, sha512, releaseDate).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const unquote = (v) => {
  const s = v.trim();
  return (s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"')) ? s.slice(1, -1) : s;
};

/** Lee un latest-mac.yml de electron-builder. Lanza si falta algo imprescindible. */
export function parseFeed(text) {
  const feed = { version: '', files: [], path: '', sha512: '', releaseDate: '' };
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = /^\s*-\s+(\w+):\s*(.*)$/.exec(raw);
    if (item) {
      current = { [item[1]]: unquote(item[2]) };
      feed.files.push(current);
      continue;
    }
    const nested = /^\s{2,}(\w+):\s*(.*)$/.exec(raw);
    if (nested && current) {
      current[nested[1]] = unquote(nested[2]);
      continue;
    }
    const top = /^(\w+):\s*(.*)$/.exec(raw);
    if (top) {
      current = null;
      if (top[1] !== 'files') feed[top[1]] = unquote(top[2]);
    }
  }
  feed.files = feed.files.map((f) => ({ url: f.url ?? '', sha512: f.sha512 ?? '', size: Number(f.size) }));
  if (!feed.version || feed.files.length === 0 || feed.files.some((f) => !f.url || !f.sha512 || !Number.isFinite(f.size))) {
    throw new Error('latest-mac.yml incompleto o con un formato inesperado.');
  }
  return feed;
}

/** Une dos feeds de la misma versión: todos los archivos (sin repetir url); `path` y `sha512` del de Intel si lo hay. */
export function mergeFeeds(a, b) {
  if (a.version !== b.version) throw new Error(`Versiones distintas: ${a.version} y ${b.version}.`);
  const files = [];
  for (const f of [...a.files, ...b.files]) if (!files.some((g) => g.url === f.url)) files.push(f);
  const intel = [a, b].find((f) => !/arm64/.test(f.path)) ?? a;
  const releaseDate = [a.releaseDate, b.releaseDate].filter(Boolean).sort().at(-1) ?? '';
  return { version: a.version, files, path: intel.path, sha512: intel.sha512, releaseDate };
}

export function formatFeed(feed) {
  const lines = [`version: ${feed.version}`, 'files:'];
  for (const f of feed.files) lines.push(`  - url: ${f.url}`, `    sha512: ${f.sha512}`, `    size: ${f.size}`);
  lines.push(`path: ${feed.path}`, `sha512: ${feed.sha512}`);
  if (feed.releaseDate) lines.push(`releaseDate: '${feed.releaseDate}'`);
  return lines.join('\n') + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf('--out');
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  if (args.length !== 2) {
    console.error('Uso: node scripts/merge-mac-feed.mjs <a.yml> <b.yml> [--out latest-mac.yml]');
    process.exit(2);
  }
  const merged = formatFeed(mergeFeeds(...args.map((p) => parseFeed(readFileSync(p, 'utf8')))));
  if (out) writeFileSync(out, merged);
  else process.stdout.write(merged);
}
