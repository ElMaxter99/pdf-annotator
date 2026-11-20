// Propuesta de coordenadas A→B con IA para la app: recibe los PDF y la plantilla de A en memoria y devuelve una fila
// por campo. Va por partes (docs/PLAN-IA-ROBUSTA.md): una petición por página de A con campos y sus candidatas de B,
// una re-pregunta para lo que falte, reintentos iguales con cualquier proveedor y un tope de peticiones por PDF.
// Antes, un pase sin IA (text-first.mjs) coloca los campos cuya etiqueta está idéntica en B y tiene hueco dibujado.
// Nunca evalúa la salida de la IA: solo la valida y la convierte.
import { copyFile, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NEARBY_TEXTS, buildPlan, findText, flattenFields, missingWhy, nearbyTexts, norm, resolveProposal } from '../ai-phase0/lib.mjs';
import { placeByText, textFirstEnabled } from '../ai-phase0/text-first.mjs';
import { MAX_REQUESTS_PER_PDF, firstPassRequest, imageNames, runPasses } from '../ai-phase0/passes.mjs';
import { readPdf } from '../ai-phase0/pdf.mjs';
import { PROVIDERS, describeClaudeEvent, describeCopilotEvent, detectLimit, finalResultLine, runCli } from '../ai-phase0/providers.mjs';
import { requestPrompt } from './prompts.mjs';

export { MAX_REQUESTS_PER_PDF };
const tail = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(-300) || '(sin salida)';
const countByPage = (texts, n) => Array.from({ length: n }, (_, i) => texts.filter((t) => t.page === i + 1).length);

/**
 * Proveedor simulado (solo con AI_HELPER_FAKE=1): ancla = texto más cercano de A, mismo texto en las páginas de B de la
 * petición. Si ese texto no está en ninguna página de B (`allTextsB`), responde que no existe (`absent: true`).
 */
export function fakeAnswer(entries, textsA, textsB, allTextsB = textsB) {
  return entries.map((e) => {
    const near = nearbyTexts(textsA, e.page, e.field, 1)[0];
    if (!near) return { id: e.id, found: false, reason: 'sin texto cercano' };
    const b = textsB.filter((t) => t.text === near.text).sort((x, y) => x.page - y.page)[0];
    if (!b) {
      const anywhere = allTextsB.some((t) => norm(t.text) === norm(near.text));
      return anywhere ? { id: e.id, found: false, reason: 'no está en estas páginas de B' } : { id: e.id, found: false, absent: true, reason: 'el texto ya no existe en B' };
    }
    return { id: e.id, found: true, page: b.page, anchorA: near.text, anchorB: near.text, dx: 0, dy: 0, confidence: 0.9, reason: `Ancla «${near.text}»` };
  });
}

/** Contenido de los JSON de una petición: solo los textos de sus páginas y solo sus campos. */
function requestFiles(request, A, B) {
  const pagesB = new Set(request.pagesB);
  const textsA = A.texts.filter((t) => t.page === request.pageA);
  const textsB = B.texts.filter((t) => pagesB.has(t.page));
  const fields = request.entries.map((e) => ({ id: e.id, page: e.page, type: e.field.type ?? 'text', label: e.field.mapField, x: e.field.x, y: e.field.y, nearby: nearbyTexts(A.texts, e.page, e.field, NEARBY_TEXTS) }));
  return { textsA, textsB, json: { 'textsA.json': JSON.stringify(textsA, null, 1), 'textsB.json': JSON.stringify(textsB, null, 1), 'fields.json': JSON.stringify(fields, null, 1) } };
}

/** Lo enviado (solo nombres, tamaños y recuentos; nunca el contenido): imágenes sin repetir y JSON sumados por petición. */
function createSentLog({ A, B, fields, pngBytes }) {
  const images = new Set();
  const json = new Map();
  const textsA = new Set();
  const textsB = new Set();
  const pagesA = new Set();
  const pagesB = new Set();
  return {
    add(request, files) {
      for (const n of imageNames(request)) images.add(n);
      for (const [name, text] of Object.entries(files.json)) json.set(name, (json.get(name) ?? 0) + Buffer.byteLength(text));
      pagesA.add(request.pageA);
      for (const p of request.pagesB) pagesB.add(p);
      for (const t of files.textsA) textsA.add(t);
      for (const t of files.textsB) textsB.add(t);
    },
    snapshot() {
      const pngs = [...images].sort().map((n) => ({ name: `${n}.png`, bytes: pngBytes.get(n) ?? 0 }));
      return {
        files: [...pngs, ...[...json.entries()].map(([name, bytes]) => ({ name, bytes }))],
        fields,
        pagesA: pagesA.size,
        pagesB: pagesB.size,
        textsA: textsA.size,
        textsB: textsB.size,
        textsByPageA: countByPage(A.texts, A.pages.length),
        textsByPageB: countByPage(B.texts, B.pages.length),
        imageBytes: pngs.reduce((n, f) => n + f.bytes, 0),
      };
    },
  };
}

export async function runProposal({ provider, model, aBytes, bBytes, template, keepApiKey = false, timeoutMs = 300_000, onStage = () => {}, onEvent = () => {}, signal, maxAttempts = 2, maxRequests = MAX_REQUESTS_PER_PDF, runCliImpl = runCli }) {
  const fake = process.env.AI_HELPER_FAKE === '1' && provider === 'fake';
  if (!fake && !PROVIDERS[provider]) throw Object.assign(new Error('Proveedor desconocido.'), { code: 'bad_provider' });
  const work = await mkdtemp(path.join(os.tmpdir(), 'pdfann-ia-'));
  try {
    onStage('reading');
    const pagesDir = path.join(work, 'pages');
    await mkdir(pagesDir);
    await writeFile(path.join(work, 'A.pdf'), aBytes);
    await writeFile(path.join(work, 'B.pdf'), bBytes);
    const A = await readPdf(path.join(work, 'A.pdf'), { prefix: 'A', outDir: pagesDir, stamp: !fake });
    const B = await readPdf(path.join(work, 'B.pdf'), { prefix: 'B', outDir: pagesDir, stamp: !fake });
    const codes = fake ? null : { ...A.codes, ...B.codes };
    const entries = flattenFields(template);
    if (!entries.length) return { rows: [], seconds: 0, warnings: [], pagesA: A.pages.length, pagesB: B.pages.length, details: null };
    const pngBytes = new Map();
    for (const [prefix, doc] of [['A', A], ['B', B]]) for (const p of doc.pages) pngBytes.set(`${prefix}-p${p.num}`, (await stat(path.join(pagesDir, `${prefix}-p${p.num}.png`))).size);

    // Pase sin IA: lo colocado así no se envía. AI_HELPER_TEXT_FIRST=0 lo desactiva (para medir la IA sola).
    const byText = textFirstEnabled() ? placeByText(entries, { textsA: A.texts, textsB: B.texts, slotsB: B.slots ?? [] }) : { placed: new Map(), rest: entries };
    const pageMap = template?.pageMap;
    const plan = buildPlan({ entries: byText.rest, pagesA: A.pages.length, textsA: A.texts, pagesB: B.pages.length, textsB: B.texts, pageMap });
    const planned = createSentLog({ A, B, fields: entries.length, pngBytes });
    for (const item of plan) planned.add(firstPassRequest(item), requestFiles(firstPassRequest(item), A, B));
    const sent = planned.snapshot();
    const actual = createSentLog({ A, B, fields: entries.length, pngBytes });
    const details = {
      provider,
      model: model ?? null,
      sent,
      attempts: [],
      requests: 0,
      plan: plan.map((p) => ({ group: p.group, candidatesB: p.candidatesB.map((n) => `B-p${n}`), fields: p.fields.length })),
      usageSource: fake ? 'none' : 'measured',
    };
    onEvent({ type: 'sent', sent });

    const attached = provider === 'copilot' && process.env.COPILOT_ATTACH_IMAGES !== '0';
    const ctx = { pagesA: A.pages, pagesB: B.pages, pageMap, attached };
    const folders = new Map();
    let seconds = 0;
    let folderSeq = 0;
    /** Carpeta de la petición (una por petición, reutilizada en sus reintentos): solo sus imágenes y sus JSON. */
    async function folderFor(request) {
      if (folders.has(request)) return folders.get(request);
      const dir = path.join(work, `r${++folderSeq}`);
      await mkdir(dir);
      const files = requestFiles(request, A, B);
      for (const [name, text] of Object.entries(files.json)) await writeFile(path.join(dir, name), text);
      for (const n of imageNames(request)) await copyFile(path.join(pagesDir, `${n}.png`), path.join(dir, `${n}.png`));
      actual.add(request, files);
      const entry = { dir, files };
      folders.set(request, entry);
      return entry;
    }

    const call = async (request, info, retry) => {
      const { dir, files } = await folderFor(request);
      const promptText = requestPrompt(request, ctx, retry);
      await writeFile(path.join(dir, 'prompt.md'), promptText);
      info.promptChars = promptText.length;
      details.attempts.push(info);
      details.requests = info.n;
      if (fake) {
        info.seconds = 0;
        return JSON.stringify({ fields: fakeAnswer(request.entries, files.textsA, files.textsB, B.texts) });
      }
      const usageById = new Map();
      const run = await runCliImpl(provider, dir, {
        model,
        keepApiKey,
        timeoutMs,
        signal,
        quiet: true,
        attachments: imageNames(request).map((n) => path.join(dir, `${n}.png`)),
        stream: true,
        onLine:
          provider === 'copilot'
            ? (l) => {
                const ev = describeCopilotEvent(l);
                if (!ev) return;
                for (const step of ev.steps) info.steps.push(step);
                if (ev.cumulative) {
                  info.usage = ev.usage;
                  info.aiCredits = ev.cumulative.aiCredits;
                  info.premiumRequests = ev.cumulative.premiumRequests;
                }
                onEvent({ type: 'step', attempt: info.n, steps: ev.steps, usage: info.usage });
              }
            : (l) => {
                const ev = describeClaudeEvent(l);
                if (!ev) return;
                for (const step of ev.steps) info.steps.push(step);
                if (ev.usage) {
                  // Claude repite el mismo mensaje (mismo id) por cada bloque de contenido: se cuenta una vez.
                  usageById.set(ev.id ?? `anon${usageById.size}`, ev.usage);
                  const all = [...usageById.values()];
                  info.usage = { input: all.reduce((n, x) => n + x.input, 0), output: all.reduce((n, x) => n + x.output, 0), cacheRead: all.reduce((n, x) => n + x.cacheRead, 0), cacheWrite: all.reduce((n, x) => n + x.cacheWrite, 0) };
                }
                onEvent({ type: 'step', attempt: info.n, steps: ev.steps, usage: info.usage });
              },
      });
      seconds += run.seconds ?? 0;
      info.seconds = run.seconds ?? 0;
      if (run.aborted) throw Object.assign(new Error('Cancelado.'), { code: 'aborted' });
      const limit = detectLimit(finalResultLine(run.stdout), run.stderr);
      if (limit) throw Object.assign(new Error(limit), { code: 'limit', reset: limit.match(/renueva a las (.+?)\./)?.[1] ?? null });
      if (!run.ok) throw Object.assign(new Error(`El CLI terminó con código ${run.code}: ${tail(run.stderr || run.stdout)}`), { code: run.code === -1 ? 'missing' : run.code === -2 ? 'timeout' : 'cli_error' });
      const ex = PROVIDERS[provider].extract(run.stdout);
      // Uso real que da el CLI al terminar (Claude). Copilot no lo expone en -p: no se inventa nada.
      const u = ex.meta.usage;
      if (u) info.usage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
      if (typeof ex.meta.aiCredits === 'number') info.aiCredits = ex.meta.aiCredits;
      if (typeof ex.meta.premiumRequests === 'number') info.premiumRequests = ex.meta.premiumRequests;
      info.costUsd = typeof ex.meta.costUsd === 'number' ? ex.meta.costUsd : null;
      info.turns = ex.meta.turns ?? null;
      info.permissionDenials = ex.meta.permissionDenials ?? 0;
      info.responseChars = ex.text.length;
      if (ex.meta.isError) throw Object.assign(new Error(`El CLI devolvió un error: ${tail(ex.text)}`), { code: 'cli_error' });
      return ex.text;
    };

    const finish = () => {
      details.seconds = seconds;
      details.sent = actual.snapshot();
    };
    let result;
    try {
      result = await runPasses({
        plan,
        call,
        resolve: (p, e) => resolveProposal(p, e, A.texts, B.texts, { slots: B.slots ?? [] }),
        codes,
        // Copilot reescala las imágenes y a veces pone «?»: basta con 2 de 4 caracteres (por azar, ~1 entre 200).
        minMatch: provider === 'copilot' ? 2 : undefined,
        maxAttempts,
        maxRequests,
        onStage,
        alreadyPlaced: byText.placed.size,
      });
    } catch (e) {
      finish();
      if (e?.code === 'images_not_read' && provider === 'copilot' && e.request) e.message += await debugHint(e.request, pagesDir, codes);
      if (e?.code && e.code !== 'limit' && e.code !== 'aborted') e.details = details;
      throw e;
    }

    onStage('resolving');
    const counts = {};
    const rows = entries.map((e) => {
      const text = byText.placed.get(e.id);
      const o = text ?? result.outcomes.get(e.id);
      if (!o) return (counts.sin_respuesta = (counts.sin_respuesta ?? 0) + 1), { id: e.id, page: e.page, index: e.index, ok: false, why: 'sin_respuesta', reason: '' };
      const { proposal: p, resolved: r } = o;
      if (!r.ok) {
        const why = missingWhy(o, result.askedB?.get(e.id), B.pages.length);
        counts[why] = (counts[why] ?? 0) + 1;
        return { id: e.id, page: e.page, index: e.index, ok: false, why, reason: p.reason };
      }
      const confidence = Math.min(p.confidence, r.maxConfidence ?? 1);
      return { id: e.id, page: e.page, index: e.index, ok: true, newPage: r.page, x: r.x, y: r.y, confidence, reason: p.reason, anchorA: p.anchorA ?? '', anchorB: p.anchorB, source: text ? 'text' : 'ai', snapped: !!r.snapped };
    });
    finish();
    details.requests = result.requests;
    details.placed = rows.filter((r) => r.ok).length;
    details.placedWithoutAi = byText.placed.size;
    details.notPlaced = counts;
    if (result.aborted) details.aborted = result.aborted;
    // La primera petición no leyó las imágenes pero el pase sin IA ya había colocado campos: parcial con lo colocado.
    let abortNote = null;
    if (result.aborted === 'images_not_read') {
      abortNote = `Lectura de imágenes fallida en la primera petición: ${result.abortError?.message ?? ''}`.trim();
      if (provider === 'copilot' && result.abortError?.request) abortNote += await debugHint(result.abortError.request, pagesDir, codes);
    }
    details.diagnosis = diagnose({ placed: details.placed, total: rows.length, sent: details.sent, counts, attempts: details.attempts, capReached: result.capReached });
    onEvent({ type: 'resolved', placed: details.placed, total: rows.length, diagnosis: details.diagnosis });
    const warnings = result.attempts.flatMap((a) => (a.warnings ? [`${a.group}: ${a.warnings} entradas no válidas en la llamada ${a.n}.`] : []));
    if (abortNote) warnings.unshift(abortNote);
    return { rows, seconds, warnings, details, pagesA: A.pages.length, pagesB: B.pages.length };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/** Copia local de las imágenes de la petición para repetir la prueba a mano con el mismo PNG (no sale del ordenador). */
async function debugHint(request, pagesDir, codes) {
  try {
    const debugDir = path.join(os.tmpdir(), 'pdf-annotator-ai-debug');
    await mkdir(debugDir, { recursive: true });
    const names = imageNames(request);
    for (const n of names) await copyFile(path.join(pagesDir, `${n}.png`), path.join(debugDir, `${n}.png`));
    return ` Para repetirlo a mano: copilot -p "Dime el código de 4 caracteres de la franja inferior de la imagen" --attachment "${path.join(debugDir, `${names[0]}.png`)}" (códigos esperados: ${names.map((n) => `${n}=${codes?.[n]}`).join(', ')}).`;
  } catch {
    return '';
  }
}

/** Por qué no se colocó nada (o casi): una causa probable en código para que el modal la explique. */
export function diagnose({ placed, total, sent, counts, attempts, capReached = false }) {
  if (placed === total) return null;
  if (!sent.textsA) return 'no_text_a';
  if (!sent.textsB) return 'no_text_b';
  if (placed === 0 && attempts.some((a) => (a.permissionDenials ?? 0) > 0)) return 'permission_denied';
  if (capReached) return 'cap_reached';
  if (counts.sin_respuesta === total) return 'no_valid_answer';
  if (placed === 0 && (counts.ancla_A_no_encontrada ?? 0) + (counts.ancla_B_no_encontrada ?? 0) >= total / 2) return 'anchors_not_found';
  if (placed === 0) return 'ai_found_nothing';
  return 'partial';
}
export { findText };
