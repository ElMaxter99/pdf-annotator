// Orquestación del traslado por partes (sin E/S): pasada 1 por página útil de A, pasada 2 con los campos sin colocar,
// reintentos iguales para todos los proveedores y tope de peticiones por PDF. Lanzar el CLI (`call`) y convertir una
// propuesta en coordenadas (`resolve`) se inyectan, así se prueba sin CLI ni PDF. La respuesta de la IA solo se valida.
import { describeImageCodes, failureNote, looksLikeProposals, mergeOutcome, parseJsonFromText, planRetry, validateProposals, CANDIDATE_PAGES } from './lib.mjs';

/** Tope de llamadas al CLI por PDF, reintentos incluidos. Al llegar se devuelve lo colocado (`cap_reached`). */
export const MAX_REQUESTS_PER_PDF = 8;
/** Errores de una petición que, con campos ya colocados, dejan el PDF en parcial en vez de fallar. `images_not_read`
 * solo sale de la primera petición: lo colocado entonces es lo del pase sin IA (`alreadyPlaced`). */
export const PARTIAL_CODES = new Set(['timeout', 'cli_error', 'images_not_read']);

export const imageNames = (request) => [`A-p${request.pageA}`, ...request.pagesB.map((p) => `B-p${p}`)];

/** Petición de la pasada 1 de un grupo del plan. */
export const firstPassRequest = (item) => ({ pass: 1, group: item.group, pageA: item.pageA, pagesB: [...item.candidatesB], entries: item.fields, notes: [], fresh: true });

const pick = (codes, names) => Object.fromEntries(names.filter((n) => n in codes).map((n) => [n, codes[n]]));

/**
 * @param {object} o
 * @param {ReturnType<import('./lib.mjs').buildPlan>} o.plan
 * @param {(request: object, info: object, retry: null | {kind: 'images'|'json', missing?: string[]}) => Promise<string>} o.call
 *   Lanza una llamada y devuelve el texto de la respuesta; rellena `info` (uso, pasos…) y lanza errores con `code`.
 * @param {(proposal: object, entry: object) => {ok: boolean}} o.resolve
 * @param {Record<string, string> | null} [o.codes] Código de cada imagen (`A-p1`…); null = sin prueba de lectura.
 * @param {number} [o.alreadyPlaced] Campos ya colocados sin IA (no van en el plan).
 */
export async function runPasses({ plan, call, resolve, codes = null, minMatch, maxAttempts = 2, maxRequests = MAX_REQUESTS_PER_PDF, chunk = CANDIDATE_PAGES, onStage = () => {}, alreadyPlaced = 0 }) {
  const outcomes = new Map();
  const attempts = [];
  const sentB = new Map();
  /** Páginas de B con las que se ha preguntado por cada campo (para saber si «no existe en B» es definitivo). */
  const askedB = new Map();
  const state = { requests: 0, capReached: false, aborted: null, abortError: null };
  // `alreadyPlaced` = campos colocados antes sin IA: cuentan para devolver parcial ante un timeout, cli_error o images_not_read.
  const placed = () => alreadyPlaced + [...outcomes.values()].filter((o) => o.resolved.ok).length;

  async function ask(request) {
    const images = imageNames(request);
    const subset = codes ? pick(codes, images) : null;
    const known = new Set(request.entries.map((e) => e.id));
    const probe = state.requests === 0;
    let retry = null;
    let best = null;
    let unread = null;
    let called = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (state.requests >= maxRequests) {
        state.capReached = true;
        break;
      }
      const n = ++state.requests;
      onStage('asking', n);
      const info = { n, pass: request.pass, group: request.group, images, fields: request.entries.length, attempt, retry: !!retry, steps: [], usage: null };
      attempts.push(info);
      called = true;
      const text = await call(request, info, retry);
      const data = parseJsonFromText(text, looksLikeProposals);
      if (!data) {
        info.parsed = 0;
        retry = { kind: 'json' };
        continue;
      }
      if (subset && Object.keys(subset).length) {
        const d = describeImageCodes(data, subset, { minMatch });
        info.imagesMissing = d.missing.length;
        if (d.missing.length) {
          // Sin los códigos no se aprovecha la respuesta: podría estar hecha solo con los textos.
          unread = d;
          retry = { kind: 'images', missing: d.missing };
          continue;
        }
      }
      const parsed = validateProposals(data, known);
      info.parsed = parsed.proposals.length;
      info.warnings = parsed.errors.length;
      best = parsed;
      if (parsed.proposals.length && parsed.errors.length < known.size / 2) break;
      retry = { kind: 'json' };
    }
    if (!best && unread && probe) {
      // La primera petición hace de prueba: si no lee las imágenes no se gastan más peticiones en este PDF.
      throw Object.assign(
        new Error(`${unread.missing.length} de ${images.length} imágenes sin leer (${unread.missing.join(', ')}). La IA devolvió ${unread.returned} códigos; ejemplos: ${unread.given.slice(0, 3).map((g) => `${g.name} dio «${g.got}», esperado «${g.expected}»`).join('; ')}.`),
        { code: 'images_not_read', request, unread },
      );
    }
    for (const p of best?.proposals ?? []) {
      const entry = request.entries.find((e) => e.id === p.id);
      if (entry) outcomes.set(p.id, mergeOutcome(outcomes.get(p.id), { proposal: p, resolved: resolve(p, entry), pass: request.pass, group: request.group }));
    }
    if (called) {
      for (const e of request.entries) {
        const asked = askedB.get(e.id) ?? new Set();
        for (const p of request.pagesB) asked.add(p);
        askedB.set(e.id, asked);
      }
    }
    const sent = sentB.get(request.group) ?? new Set();
    for (const p of request.pagesB) sent.add(p);
    sentB.set(request.group, sent);
  }

  async function safeAsk(request) {
    try {
      await ask(request);
      return true;
    } catch (e) {
      if (PARTIAL_CODES.has(e?.code) && placed() > 0) {
        state.aborted = e.code;
        state.abortError = e;
        return false;
      }
      throw e;
    }
  }

  const stopped = () => state.capReached || state.aborted;
  for (const item of plan) {
    if (stopped()) break;
    await safeAsk(firstPassRequest(item));
  }
  for (const item of plan) {
    if (stopped()) break;
    const pending = item.fields.filter((e) => !outcomes.get(e.id)?.resolved.ok);
    if (!pending.length || !sentB.has(item.group)) continue;
    const { pagesB, fresh } = planRetry({ candidatesB: item.candidatesB, rankB: item.rankB, sentB: sentB.get(item.group), chunk });
    await safeAsk({ pass: 2, group: item.group, pageA: item.pageA, pagesB, entries: pending, notes: pending.map((e) => failureNote(e, outcomes.get(e.id))), fresh });
  }
  // `abortError` = el error que cortó el PDF en parcial (su mensaje y, con images_not_read, `request`/`unread`).
  return { outcomes, attempts, requests: state.requests, capReached: state.capReached, aborted: state.aborted, abortError: state.abortError, sentB, askedB };
}
