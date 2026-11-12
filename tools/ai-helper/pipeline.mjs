// Propuesta de coordenadas A→B con IA para la app: mismo flujo que la fase 0, pero recibe los PDF y la plantilla
// de A en memoria y devuelve una fila por campo. Nunca evalúa la salida de la IA: solo la valida y la convierte.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPrompt, findText, flattenFields, nearbyTexts, parseJsonFromText, resolveProposal, validateProposals } from '../ai-phase0/lib.mjs';
import { readPdf } from '../ai-phase0/pdf.mjs';
import { PROVIDERS, detectLimit, runCli } from '../ai-phase0/providers.mjs';

const sizes = (pdf) => [...new Set(pdf.pages.map((p) => `${Math.round(p.width)}×${Math.round(p.height)}`))].join(' / ');
const tail = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(-300) || '(sin salida)';

/** Proveedor simulado (solo con AI_HELPER_FAKE=1): ancla = texto más cercano de A, mismo texto en B. Para pruebas e2e. */
function fakeAnswer(entries, A, B) {
  return entries.map((e) => {
    const near = nearbyTexts(A.texts, e.page, e.field, 1)[0];
    if (!near) return { id: e.id, found: false, reason: 'sin texto cercano' };
    const b = B.texts.filter((t) => t.text === near.text).sort((x, y) => x.page - y.page)[0];
    if (!b) return { id: e.id, found: false, reason: 'el texto ya no existe en B' };
    return { id: e.id, found: true, page: b.page, anchorA: near.text, anchorB: near.text, dx: 0, dy: 0, confidence: 0.9, reason: `Ancla «${near.text}»` };
  });
}

export async function runProposal({ provider, model, aBytes, bBytes, template, keepApiKey = false, timeoutMs = 300_000, onStage = () => {}, signal }) {
  const fake = process.env.AI_HELPER_FAKE === '1' && provider === 'fake';
  if (!fake && !PROVIDERS[provider]) throw Object.assign(new Error('Proveedor desconocido.'), { code: 'bad_provider' });
  const work = await mkdtemp(path.join(os.tmpdir(), 'pdfann-ia-'));
  try {
    onStage('reading');
    await writeFile(path.join(work, 'A.pdf'), aBytes);
    await writeFile(path.join(work, 'B.pdf'), bBytes);
    const A = await readPdf(path.join(work, 'A.pdf'), { prefix: 'A', outDir: work });
    const B = await readPdf(path.join(work, 'B.pdf'), { prefix: 'B', outDir: work });
    const entries = flattenFields(template);
    if (!entries.length) return { rows: [], seconds: 0, warnings: [], pagesA: A.pages.length, pagesB: B.pages.length };
    await writeFile(path.join(work, 'textsA.json'), JSON.stringify(A.texts, null, 1));
    await writeFile(path.join(work, 'textsB.json'), JSON.stringify(B.texts, null, 1));
    await writeFile(
      path.join(work, 'fields.json'),
      JSON.stringify(entries.map((e) => ({ id: e.id, page: e.page, type: e.field.type ?? 'text', label: e.field.mapField, x: e.field.x, y: e.field.y, nearby: nearbyTexts(A.texts, e.page, e.field) })), null, 1),
    );
    const known = new Set(entries.map((e) => e.id));
    let proposals = [];
    let warnings = [];
    let seconds = 0;
    let retryNote = '';
    if (fake) {
      const parsed = validateProposals(fakeAnswer(entries, A, B), known);
      proposals = parsed.proposals;
    } else {
      for (let attempt = 1; attempt <= 2; attempt++) {
        onStage('asking', attempt);
        await writeFile(path.join(work, 'prompt.md'), buildPrompt({ pagesA: A.pages.length, pagesB: B.pages.length, sizeA: sizes(A), sizeB: sizes(B), retryNote }));
        const run = await runCli(provider, work, { model, keepApiKey, timeoutMs, signal, quiet: true });
        seconds += run.seconds;
        if (run.aborted) throw Object.assign(new Error('Cancelado.'), { code: 'aborted' });
        const limit = detectLimit(run.stdout, run.stderr);
        if (limit) throw Object.assign(new Error(limit), { code: 'limit', reset: limit.match(/renueva a las (.+?)\./)?.[1] ?? null });
        if (!run.ok) throw Object.assign(new Error(`El CLI terminó con código ${run.code}: ${tail(run.stderr || run.stdout)}`), { code: run.code === -1 ? 'missing' : run.code === -2 ? 'timeout' : 'cli_error' });
        const ex = PROVIDERS[provider].extract(run.stdout);
        if (ex.meta.isError) throw Object.assign(new Error(`El CLI devolvió un error: ${tail(ex.text)}`), { code: 'cli_error' });
        const parsed = validateProposals(parseJsonFromText(ex.text), known);
        proposals = parsed.proposals;
        warnings = parsed.errors;
        if (proposals.length && warnings.length < known.size / 2) break;
        retryNote = 'tu respuesta anterior no era una lista JSON válida con un objeto por campo. Devuelve únicamente esa lista.';
      }
    }
    onStage('resolving');
    const rows = entries.map((e) => {
      const p = proposals.find((x) => x.id === e.id);
      if (!p) return { id: e.id, page: e.page, index: e.index, ok: false, why: 'sin_respuesta', reason: '' };
      const r = resolveProposal(p, e, A.texts, B.texts);
      return r.ok
        ? { id: e.id, page: e.page, index: e.index, ok: true, newPage: r.page, x: r.x, y: r.y, confidence: p.confidence, reason: p.reason, anchorA: p.anchorA, anchorB: p.anchorB }
        : { id: e.id, page: e.page, index: e.index, ok: false, why: r.why, reason: p.reason };
    });
    return { rows, seconds, warnings, pagesA: A.pages.length, pagesB: B.pages.length };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
export { findText };
