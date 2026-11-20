// Pase sin IA (antes de la pasada 1): coloca los campos cuya etiqueta de A está en B idéntica y sin ambigüedad, en el
// hueco dibujado del mismo lado que tenía en A. Lo que no se coloca así va a la IA. Sin E/S.
import { nearbyTexts, norm, readingOrder } from './lib.mjs';
import { SIDE_TEXT, sideInA, slotKind, slotOnSide, toFieldXY } from './place.mjs';
import { labelText } from './slots.mjs';

/** Confianza de un campo colocado sin IA (se revisa como cualquier otra propuesta). */
export const TEXT_FIRST_CONFIDENCE = 0.75;
/** Textos cercanos de A que se miran como posible etiqueta (el más cercano primero). */
const LABEL_CANDIDATES = 8;

/** ¿Tiene pinta de etiqueta? ≥ 3 letras y ≤ 60 caracteres, sin contar su relleno («Nombre: ________»). */
export const looksLikeLabel = (s) => {
  const t = labelText(String(s ?? '')).trim();
  return t.length <= 60 && (t.match(/\p{L}/gu) ?? []).length >= 3;
};

/** ¿Está activo el pase sin IA? `AI_HELPER_TEXT_FIRST=0` lo desactiva (para medir la IA sola). */
export const textFirstEnabled = (env = process.env) => env.AI_HELPER_TEXT_FIRST !== '0';

const byPageThenReading = (a, b) => a.page - b.page || readingOrder(a, b);

/** Clave de comparación de una etiqueta: normalizada y sin relleno («Nombre: ____» y «Nombre: ________» son la misma). */
const labelKey = (s) => norm(labelText(s));

/**
 * Aparición de B que corresponde a la etiqueta `label` (un texto de A): la única de B con ese texto normalizado (sin
 * relleno de guiones o puntos) o, si
 * se repite las mismas veces en A y en B, la del mismo puesto por orden de lectura (página, arriba-abajo, izq.-der.).
 * Devuelve `{ b, index, of }` o null.
 */
export function matchLabelInB(label, textsA, textsB) {
  const w = labelKey(label.text);
  if (!w) return null;
  const hitsB = textsB.filter((t) => labelKey(t.text) === w);
  if (hitsB.length === 1) return { b: hitsB[0], index: 0, of: 1 };
  if (hitsB.length < 2) return null;
  const hitsA = textsA.filter((t) => labelKey(t.text) === w).sort(byPageThenReading);
  if (hitsA.length !== hitsB.length) return null;
  const index = hitsA.findIndex((t) => t.page === label.page && t.x === label.x && t.y === label.y);
  if (index < 0) return null;
  return { b: [...hitsB].sort(byPageThenReading)[index], index, of: hitsB.length };
}

/**
 * Intenta colocar un campo sin IA. Mira las etiquetas cercanas de A por orden de distancia; la primera que tenga una
 * relación clara con el campo (lado) decide: si aparece en B sin ambigüedad y hay hueco en ese lado de B, colocado;
 * si no, null (va a la IA). Devuelve `{ proposal, resolved }` con la misma forma que las respuestas de la IA.
 */
export function placeEntryByText(entry, { textsA, textsB, slotsB }) {
  const f = entry.field;
  const kind = slotKind(f);
  const near = nearbyTexts(textsA, entry.page, f, LABEL_CANDIDATES).filter((t) => looksLikeLabel(t.text));
  for (const n of near) {
    const label = textsA.find((t) => t.page === entry.page && t.text === n.text && Math.abs(t.x - n.x) < 0.1 && Math.abs(t.y - n.y) < 0.1);
    if (!label) continue;
    const side = sideInA(f, label, kind);
    if (!side) continue;
    // La etiqueta más cercana con una relación clara es la del campo: si no está en B sin ambigüedad, decide la IA
    // (seguir con la siguiente etiqueta colocaría el campo junto a la de otro dato).
    const match = matchLabelInB(label, textsA, textsB);
    if (!match) return null;
    const { b } = match;
    const hit = slotOnSide(b, slotsB.filter((s) => s.page === b.page), side, { texts: textsB.filter((t) => t.page === b.page), kind });
    if (!hit) return null;
    const xy = toFieldXY(hit.point, kind, f);
    const how = match.of === 1 ? 'idéntica y única en B' : `idéntica en A y B (la ${match.index + 1}.ª de ${match.of} por orden de lectura)`;
    const reason = `Colocado sin IA: etiqueta «${labelText(label.text).trim()}» ${how}, ${SIDE_TEXT[side]}`;
    return {
      proposal: { id: entry.id, found: true, page: b.page, anchorA: label.text, anchorB: b.text, side, dx: 0, dy: 0, confidence: TEXT_FIRST_CONFIDENCE, reason },
      resolved: { ok: true, page: b.page, x: xy.x, y: xy.y, snapped: true, method: 'text' },
    };
  }
  return null;
}

/** Pase sin IA sobre todos los campos: `{ placed: Map<id, {proposal, resolved, source: 'text'}>, rest: entries }`. */
export function placeByText(entries, ctx) {
  const placed = new Map();
  const rest = [];
  for (const e of entries) {
    const r = placeEntryByText(e, ctx);
    if (r) placed.set(e.id, { ...r, source: 'text', pass: 0, group: `A-p${e.page}` });
    else rest.push(e);
  }
  return { placed, rest };
}
