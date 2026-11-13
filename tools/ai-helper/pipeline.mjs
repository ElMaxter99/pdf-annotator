// Propuesta de coordenadas A→B con IA para la app: mismo flujo que la fase 0, pero recibe los PDF y la plantilla
// de A en memoria y devuelve una fila por campo. Nunca evalúa la salida de la IA: solo la valida y la convierte.
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildPrompt, findText, flattenFields, looksLikeProposals, describeImageCodes, nearbyTexts, parseJsonFromText, resolveProposal, validateProposals } from '../ai-phase0/lib.mjs';
import { readPdf } from '../ai-phase0/pdf.mjs';
import { PROVIDERS, describeClaudeEvent, describeCopilotEvent, detectLimit, finalResultLine, runCli } from '../ai-phase0/providers.mjs';

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

export async function runProposal({ provider, model, aBytes, bBytes, template, keepApiKey = false, timeoutMs = 300_000, onStage = () => {}, onEvent = () => {}, signal, maxAttempts = 2 }) {
  const fake = process.env.AI_HELPER_FAKE === '1' && provider === 'fake';
  if (!fake && !PROVIDERS[provider]) throw Object.assign(new Error('Proveedor desconocido.'), { code: 'bad_provider' });
  const work = await mkdtemp(path.join(os.tmpdir(), 'pdfann-ia-'));
  try {
    onStage('reading');
    await writeFile(path.join(work, 'A.pdf'), aBytes);
    await writeFile(path.join(work, 'B.pdf'), bBytes);
    const A = await readPdf(path.join(work, 'A.pdf'), { prefix: 'A', outDir: work, stamp: !fake });
    const B = await readPdf(path.join(work, 'B.pdf'), { prefix: 'B', outDir: work, stamp: !fake });
    const codes = fake ? null : { ...A.codes, ...B.codes };
    const countByPage = (texts, n) => Array.from({ length: n }, (_, i) => texts.filter((t) => t.page === i + 1).length);
    const entries = flattenFields(template);
    if (!entries.length) return { rows: [], seconds: 0, warnings: [], pagesA: A.pages.length, pagesB: B.pages.length, details: null };
    await writeFile(path.join(work, 'textsA.json'), JSON.stringify(A.texts, null, 1));
    await writeFile(path.join(work, 'textsB.json'), JSON.stringify(B.texts, null, 1));
    await writeFile(
      path.join(work, 'fields.json'),
      JSON.stringify(entries.map((e) => ({ id: e.id, page: e.page, type: e.field.type ?? 'text', label: e.field.mapField, x: e.field.x, y: e.field.y, nearby: nearbyTexts(A.texts, e.page, e.field) })), null, 1),
    );
    // Lo que se envía: solo nombres y tamaños, nunca el contenido.
    const files = [];
    for (const name of await readdir(work)) files.push({ name, bytes: (await stat(path.join(work, name))).size });
    const sent = {
      files: files.filter((f) => !/^prompt\.md$/.test(f.name)),
      fields: entries.length,
      pagesA: A.pages.length,
      pagesB: B.pages.length,
      textsA: A.texts.length,
      textsB: B.texts.length,
      textsByPageA: countByPage(A.texts, A.pages.length),
      textsByPageB: countByPage(B.texts, B.pages.length),
      imageBytes: files.filter((f) => f.name.endsWith('.png')).reduce((n, f) => n + f.bytes, 0),
    };
    const details = { provider, model: model ?? null, sent, attempts: [], usageSource: fake ? 'none' : 'measured' };
    onEvent({ type: 'sent', sent });
    const known = new Set(entries.map((e) => e.id));
    let proposals = [];
    let warnings = [];
    let seconds = 0;
    let retryNote = '';
    if (fake) {
      const parsed = validateProposals(fakeAnswer(entries, A, B), known);
      proposals = parsed.proposals;
    } else {
      const attached = provider === 'copilot' && process.env.COPILOT_ATTACH_IMAGES !== '0';
      // Prueba previa y barata (solo Copilot): dos imágenes adjuntas y nada más. Si no lee sus códigos, se corta aquí
      // en vez de gastar cientos de miles de tokens en la ejecución completa.
      if (attached && codes && process.env.COPILOT_PROBE !== '0') {
        const names = [Object.keys(codes).find((k) => k.startsWith('A-')), Object.keys(codes).find((k) => k.startsWith('B-'))].filter(Boolean);
        if (names.length) {
          onStage('asking', 1);
          const probe = await runCli(provider, work, {
            model,
            keepApiKey,
            timeoutMs: Math.min(timeoutMs ?? 120000, 120000),
            signal,
            quiet: true,
            attachments: names.map((n) => `${n}.png`),
            stream: true,
            instruction: `Mira las imágenes adjuntas (${names.join(', ')}). Cada una lleva un código de 4 caracteres en un recuadro, abajo a la derecha. No uses herramientas. Responde SOLO con un objeto JSON {"images":{${names.map((n) => `"${n}":"CODIGO"`).join(',')}}}.`,
          });
          seconds += probe.seconds ?? 0;
          if (probe.aborted) throw Object.assign(new Error('Cancelado.'), { code: 'aborted' });
          if (probe.ok) {
            const ex = PROVIDERS[provider].extract(probe.stdout);
            const subset = Object.fromEntries(names.map((n) => [n, codes[n]]));
            let ok = false;
            let data = null;
            try {
              data = parseJsonFromText(ex.text, (v) => !!v && typeof v === 'object');
            } catch {
              /* respuesta no JSON: cuenta como no leída */
            }
            const d = describeImageCodes(data, subset);
            ok = d.missing.length === 0;
            details.probe = { ok, seconds: probe.seconds, images: names.length, tokens: ex.meta.usage ? Object.values(ex.meta.usage).reduce((n, x) => n + (Number(x) || 0), 0) : null, aiCredits: ex.meta.aiCredits ?? null };
            if (!ok) throw Object.assign(new Error(`Copilot no lee las imágenes adjuntas (prueba previa con ${names.join(' y ')}): ${d.given.map((g) => `${g.name} dio «${g.got}», esperado «${g.expected}»`).join('; ')}. No se ha lanzado la ejecución completa para no gastar créditos.`), { code: 'images_not_read', details });
          }
        }
      }
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        onStage('asking', attempt);
        const promptText = buildPrompt({ pagesA: A.pages.length, pagesB: B.pages.length, sizeA: sizes(A), sizeB: sizes(B), retryNote, codes, attached });
        await writeFile(path.join(work, 'prompt.md'), promptText);
        const usageById = new Map();
        const attemptInfo = { n: attempt, promptChars: promptText.length, steps: [], usage: null, retry: !!retryNote };
        details.attempts.push(attemptInfo);
        const run = await runCli(provider, work, {
          model,
          keepApiKey,
          timeoutMs,
          signal,
          quiet: true,
          attachments: files.filter((f) => f.name.endsWith('.png')).map((f) => f.name),
          stream: true,
          onLine:
            provider === 'copilot'
              ? (l) => {
                  const ev = describeCopilotEvent(l);
                  if (!ev) return;
                  for (const step of ev.steps) attemptInfo.steps.push(step);
                  if (ev.cumulative) {
                    attemptInfo.usage = ev.usage;
                    attemptInfo.aiCredits = ev.cumulative.aiCredits;
                    attemptInfo.premiumRequests = ev.cumulative.premiumRequests;
                  }
                  onEvent({ type: 'step', attempt, steps: ev.steps, usage: attemptInfo.usage });
                }
              : (l) => {
                const ev = describeClaudeEvent(l);
                if (!ev) return;
                for (const step of ev.steps) attemptInfo.steps.push(step);
                if (ev.usage) {
                  // Claude repite el mismo mensaje (mismo id) por cada bloque de contenido: se cuenta una vez.
                  usageById.set(ev.id ?? `anon${usageById.size}`, ev.usage);
                  const all = [...usageById.values()];
                  attemptInfo.usage = { input: all.reduce((n, x) => n + x.input, 0), output: all.reduce((n, x) => n + x.output, 0), cacheRead: all.reduce((n, x) => n + x.cacheRead, 0), cacheWrite: all.reduce((n, x) => n + x.cacheWrite, 0) };
                }
                onEvent({ type: 'step', attempt, steps: ev.steps, usage: attemptInfo.usage });
              },
        });
        seconds += run.seconds;
        attemptInfo.seconds = run.seconds;
        if (run.aborted) throw Object.assign(new Error('Cancelado.'), { code: 'aborted' });
        const limit = detectLimit(finalResultLine(run.stdout), run.stderr);
        if (limit) throw Object.assign(new Error(limit), { code: 'limit', reset: limit.match(/renueva a las (.+?)\./)?.[1] ?? null });
        if (!run.ok) throw Object.assign(new Error(`El CLI terminó con código ${run.code}: ${tail(run.stderr || run.stdout)}`), { code: run.code === -1 ? 'missing' : run.code === -2 ? 'timeout' : 'cli_error', details });
        const ex = PROVIDERS[provider].extract(run.stdout);
        // Uso real que da el CLI al terminar (Claude). Copilot no lo expone en -p: no se inventa nada.
        const u = ex.meta.usage;
        if (u) attemptInfo.usage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
        if (typeof ex.meta.aiCredits === 'number') attemptInfo.aiCredits = ex.meta.aiCredits;
        if (typeof ex.meta.premiumRequests === 'number') attemptInfo.premiumRequests = ex.meta.premiumRequests;
        attemptInfo.costUsd = typeof ex.meta.costUsd === 'number' ? ex.meta.costUsd : null;
        attemptInfo.turns = ex.meta.turns ?? null;
        attemptInfo.permissionDenials = ex.meta.permissionDenials ?? 0;
        attemptInfo.responseChars = ex.text.length;
        if (ex.meta.isError) throw Object.assign(new Error(`El CLI devolvió un error: ${tail(ex.text)}`), { code: 'cli_error', details });
        const data = parseJsonFromText(ex.text, looksLikeProposals);
        if (codes) {
          const { missing, given, returned } = describeImageCodes(data, codes);
          attemptInfo.imagesMissing = missing.length;
          if (missing.length) {
            // La IA no ha leído las imágenes: no se aprovecha una respuesta hecha solo con los textos.
            retryNote = 'no has devuelto los códigos de las imágenes. Abre TODAS las imágenes, copia el código de cada una en "images" y vuelve a responder con el objeto JSON pedido.';
            if (attempt === maxAttempts || provider === 'copilot') throw Object.assign(new Error(`${missing.length} de ${Object.keys(codes).length} imágenes sin leer (${missing.join(', ')}). La IA devolvió ${returned} códigos; ejemplos: ${given.slice(0, 3).map((g) => `${g.name} dio «${g.got}», esperado «${g.expected}»`).join('; ')}.`), { code: 'images_not_read', details });
            continue;
          }
        }
        const parsed = validateProposals(data, known);
        proposals = parsed.proposals;
        warnings = parsed.errors;
        attemptInfo.parsed = proposals.length;
        attemptInfo.warnings = warnings.length;
        if (proposals.length && warnings.length < known.size / 2) break;
        retryNote = 'tu respuesta anterior no era una lista JSON válida con un objeto por campo. Devuelve únicamente esa lista.';
      }
    }
    onStage('resolving');
    const counts = {};
    const rows = entries.map((e) => {
      const p = proposals.find((x) => x.id === e.id);
      if (!p) return (counts.sin_respuesta = (counts.sin_respuesta ?? 0) + 1), { id: e.id, page: e.page, index: e.index, ok: false, why: 'sin_respuesta', reason: '' };
      const r = resolveProposal(p, e, A.texts, B.texts);
      if (!r.ok) counts[r.why] = (counts[r.why] ?? 0) + 1;
      return r.ok
        ? { id: e.id, page: e.page, index: e.index, ok: true, newPage: r.page, x: r.x, y: r.y, confidence: p.confidence, reason: p.reason, anchorA: p.anchorA, anchorB: p.anchorB }
        : { id: e.id, page: e.page, index: e.index, ok: false, why: r.why, reason: p.reason };
    });
    details.seconds = seconds;
    details.placed = rows.filter((r) => r.ok).length;
    details.notPlaced = counts;
    details.diagnosis = diagnose({ placed: details.placed, total: rows.length, sent, counts, attempts: details.attempts });
    onEvent({ type: 'resolved', placed: details.placed, total: rows.length, diagnosis: details.diagnosis });
    return { rows, seconds, warnings, details, pagesA: A.pages.length, pagesB: B.pages.length };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Por qué no se colocó nada (o casi): una causa probable en código para que el modal la explique. */
export function diagnose({ placed, total, sent, counts, attempts }) {
  if (placed === total) return null;
  if (!sent.textsA) return 'no_text_a';
  if (!sent.textsB) return 'no_text_b';
  if (placed === 0 && attempts.some((a) => (a.permissionDenials ?? 0) > 0)) return 'permission_denied';
  if (counts.sin_respuesta === total) return 'no_valid_answer';
  if (placed === 0 && (counts.ancla_A_no_encontrada ?? 0) + (counts.ancla_B_no_encontrada ?? 0) >= total / 2) return 'anchors_not_found';
  if (placed === 0) return 'ai_found_nothing';
  return 'partial';
}
export { findText };
