// Comprueba que el empaquetado sin instalador (`electron-builder --dir`) lleva todo lo que la app necesita.
// Uso: node desktop/verify-pack.mjs   (desde la raíz, después de `electron-builder --projectDir desktop --dir`)
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const out = path.resolve('release');
const unpacked = readdirSync(out).find((d) => /^(win|linux|mac)/.test(d) && existsSync(path.join(out, d)));
if (!unpacked) throw new Error('No hay salida de electron-builder en release/');
const base = path.join(out, unpacked);
const resources = existsSync(path.join(base, 'resources'))
  ? path.join(base, 'resources')
  : path.join(base, readdirSync(base).find((n) => n.endsWith('.app')), 'Contents', 'Resources');

const need = [
  'app.asar',
  'web/index.html',
  'tools/ai-helper/server.mjs',
  'tools/ai-helper/models.mjs',
  'tools/ai-phase0/providers.mjs',
  'tools/ai-phase0/node_modules/pdfjs-dist',
  'tools/ai-phase0/node_modules/@napi-rs/canvas',
];
const missing = need.filter((f) => !existsSync(path.join(resources, f)));
const native = existsSync(path.join(resources, 'tools/ai-phase0/node_modules/@napi-rs'))
  ? readdirSync(path.join(resources, 'tools/ai-phase0/node_modules/@napi-rs')).filter((n) => n.startsWith('canvas-'))
  : [];
if (!native.length) missing.push('tools/ai-phase0/node_modules/@napi-rs/canvas-<plataforma> (binario nativo)');
if (missing.length) {
  console.error('Faltan en el paquete:\n - ' + missing.join('\n - '));
  process.exit(1);
}
console.log(`OK: ${unpacked} (${native.join(', ')})`);
