// Junta los PDF de sample/<caso>/ en una sola carpeta plana (sample-plano/) con nombres distintos:
// A-<caso>.pdf y B-<caso>.pdf, para subirlos de golpe a la app (lote) en pruebas manuales.
// No toca sample/ ni make-samples.mjs. Uso: npm run sample:flat
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('sample/', import.meta.url));
const OUT = fileURLToPath(new URL('sample-plano/', import.meta.url));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let n = 0;
for (const caso of readdirSync(SRC).sort()) {
  if (!statSync(join(SRC, caso)).isDirectory()) continue;
  for (const v of ['A', 'B']) {
    copyFileSync(join(SRC, caso, `${v}.pdf`), join(OUT, `${v}-${caso}.pdf`));
    n++;
  }
}
console.log(`${n} PDF en ${OUT}`);
