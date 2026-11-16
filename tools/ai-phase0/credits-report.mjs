#!/usr/bin/env node
// Informe de créditos medidos con Copilot: lee out/<caso>/copilot/result.json (lo deja `node run.mjs --provider copilot`)
// y, si se dan los créditos que GitHub marca antes y después, compara ambas medidas.
// Uso:  node credits-report.mjs [--github-before <n> --github-after <n>]
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? Number(args[i + 1]) : null;
};

export function buildReport(cases, github) {
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sum = (key) => cases.reduce((n, c) => n + (num(c[key]) ?? 0), 0);
  const measured = cases.filter((c) => num(c.aiCredits) !== null);
  const total = sum('aiCredits');
  const lines = [
    '| Caso | Campos | Intentos | Tokens (entrada / salida / caché) | Créditos (CLI) | Peticiones |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const c of cases) {
    const u = c.usage ?? {};
    const tokens = c.usage
      ? `${u.input_tokens ?? 0} / ${u.output_tokens ?? 0} / ${(u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)}`
      : '–';
    lines.push(
      `| ${c.name} | ${c.total ?? '–'} | ${c.attempts ?? '–'} | ${tokens} | ${num(c.aiCredits) ?? '–'} | ${num(c.premiumRequests) ?? '–'} |`,
    );
  }
  lines.push(
    `| **Total (${measured.length} de ${cases.length} con dato)** | | | | **${+total.toFixed(4)}** | ${+sum('premiumRequests').toFixed(2)} |`,
  );
  const out = { lines, total, perCase: measured.length ? total / measured.length : null };
  if (github && github.before !== null && github.after !== null) {
    const delta = github.after - github.before;
    out.github = { delta, ratio: total > 0 ? delta / total : null };
    lines.push(
      '',
      `GitHub marca ${+delta.toFixed(4)} créditos de diferencia; el CLI sumó ${+total.toFixed(4)}.` +
        (out.github.ratio === null ? '' : ` Cociente GitHub/CLI: ${out.github.ratio.toFixed(2)}.`),
    );
  }
  if (out.perCase !== null)
    lines.push(
      '',
      `Media medida: ${+out.perCase.toFixed(4)} créditos por caso (un par = una petición, sin reintento).`,
    );
  return out;
}

async function main() {
  const outDir = path.join(here, 'out');
  const cases = [];
  for (const d of await readdir(outDir, { withFileTypes: true }).catch(() => [])) {
    if (!d.isDirectory()) continue;
    try {
      const { summary } = JSON.parse(
        await readFile(path.join(outDir, d.name, 'copilot', 'result.json'), 'utf8'),
      );
      cases.push({ name: d.name, ...summary });
    } catch {
      /* este caso no se ejecutó con Copilot */
    }
  }
  if (!cases.length) {
    console.error(
      'No hay resultados de Copilot en out/. Ejecuta antes: node run.mjs --provider copilot',
    );
    process.exit(1);
  }
  console.log(
    buildReport(cases, { before: opt('github-before'), after: opt('github-after') }).lines.join(
      '\n',
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
