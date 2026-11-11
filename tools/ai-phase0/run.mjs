#!/usr/bin/env node
// Fase 0: ¿acierta la IA al recolocar los campos de A en B? Ejecuta los CLI con tu sesión iniciada.
// Uso:  node run.mjs [--provider claude|copilot|both] [--pair <carpeta>] [--keep-api-key] [--keep-work] [--timeout <segundos>]
// La carpeta de trabajo (imágenes y textos enviados al CLI) se borra al terminar, salvo con --keep-work.
// Cada par vive en una carpeta con A.pdf, A.json, B.pdf y (opcional) expected.json con la solución conocida.
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, flattenFields, nearbyTexts, parseJsonFromText, resolveProposal, score, summarize, validateProposals } from './lib.mjs';
import { readPdf } from './pdf.mjs';
import { PROVIDERS, runCli } from './providers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const providerArg = opt('provider', 'both');
const providers = providerArg === 'both' ? ['claude', 'copilot'] : [providerArg];
const keepApiKey = args.includes('--keep-api-key');
const keepWork = args.includes('--keep-work');
const timeoutSec = Number(opt('timeout', '300'));
if (!providers.every((p) => PROVIDERS[p])) {
  console.error('--provider debe ser claude, copilot o both');
  process.exit(1);
}

const sizes = (pdf) => [...new Set(pdf.pages.map((p) => `${Math.round(p.width)}×${Math.round(p.height)}`))].join(' / ');
const tail = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(-400) || '(sin salida)';
const exists = (p) => stat(p).then(() => true, () => false);
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

async function listPairs() {
  const given = opt('pair');
  if (given) return [path.resolve(given)];
  const out = [];
  for (const root of ['pairs', 'sample']) {
    const dir = path.join(here, root);
    if (!(await exists(dir))) continue;
    for (const d of await readdir(dir, { withFileTypes: true })) {
      if (d.isDirectory() && (await exists(path.join(dir, d.name, 'A.pdf')))) out.push(path.join(dir, d.name));
    }
  }
  return out;
}

async function runPair(pairDir, name) {
  const outBase = path.join(here, 'out', path.basename(pairDir));
  const work = path.join(outBase, name, 'work');
  await rm(path.join(outBase, name), { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const A = await readPdf(path.join(pairDir, 'A.pdf'), { prefix: 'A', outDir: work });
  const B = await readPdf(path.join(pairDir, 'B.pdf'), { prefix: 'B', outDir: work });
  const entriesA = flattenFields(await readJson(path.join(pairDir, 'A.json')));
  // expected.json: solución conocida por campo de A ({ id, page, x, y } o { id, gone: true }).
  const expectedPath = path.join(pairDir, 'expected.json');
  const truth = (await exists(expectedPath)) ? new Map((await readJson(expectedPath)).map((e) => [e.id, e.gone ? { gone: true } : { page: e.page, field: { x: e.x, y: e.y } }])) : null;

  await writeFile(path.join(work, 'textsA.json'), JSON.stringify(A.texts, null, 1));
  await writeFile(path.join(work, 'textsB.json'), JSON.stringify(B.texts, null, 1));
  await writeFile(
    path.join(work, 'fields.json'),
    JSON.stringify(entriesA.map((e) => ({ id: e.id, page: e.page, type: e.field.type ?? 'text', label: e.field.mapField, x: e.field.x, y: e.field.y, nearby: nearbyTexts(A.texts, e.page, e.field) })), null, 1),
  );

  const known = new Set(entriesA.map((e) => e.id));
  let retryNote = '';
  let attempt = 0;
  let proposals = [];
  let errors = [];
  let run;
  let seconds = 0;
  let meta = {};
  while (attempt < 2) {
    attempt++;
    await writeFile(path.join(work, 'prompt.md'), buildPrompt({ pagesA: A.pages.length, pagesB: B.pages.length, sizeA: sizes(A), sizeB: sizes(B), retryNote }));
    run = await runCli(name, work, { keepApiKey, timeoutMs: timeoutSec * 1000 });
    seconds += run.seconds;
    await writeFile(path.join(outBase, name, `raw-${attempt}.txt`), `# code ${run.code}\n${run.stdout}\n--- stderr ---\n${run.stderr}`);
    if (!run.ok) {
      errors = [`El CLI terminó con código ${run.code}: ${tail(run.stderr || run.stdout)}`];
      break;
    }
    const ex = PROVIDERS[name].extract(run.stdout);
    meta = ex.meta;
    if (meta.isError) {
      errors = [`El CLI devolvió un error: ${tail(ex.text)}`];
      break;
    }
    const parsed = validateProposals(parseJsonFromText(ex.text), known);
    proposals = parsed.proposals;
    errors = parsed.errors;
    if (proposals.length && errors.length < known.size / 2) break;
    retryNote = 'tu respuesta anterior no era una lista JSON válida con un objeto por campo. Devuelve únicamente esa lista.';
  }

  const rows = [];
  for (const p of proposals) {
    const entry = entriesA.find((e) => e.id === p.id);
    const resolved = resolveProposal(p, entry, A.texts, B.texts);
    rows.push({ id: p.id, label: entry.field.mapField, proposal: p, resolved, score: score(resolved, truth?.get(p.id)) });
  }
  if (!keepWork) await rm(work, { recursive: true, force: true });
  const summary = { provider: name, seconds, attempts: attempt, parseErrors: errors, ...meta, ...summarize(rows), total: entriesA.length };
  await writeFile(path.join(outBase, name, 'result.json'), JSON.stringify({ summary, rows }, null, 2));

  // Propuesta lista para importar en la app como JSON de B.
  const byPage = new Map();
  for (const r of rows) {
    if (!r.resolved.ok) continue;
    const entry = entriesA.find((e) => e.id === r.id);
    if (!byPage.has(r.resolved.page)) byPage.set(r.resolved.page, []);
    byPage.get(r.resolved.page).push({ ...entry.field, x: r.resolved.x, y: r.resolved.y });
  }
  const pagesOut = [...byPage.entries()].sort((a, b) => a[0] - b[0]).map(([num, fields]) => ({ num, fields }));
  await writeFile(path.join(outBase, name, 'B-propuesta.json'), JSON.stringify({ pages: pagesOut }, null, 2));
  return { summary, rows };
}

const fmt = (v) => (v === null || v === undefined ? '–' : v);
const pairs = await listPairs();
if (!pairs.length) {
  console.error('No hay pares. Deja tus ejemplos en tools/ai-phase0/pairs/<nombre>/ (A.pdf, A.json, B.pdf y expected.json opcional) o ejecuta `npm run sample`.');
  process.exit(1);
}

const lines = ['# Fase 0: resultados', '', '| Par | Proveedor | Campos | Resueltos | Página OK | Ausentes OK | Error mediano (pt) | ≤2 pt | ≤5 pt | Segundos | Avisos |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const pairDir of pairs) {
  for (const name of providers) {
    process.stdout.write(`→ ${path.basename(pairDir)} con ${PROVIDERS[name].label}… `);
    try {
      const { summary: s } = await runPair(pairDir, name);
      console.log(`${s.resolved}/${s.total} resueltos, ${s.seconds} s`);
      for (const w of s.parseErrors.slice(0, 5)) console.log(`   ⚠ ${w}`);
      if (s.parseErrors.length > 5) console.log(`   ⚠ …y ${s.parseErrors.length - 5} avisos más (ver out/${path.basename(pairDir)}/${name}/result.json)`);
      lines.push(`| ${path.basename(pairDir)} | ${name} | ${s.total} | ${s.resolved} | ${s.scored ? `${s.pageOk}/${s.scored}` : '–'} | ${s.goneTotal ? `${s.goneOk}/${s.goneTotal}` : '–'} | ${fmt(s.medianErrPt)} | ${s.errsMeasured ? `${s.within2}/${s.errsMeasured}` : '–'} | ${s.errsMeasured ? `${s.within5}/${s.errsMeasured}` : '–'} | ${s.seconds} | ${s.parseErrors.length} |`);
    } catch (e) {
      console.log(`falló: ${e.message}`);
      lines.push(`| ${path.basename(pairDir)} | ${name} | – | – | – | – | – | – | – | – | ${String(e.message).replaceAll('|', '/')} |`);
    }
  }
}
await mkdir(path.join(here, 'out'), { recursive: true });
await writeFile(path.join(here, 'out', 'summary.md'), lines.join('\n') + '\n');
console.log('\n' + lines.join('\n') + '\n\nDetalle en tools/ai-phase0/out/ (result.json, B-propuesta.json, raw-*.txt).');
