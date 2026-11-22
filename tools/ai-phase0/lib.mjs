// Lógica pura de la fase 0 (sin E/S): preparar campos, leer la respuesta de la IA y convertirla en coordenadas.
import { nearestSlot } from './slots.mjs';
import { FALLBACK_CONFIDENCE, SIDES, defaultSide, fallbackXY, slotKind, slotOnSide, snapToSlot, toFieldXY } from './place.mjs';

/**
 * Texto comparable: sin acentos ni mayúsculas, ligaduras separadas («ﬁ», «ĳ»), sin viñeta inicial
 * («• », «- ») y sin espacios alrededor de signos («apellidos / Razón» = «apellidos/Razón»).
 */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^[\s•·▪◦*–—-]+/u, '')
    .replace(/\s*([/:;,.()–—-])\s*/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Aplana `{ pages: [{ num, fields }] }` a una lista con id estable `p<página>-f<posición>`. */
export function flattenFields(json) {
  const out = [];
  for (const page of json?.pages ?? []) {
    (page.fields ?? []).forEach((field, i) => {
      out.push({ id: `p${page.num}-f${i + 1}`, page: page.num, index: i, field });
    });
  }
  return out;
}

const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

/** Textos de la misma página más cercanos al campo, con su desplazamiento respecto al texto. */
export function nearbyTexts(texts, page, field, limit = 6) {
  return texts
    .filter((t) => t.page === page && norm(t.text).length > 0)
    .map((t) => ({ text: t.text, x: round(t.x), y: round(t.y), dx: round(field.x - t.x), dy: round(field.y - t.y), d: dist(field.x, field.y, t.x, t.y) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, limit)
    .map(({ d, ...rest }) => rest);
}

export const round = (n) => Math.round(n * 10) / 10;

/** Primer objeto/array JSON equilibrado de un texto (admite ```json ... ```). */
export function parseJsonFromText(text, accept = () => true) {
  const src = String(text ?? '');
  const starts = [];
  for (let i = 0; i < src.length; i++) if (src[i] === '[' || src[i] === '{') starts.push(i);
  for (const start of starts) {
    const open = src[start];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === open) depth++;
      else if (c === close && --depth === 0) {
        try {
          const value = JSON.parse(src.slice(start, i + 1));
          if (accept(value)) return value;
        } catch {
          // no era JSON: se prueba con el siguiente corchete
        }
        break;
      }
    }
  }
  return null;
}

/** ¿Parece la lista de propuestas (y no un `[1]` o un `{}` cualquiera del texto de la IA)? */
export const looksLikeProposals = (v) =>
  (Array.isArray(v) && v.some((x) => x && typeof x === 'object' && typeof x.id === 'string')) || (!!v && Array.isArray(v.fields));

/** ¿Ha devuelto la IA el código de cada imagen? Devuelve los nombres que faltan o no coinciden. */
export function missingImageCodes(data, codes, opts) {
  return describeImageCodes(data, codes, opts).missing;
}

/** Como `missingImageCodes`, y además lo que devolvió la IA por cada imagen que falla (para diagnosticar; los códigos son aleatorios, no contenido del PDF). */
const CONFUSABLE = { S: '5', B: '8', Z: '2', G: '6', O: '0', D: '0', Q: '0', I: '1', L: '1' };

export function describeImageCodes(data, codes, { minMatch } = {}) {
  const raw = data && typeof data === 'object' && !Array.isArray(data) && data.images && typeof data.images === 'object' ? data.images : {};
  // Admite claves como «A-p1.png» y un carácter mal transcrito (el modelo pequeño confunde letras parecidas).
  const got = {};
  for (const [k, v] of Object.entries(raw)) got[String(k).replace(/\.png$/i, '').trim()] = String(v ?? '').trim().toUpperCase();
  // Por defecto, mismo largo y como mucho un carácter distinto. Con `minMatch` (Copilot, que reescala las imágenes y a veces
  // pone «?» en lo que no distingue) basta con acertar ese número de posiciones: por azar es ~1 entre 200.
  // Los pares que se confunden al leer (S/5, B/8, Z/2, G/6, O/0/D/Q, I/L/1) cuentan como el mismo carácter.
  const same = (x, y) => x === y || (CONFUSABLE[x] ?? x) === (CONFUSABLE[y] ?? y);
  const close = (a, b) =>
    minMatch ? [...b].filter((c, i) => same(a[i], c)).length >= minMatch : a.length === b.length && [...a].filter((c, i) => !same(c, b[i])).length <= 1;
  const bad = Object.entries(codes).filter(([name, code]) => !close(got[name] ?? '', code));
  return {
    missing: bad.map(([name]) => name),
    given: bad.map(([name, code]) => ({ name, got: (got[name] ?? '').slice(0, 8), expected: code })),
    returned: Object.keys(got).length,
  };
}

/**
 * Valida la respuesta. Devuelve `{ proposals, errors }`; descarta entradas mal formadas.
 * Por campo: `{ id, found, page, anchorB, side?, anchorA?, dx?, dy?, absent?, confidence, reason }`. Con found, `page` y
 * `anchorB` son obligatorios; `anchorA` es opcional (B puede tener una etiqueta que A no tenía cerca) y un `side` que no
 * sea de `SIDES` se ignora. `absent: true` (con found:false) = el concepto no existe en B.
 */
/** Tope de confianza de «igual que en A»: siempre queda en «a revisar», nunca marcado por defecto. */
export const SAME_AS_A_CONFIDENCE = 0.6;

export function validateProposals(data, knownIds) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.fields) ? data.fields : null;
  if (!list) return { proposals: [], errors: ['La respuesta no es una lista JSON.'] };
  const errors = [];
  const proposals = [];
  const seen = new Set();
  for (const item of list) {
    if (!item || typeof item !== 'object' || !knownIds.has(item.id)) {
      errors.push(`Entrada con id desconocido: ${JSON.stringify(item?.id)}`);
      continue;
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.found === false) {
      const p = { id: item.id, found: false, reason: String(item.reason ?? '') };
      if (item.absent === true) p.absent = true;
      proposals.push(p);
      continue;
    }
    const page = Number(item.page);
    // «Igual que en A»: la IA afirma que el hueco está en el mismo sitio que en A (sin etiqueta en B). Confianza ≤ 0,6.
    if (item.sameAsA === true && Number.isInteger(page) && page >= 1) {
      proposals.push({ id: item.id, found: true, page, sameAsA: true, anchorA: null, anchorB: '', dx: 0, dy: 0, confidence: Math.min(SAME_AS_A_CONFIDENCE, clamp01(Number(item.confidence))), reason: String(item.reason ?? '') });
      continue;
    }
    if (!Number.isInteger(page) || page < 1 || typeof item.anchorB !== 'string' || !item.anchorB.trim()) {
      errors.push(`${item.id}: faltan page o anchorB.`);
      continue;
    }
    const p = {
      id: item.id,
      found: true,
      page,
      anchorA: typeof item.anchorA === 'string' && item.anchorA.trim() ? item.anchorA : null,
      anchorB: item.anchorB,
      dx: finite(item.dx),
      dy: finite(item.dy),
      confidence: clamp01(Number(item.confidence)),
      reason: String(item.reason ?? ''),
    };
    if (SIDES.includes(item.side)) p.side = item.side;
    proposals.push(p);
  }
  for (const id of knownIds) if (!seen.has(id)) errors.push(`${id}: sin respuesta.`);
  return { proposals, errors };
}

const finite = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

/** Busca un texto exacto (normalizado) y, si hay varios, el más cercano a (nearX, nearY). */
/** Orden de lectura de una página: de arriba abajo (y mayor = más arriba) y, en la misma línea, de izquierda a derecha. */
export const readingOrder = (a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x);

/** Textos de una página que coinciden con `wanted`: primero exactos (normalizados); si no hay, los que lo contienen o están contenidos. */
export function textHits(texts, page, wanted) {
  const w = norm(wanted);
  if (!w) return [];
  const onPage = texts.filter((t) => t.page === page);
  const exact = onPage.filter((t) => norm(t.text) === w);
  if (exact.length) return exact;
  return onPage.filter((t) => norm(t.text).includes(w) || (norm(t.text).length > 2 && w.includes(norm(t.text))));
}

/**
 * Texto de la página que corresponde a `wanted`. Si se repite y `rank` dice que en A era la aparición
 * n.º `index` de `of`, y en B aparece las mismas veces, se empareja por orden de lectura (1.ª con 1.ª…):
 * en páginas reestructuradas la «más cercana a la posición de A» puede ser la de otro bloque.
 */
export function findText(texts, page, wanted, nearX, nearY, rank = null, { section = null } = {}) {
  let hits = textHits(texts, page, wanted);
  if (!hits.length) return null;
  // Etiqueta repetida (dos secciones con «Nombre», «NIF»…): manda el título de la sección, que en B puede estar en
  // otro orden u otra columna; el orden de lectura solo sirve si las secciones no se han movido.
  if (section && hits.length > 1) {
    const same = hits.filter((h) => sectionHeading(texts, h) === section);
    if (same.length === 1) return same[0];
    if (same.length > 1) hits = same;
  }
  if (rank && hits.length > 1 && hits.length === rank.of && rank.index >= 0) {
    return [...hits].sort(readingOrder)[rank.index];
  }
  return hits.sort((a, b) => dist(a.x, a.y, nearX, nearY) - dist(b.x, b.y, nearX, nearY))[0];
}

/**
 * Título de la sección de un texto: el texto más cercano por encima, en su misma columna (±60 pt) y a ≤ 200 pt,
 * que no se repita en la página (las etiquetas repetidas como «Nombre» no son títulos) ni sea un relleno «____».
 * Devuelve el texto normalizado o null.
 */
export function sectionHeading(texts, hit) {
  const onPage = texts.filter((t) => t.page === hit.page);
  const count = new Map();
  for (const t of onPage) count.set(norm(t.text), (count.get(norm(t.text)) ?? 0) + 1);
  let best = null;
  for (const t of onPage) {
    const dy = t.y - hit.y;
    if (dy <= 2 || dy > 200 || Math.abs(t.x - hit.x) > 60) continue;
    const n = norm(t.text);
    if (!n || count.get(n) > 1 || /^[_.\s…-]+$/.test(t.text)) continue;
    if (!best || dy < best.dy) best = { dy, n };
  }
  return best?.n ?? null;
}

/**
 * Convierte la propuesta (anclas por texto) en coordenadas de B en puntos PDF, con la convención de la app (inicio
 * de la línea base de lo que se pinta; ver place.mjs). Con `slots` (huecos de B, de readPdf):
 * 1. `side`: el hueco de ese lado del ancla de B (casilla para check/radio, línea para el resto).
 * 2. Sin hueco en ese lado (o sin side) y con `anchorA`: ancla B + (campo A − ancla A) + (dx, dy), ajustado al hueco
 *    del mismo tipo si hay uno a ≤ 15 pt.
 * 3. Sin hueco y sin `anchorA`: respaldo junto al ancla de B según `side`, con confianza ≤ 0,5 (`maxConfidence`).
 * Devuelve `{ ok, page, x, y, snapped, method: 'side' | 'offset' | 'fallback', maxConfidence? }` o `{ ok: false, why }`.
 */
export function resolveProposal(proposal, entry, textsA, textsB, { slots = [] } = {}) {
  if (!proposal.found) return { ok: false, why: 'sin_resultado' };
  const f = entry.field;
  const kind = slotKind(f);
  if (proposal.sameAsA) {
    // Misma posición que en A en la página que dice la IA, ajustada al hueco del mismo tipo si hay uno a ≤ 15 pt.
    const at = { x: f.x, y: f.y };
    const snap = snapToSlot(at, kind, f, slots.filter((s) => s.page === proposal.page));
    const xy = snap ?? at;
    return { ok: true, page: proposal.page, x: round(xy.x), y: round(xy.y), snapped: !!snap, method: 'sameAsA', maxConfidence: SAME_AS_A_CONFIDENCE };
  }
  let a = null;
  let rank = null;
  if (proposal.anchorA) {
    a = findText(textsA, entry.page, proposal.anchorA, f.x, f.y);
    if (!a && !proposal.side) return { ok: false, why: 'ancla_A_no_encontrada' };
    if (a) {
      // Si el ancla se repite en A, qué aparición es (por orden de lectura), para emparejarla con la misma en B.
      const hitsA = textHits(textsA, entry.page, proposal.anchorA);
      rank = hitsA.length > 1 ? { index: [...hitsA].sort(readingOrder).indexOf(a), of: hitsA.length } : null;
    }
  }
  // Si el ancla de B se repite, el título de la sección de A (del ancla de A o, sin ella, del mismo texto junto al campo) elige.
  let section = null;
  if (textHits(textsB, proposal.page, proposal.anchorB).length > 1) {
    const ref = a ?? findText(textsA, entry.page, proposal.anchorB, f.x, f.y);
    if (ref) section = sectionHeading(textsA, ref);
  }
  const b = findText(textsB, proposal.page, proposal.anchorB, a?.x ?? f.x, a?.y ?? f.y, rank, { section });
  if (!b) return { ok: false, why: 'ancla_B_no_encontrada' };
  const pageSlots = slots.filter((s) => s.page === proposal.page);
  const ok = (xy, extra) => ({ ok: true, page: proposal.page, x: round(xy.x), y: round(xy.y), ...extra });
  const textsOfPage = textsB.filter((t) => t.page === proposal.page);
  if (proposal.side) {
    const hit = slotOnSide(b, pageSlots, proposal.side, { texts: textsOfPage, kind });
    if (hit) return ok(toFieldXY(hit.point, kind, f), { snapped: true, method: 'side' });
    // El lado pedido no tiene hueco pero la etiqueta de B sí tiene uno pegado en otro lado (la IA suele decir «right»
    // por costumbre cuando en B el hueco está debajo, o la casilla cambió de lado): se usa ese.
    const other = kind === 'box' ? nearestSlot(b, pageSlots, { kind: 'box', boxSide: 'auto', texts: textsOfPage }) : nearestSlot(b, pageSlots, { kind: 'line', prefer: 'auto', radius: 45, texts: textsOfPage });
    if (other) return ok(toFieldXY(other.point, kind, f), { snapped: true, method: 'side-auto' });
  }
  if (a) {
    const xy = { x: b.x + (f.x - a.x) + proposal.dx, y: b.y + (f.y - a.y) + proposal.dy };
    const snap = snapToSlot(xy, kind, f, pageSlots);
    return snap ? ok(snap, { snapped: true, method: 'offset' }) : ok(xy, { snapped: false, method: 'offset' });
  }
  const xy = fallbackXY(b, proposal.side ?? defaultSide(kind), kind, f);
  return ok({ x: xy.x + proposal.dx, y: xy.y + proposal.dy }, { snapped: false, method: 'fallback', maxConfidence: FALLBACK_CONFIDENCE });
}

/**
 * Por qué queda sin colocar un campo al final: `no_existe_en_b` si la última respuesta dijo `absent` y ya se le
 * preguntó con todas las páginas de B (`askedPages` = páginas de B enviadas con ese campo); si no, el motivo de siempre.
 */
export function missingWhy(outcome, askedPages, totalPagesB) {
  const why = outcome?.resolved?.why;
  if (why === 'sin_resultado' && outcome.proposal?.absent === true && (askedPages?.size ?? 0) >= totalPagesB) return 'no_existe_en_b';
  return why;
}

/** Compara con la respuesta conocida de B (mismo id). */
export function score(resolved, truthEntry) {
  if (!truthEntry) return null;
  if (truthEntry.gone) return { gone: true, goneOk: !resolved.ok };
  if (!resolved.ok) return { pageOk: false, err: null };
  const pageOk = resolved.page === truthEntry.page;
  return { pageOk, err: pageOk ? round(dist(resolved.x, resolved.y, truthEntry.field.x, truthEntry.field.y)) : null };
}

export function summarize(rows) {
  const total = rows.length;
  const resolved = rows.filter((r) => r.resolved.ok);
  const gone = rows.filter((r) => r.score?.gone);
  const scored = rows.filter((r) => r.score && !r.score.gone);
  const pageOk = scored.filter((r) => r.score.pageOk).length;
  const errs = scored.map((r) => r.score.err).filter((e) => e !== null).sort((a, b) => a - b);
  const median = errs.length ? errs[Math.floor(errs.length / 2)] : null;
  const within = (n) => errs.filter((e) => e <= n).length;
  return {
    total,
    resolved: resolved.length,
    scored: scored.length,
    goneTotal: gone.length,
    goneOk: gone.filter((r) => r.score.goneOk).length,
    pageOk,
    medianErrPt: median,
    within2: within(2),
    within5: within(5),
    errsMeasured: errs.length,
  };
}

/** Page table given by the user («B1: sin A · B2: A1…»), or an empty string when there is none. */
export function describePageMap(pageMap) {
  if (!Array.isArray(pageMap) || pageMap.length === 0 || pageMap.length > 500) return '';
  const rows = pageMap.map((a, i) => `B${i + 1}: ${Number.isInteger(a) && a >= 1 ? `A${a}` : 'sin página de A'}`);
  return `- Correspondencia de páginas indicada por el usuario (página de B: página de A equivalente): ${rows.join(' · ')}. Úsala para saber en qué página de B buscar cada campo, salvo que las imágenes muestren claramente otra cosa.\n`;
}

// ── Traslado por partes (ayudante de la app): preparación sin IA ──────────────────────────────────────────────

/** Páginas de B candidatas por cada página útil de A cuando no hay tabla (y tamaño de cada tanda de la pasada 2). */
export const CANDIDATE_PAGES = 3;
/** Textos cercanos que acompañan a cada campo en fields.json. */
export const NEARBY_TEXTS = 8;

/** Páginas útiles de A: las que tienen campos (y existen en A), en orden. */
export function usefulPagesA(entries, pagesA = Infinity) {
  return [...new Set(entries.map((e) => e.page))].filter((p) => Number.isInteger(p) && p >= 1 && p <= pagesA).sort((a, b) => a - b);
}

/** Palabras comparables de un texto: normalizadas, de 3 letras o más y sin números. */
export const wordsOf = (s) =>
  norm(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !/\p{N}/u.test(w));

const pageWordSet = (texts, page) => new Set(texts.filter((t) => t.page === page).flatMap((t) => wordsOf(t.text)));

/** Todas las páginas de B ordenadas por palabras compartidas con `pageA` (desempate: más cerca en número, luego la primera). */
export function rankPagesB({ pageA, textsA, textsB, pagesB }) {
  const wa = pageWordSet(textsA, pageA);
  const scored = Array.from({ length: pagesB }, (_, i) => {
    const wb = pageWordSet(textsB, i + 1);
    let shared = 0;
    for (const w of wb) if (wa.has(w)) shared++;
    return { page: i + 1, shared };
  });
  return scored.sort((x, y) => y.shared - x.shared || Math.abs(x.page - pageA) - Math.abs(y.page - pageA) || x.page - y.page).map((s) => s.page);
}

/** Páginas de B que la tabla A↔B (índice = página de B − 1, valor = página de A o null) asigna a `pageA`. */
export function pagesFromMap(pageMap, pageA, pagesB) {
  if (!Array.isArray(pageMap) || pageMap.length === 0 || pageMap.length > 500) return [];
  return pageMap.flatMap((a, i) => (a === pageA && i + 1 <= pagesB ? [i + 1] : []));
}

/**
 * Candidatas de B para una página útil de A: las de la tabla si la hay (y asigna alguna); si no, todas cuando B tiene
 * `k` páginas o menos, o las `k` con más palabras compartidas. Devueltas en orden de página.
 */
export function candidatePagesB({ pageA, textsA, textsB, pagesB, pageMap, k = CANDIDATE_PAGES, rank }) {
  const fromMap = pagesFromMap(pageMap, pageA, pagesB);
  if (fromMap.length) return fromMap;
  if (pagesB <= k) return Array.from({ length: pagesB }, (_, i) => i + 1);
  return (rank ?? rankPagesB({ pageA, textsA, textsB, pagesB })).slice(0, k).sort((a, b) => a - b);
}

/** Plan de la pasada 1: una petición por página útil de A con sus candidatas de B y sus campos. */
export function buildPlan({ entries, pagesA, textsA, pagesB, textsB, pageMap, k = CANDIDATE_PAGES }) {
  return usefulPagesA(entries, pagesA).map((pageA) => {
    const rankB = rankPagesB({ pageA, textsA, textsB, pagesB });
    return {
      group: `A-p${pageA}`,
      pageA,
      candidatesB: candidatePagesB({ pageA, textsA, textsB, pagesB, pageMap, k, rank: rankB }),
      rankB,
      fields: entries.filter((e) => e.page === pageA),
    };
  });
}

/**
 * Páginas de B para la re-pregunta de un grupo: las siguientes `chunk` aún no enviadas (por orden de parecido) o, si ya
 * se enviaron todas, las mismas candidatas de la pasada 1 (`fresh: false`: la petición lleva el motivo de cada fallo).
 */
export function planRetry({ candidatesB, rankB, sentB, chunk = CANDIDATE_PAGES }) {
  const unsent = rankB.filter((p) => !sentB.has(p));
  if (unsent.length) return { pagesB: unsent.slice(0, chunk).sort((a, b) => a - b), fresh: true };
  return { pagesB: [...candidatesB], fresh: false };
}

/** Si un campo sale en varias peticiones: gana el colocado y, entre colocados, el de mayor confianza (empate: el primero). */
export function mergeOutcome(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  if (next.resolved.ok !== prev.resolved.ok) return next.resolved.ok ? next : prev;
  if (next.resolved.ok) return (next.proposal.confidence ?? 0) > (prev.proposal.confidence ?? 0) ? next : prev;
  return next;
}

const short = (s, n = 80) =>
  String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, n);

/** Motivo de un fallo para la re-pregunta (una línea por campo). `outcome` puede faltar: la IA no devolvió ese campo. */
export function failureNote(entry, outcome) {
  const label = short(entry.field?.mapField) || 'sin nombre';
  const who = `${entry.id} («${label}»)`;
  const p = outcome?.proposal;
  switch (outcome?.resolved?.why) {
    case 'sin_resultado':
      if (p?.absent) return `- ${who}: respondiste que no existe en B${p?.reason ? ` («${short(p.reason)}»)` : ''}. Búscalo en estas páginas de B (también con otra redacción); si de verdad no existe, vuelve a responder found:false y absent:true.`;
      return `- ${who}: respondiste found:false${p?.reason ? ` («${short(p.reason)}»)` : ''}. Búscalo otra vez en las páginas de esta petición; si de verdad no está, vuelve a responder found:false.`;
    case 'ancla_A_no_encontrada':
      return `- ${who}: "anchorA" «${short(p?.anchorA)}» no existe literalmente en textsA.json. Copia un texto exacto de "nearby" u omite "anchorA" e indica "side".`;
    case 'ancla_B_no_encontrada':
      return `- ${who}: "anchorB" «${short(p?.anchorB)}» no existe literalmente en textsB.json en la página ${p?.page}. Elige un texto que exista en textsB.json.`;
    default:
      return `- ${who}: no venía en la respuesta anterior.`;
  }
}

/** Rellena los `{{marcadores}}` de una plantilla en una sola pasada (lo insertado no se vuelve a interpretar). */
export function fillTemplate(template, vars) {
  return String(template).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) throw new Error(`Falta el marcador {{${key}}} en la plantilla.`);
    return String(vars[key] ?? '');
  });
}

/** Quita los comentarios HTML (notas para quien edita la plantilla) y los saltos de línea sobrantes. */
export const stripTemplateComments = (text) =>
  String(text)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';

export function buildPrompt({ pagesA, pagesB, sizeA, sizeB, retryNote, codes, attached, pageMap }) {
  const imgs = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-p${i + 1}.png`).join(', ');
  return `# Tarea: trasladar campos de un PDF A a un PDF B

Tienes en esta carpeta:
- ${imgs('A', pagesA)}: páginas del PDF A (imágenes).
- ${imgs('B', pagesB)}: páginas del PDF B, la versión nueva (imágenes).
- Tamaño de página en puntos PDF (ancho × alto): A ${sizeA}, B ${sizeB}.
- textsA.json y textsB.json: los textos de cada PDF con su página y posición (x, y en puntos PDF, origen abajo-izquierda; x, y es el inicio del texto en su línea base).
- fields.json: los campos del PDF A que hay que colocar en B. Cada campo trae "nearby": los textos más cercanos de A con su desplazamiento (dx, dy) hasta el campo.
${describePageMap(pageMap)}
Para cada campo de fields.json:
1. Elige en "nearby" el texto de A que mejor sirve de ancla (normalmente la etiqueta junto a la que se escribe el valor). Cópialo EXACTO en "anchorA".
2. Busca ese mismo texto, o el equivalente si cambió de redacción, en B y cópialo EXACTO de textsB.json en "anchorB", junto con su página en "page". El texto puede haberse movido a otra página.
3. La app calculará la posición final: ancla B + desplazamiento que tenía el campo en A. Si en B el campo ya no está en la misma posición relativa respecto a su etiqueta (se ve en las imágenes), estima la corrección en puntos PDF en "dx" y "dy" (si no cambió, 0 y 0). No calcules coordenadas absolutas.
4. Si no hay forma razonable de colocarlo (por ejemplo, la etiqueta ya no existe en B), devuelve "found": false con el motivo. No fuerces un ancla distinta.

${attached ? 'Las imágenes ya vienen adjuntas a este mensaje: míralas ahí, no las abras con herramientas.\n\n' : ''}Trabaja solo con las imágenes y los JSON de esta carpeta: abre cada imagen una sola vez, no uses la terminal ni escribas archivos.

Mira las imágenes de A y B para confirmar que el ancla es el mismo concepto. No inventes textos: "anchorA" y "anchorB" deben existir literalmente en textsA.json y textsB.json.

${codes ? `Cada imagen lleva, en una franja añadida debajo de la página, un código de 4 caracteres muy grande. Debes abrir TODAS las imágenes y copiar el código de cada una en "images" (si dudas de un carácter escribe tu mejor lectura; nunca "?") (${Object.keys(codes).join(', ')}). Sin esos códigos la respuesta se descarta.

Responde SOLO con un objeto JSON, sin texto antes ni después:
{"images":{"A-p1":"XXXX"},"fields":[{"id":"p1-f1","found":true,"page":1,"anchorA":"Cliente","anchorB":"Cliente","dx":0,"dy":0,"confidence":0.9,"reason":"una frase"}]}
"fields" lleva un objeto por campo.` : `Responde SOLO con una lista JSON, sin texto antes ni después, con un objeto por campo:
[{"id":"p1-f1","found":true,"page":1,"anchorA":"Cliente","anchorB":"Cliente","dx":0,"dy":0,"confidence":0.9,"reason":"una frase"}]`}
"confidence" va de 0 a 1.${retryNote ? `\n\nAVISO: ${retryNote}` : ''}
`;
}
