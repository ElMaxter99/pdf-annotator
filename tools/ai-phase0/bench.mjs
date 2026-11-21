#!/usr/bin/env node
// Banco de medida de «Trasladar con IA» con el MOTOR DE LA APP (`runProposal`: pase sin IA, pasadas por página, anclar
// en B y huecos). Por defecto mide cada caso con y sin el pase sin IA para ver cuánto ahorra.
// Uso: node bench.mjs [--cases <carpeta>] [--provider claude|copilot|fake] [--model <id>] [--no-retry]
//                     [--text-first both|on|off] [--timeout <segundos>] [--max-requests <n>] [--keep-api-key] [--out <carpeta>]
//                     [--instructions "<texto>"]  (indicaciones de la persona para la IA, como en la app; A6)
// Salida: out/bench-<fecha>.md y out/bench-<fecha>.json, sin contenido de los PDF (solo ids, mapField, números y motivos).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_REQUESTS_PER_PDF, runProposal } from '../ai-helper/pipeline.mjs';
import { buildReport, failedCase, listCases, renderMarkdown, scoreCase, stamp, truthMap } from './bench-lib.mjs';
import { flattenFields } from './lib.mjs';
import { PROVIDERS } from './providers.mjs';
import { cleanInstructions } from '../ai-helper/instructions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

const provider = opt('provider', 'claude');
if (provider !== 'fake' && !PROVIDERS[provider]) fail('--provider debe ser claude, copilot o fake');
// Sin --model, el mismo que la app (DEFAULT_MODELS de ai-helper.service.ts): sonnet con Claude, el del CLI con Copilot.
const model = opt('model', provider === 'claude' ? 'sonnet' : undefined);
const retry = !args.includes('--no-retry');
const tfArg = opt('text-first', 'both');
if (!['both', 'on', 'off'].includes(tfArg)) fail('--text-first debe ser both, on u off');
const modes = tfArg === 'both' ? [true, false] : [tfArg === 'on'];
const timeoutMs = Number(opt('timeout', '300')) * 1000;
const maxRequests = Number(opt('max-requests', String(MAX_REQUESTS_PER_PDF)));
const keepApiKey = args.includes('--keep-api-key');
const instructions = cleanInstructions(opt('instructions', ''));
const casesDir = path.resolve(opt('cases', path.join(here, 'sample-plano')));
const outDir = path.resolve(opt('out', path.join(here, 'out')));
if (provider === 'fake') process.env.AI_HELPER_FAKE = '1';

let cases;
try {
  cases = await listCases(casesDir);
} catch (e) {
  fail(`No puedo leer la carpeta de casos ${casesDir}: ${e.code ?? e.message}`);
}
if (!cases.length) fail(`No hay casos en ${casesDir}. Cada caso necesita A.pdf, A.json y B.pdf (o A-<caso>.pdf, A-<caso>.json y B-<caso>.pdf); expected.json es opcional.`);

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const readOptionalJson = (p) => readJson(p).catch((e) => (e.code === 'ENOENT' ? null : Promise.reject(e)));

const runsByMode = modes.map((textFirst) => ({ textFirst, runs: [] }));
let stopped = null;
const previousTextFirst = process.env.AI_HELPER_TEXT_FIRST;
for (const c of cases) {
  if (stopped) break;
  const [aBytes, bBytes, template, expected] = await Promise.all([readFile(c.a), readFile(c.b), readJson(c.aJson), readOptionalJson(c.expected)]);
  const entries = flattenFields(template);
  const truth = truthMap(expected);
  for (const mode of runsByMode) {
    if (stopped) break;
    process.env.AI_HELPER_TEXT_FIRST = mode.textFirst ? '1' : '0';
    process.stdout.write(`→ ${c.name} ${mode.textFirst ? 'con' : 'sin'} pase sin IA… `);
    const t0 = performance.now();
    try {
      const result = await runProposal({ provider, model, aBytes, bBytes, template, instructions, keepApiKey, timeoutMs, maxAttempts: retry ? 2 : 1, maxRequests });
      const r = scoreCase({ name: c.name, textFirst: mode.textFirst, result, entries, truth, seconds: (performance.now() - t0) / 1000 });
      mode.runs.push(r);
      console.log(`${r.placed}/${r.total} colocados (${r.placedWithoutAi} sin IA), ${r.requests} peticiones, ${r.seconds} s`);
    } catch (e) {
      const r = failedCase({ name: c.name, textFirst: mode.textFirst, error: e, seconds: (performance.now() - t0) / 1000, total: entries.length });
      mode.runs.push(r);
      // El mensaje solo va a la consola (puede citar la salida del CLI); el informe guarda el código.
      console.log(`falló (${r.error.code}): ${e.message}`);
      if (e.code === 'limit') {
        stopped = e.reset ? `límite de uso, renueva a las ${e.reset}` : 'límite de uso';
        console.log('⛔ Límite de uso: paro aquí para no gastar más; los casos que faltan no se han ejecutado.');
      } else if (e.code === 'missing') {
        stopped = `no encuentro el CLI «${provider}»`;
        console.log('⛔ Sin CLI no tiene sentido seguir: los casos que faltan no se han ejecutado.');
      }
    }
  }
}
if (previousTextFirst === undefined) delete process.env.AI_HELPER_TEXT_FIRST;
else process.env.AI_HELPER_TEXT_FIRST = previousTextFirst;

const now = new Date();
const meta = { date: now.toISOString(), provider, model: model ?? null, retry, maxRequests, instructions: instructions.length, cases: cases.length, casesDir: path.basename(casesDir), modes: modes.map((m) => (m ? 'con' : 'sin')), stopped };
const report = buildReport(meta, runsByMode);
await mkdir(outDir, { recursive: true });
const base = path.join(outDir, `bench-${stamp(now)}`);
const md = renderMarkdown(report);
await writeFile(`${base}.md`, md);
await writeFile(`${base}.json`, JSON.stringify(report, null, 2) + '\n');
console.log('\n' + md);
console.log(`Informe: ${base}.md\nDatos:   ${base}.json`);
