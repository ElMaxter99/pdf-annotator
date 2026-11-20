// Colocar un campo sobre el hueco dibujado de B (sin E/S): lado respecto a la etiqueta, ajuste al hueco cercano,
// respaldo sin hueco y conversión al x,y de la app. Coordenadas en puntos PDF, origen abajo-izquierda.
//
// Convención de la app (src/app/services/pdf-export.service.ts y `redrawAllForPage` de workspace.page.ts):
// para TODOS los tipos, x,y es el inicio de la línea base de lo que se pinta (`page.drawText(texto, { x, y })`; en el
// editor `top = alto − y·escala − fontSize·escala`). Una casilla (check/radio) pinta una «X» con esa misma regla, así
// que para centrarla en la casilla hay que restar media «X» de ancho y media de alto de mayúscula (Helvetica).
import { nearestSlot } from './slots.mjs';

/** Lados válidos del hueco respecto a la etiqueta de B (`side` en la respuesta de la IA). */
export const SIDES = ['right', 'below', 'above', 'left', 'box-left', 'box-right'];
/** Distancia máxima para ajustar al hueco el resultado de «ancla + desplazamiento de A». */
export const SNAP_DISTANCE = 15;
/** Confianza máxima de una colocación sin hueco ni ancla de A (heurística de respaldo). */
export const FALLBACK_CONFIDENCE = 0.5;
/** Tamaño de letra que la app usa cuando el campo no trae uno (annotation-import.service.ts). */
export const DEFAULT_FONT_SIZE = 14;
/** Métricas de la «X» de Helvetica (por 1 pt de cuerpo): ancho y altura de mayúscula. */
export const X_WIDTH = 0.667;
export const X_CAP = 0.718;
/** Punto de escritura en una línea: tanto a la derecha de su inicio y tanto por encima (igual que nearestSlot). */
const PAD_X = 2;
const LIFT = 2;

const round = (n) => Math.round(n * 10) / 10;

/** Tipo de hueco de un campo: casillas para check/radio, líneas para el resto. */
export const slotKind = (field) => (['check', 'radio'].includes(String(field?.type ?? '').toLowerCase()) ? 'box' : 'line');

const fontSizeOf = (field) => (Number(field?.fontSize) > 0 ? Number(field.fontSize) : DEFAULT_FONT_SIZE);

/**
 * Punto de escritura de `nearestSlot` → x,y de la app. Línea: el punto ya es el inicio de la línea base (2 pt sobre el
 * trazo). Casilla: el punto es su centro; se pasa al inicio de la línea base de una «X» centrada.
 */
export function toFieldXY(point, kind, field) {
  if (kind !== 'box') return { x: round(point.x), y: round(point.y) };
  const fs = fontSizeOf(field);
  return { x: round(point.x - (X_WIDTH * fs) / 2), y: round(point.y - (X_CAP * fs) / 2) };
}

/** Lo contrario para casillas: centro de la «X» que pinta un campo con ese x,y. */
export function boxCenterOf(xy, field) {
  const fs = fontSizeOf(field);
  return { x: xy.x + (X_WIDTH * fs) / 2, y: xy.y + (X_CAP * fs) / 2 };
}

/** Lado ajustado al tipo de hueco: una casilla «a la derecha» es `box-right`; una línea `box-left` es `left`. */
export function sideFor(kind, side) {
  if (kind === 'box') {
    if (side === 'left' || side === 'box-left') return 'box-left';
    if (side === 'right' || side === 'box-right') return 'box-right';
    return side;
  }
  if (side === 'box-left') return 'left';
  if (side === 'box-right') return 'right';
  return side;
}

/** Hueco de B en ese lado del texto ancla (solo ese lado). `texts` = textos de la página, para descartar huecos con otro texto en medio. */
export function slotOnSide(anchor, slots, side, { texts, kind = 'line' } = {}) {
  const s = sideFor(kind, side);
  if (kind === 'box') {
    if (s !== 'box-left' && s !== 'box-right') return null;
    return nearestSlot(anchor, slots, { kind: 'box', boxSide: s === 'box-left' ? 'left' : 'right', texts });
  }
  if (!['right', 'below', 'above', 'left'].includes(s)) return null;
  const hit = nearestSlot(anchor, slots, { kind: 'line', prefer: s, strict: true, texts });
  // En la misma línea que la etiqueta, el valor se escribe en su línea base si la raya queda justo debajo de ella.
  if (hit && (s === 'right' || s === 'left') && anchor.y - hit.slot.y >= 1 && anchor.y - hit.slot.y <= 6) return { ...hit, point: { ...hit.point, y: anchor.y } };
  return hit;
}

/**
 * Si a ≤ `max` pt del resultado hay un hueco del mismo tipo, x,y ajustado a él (si no, null).
 * Línea: se baja/sube a 2 pt sobre el trazo y, si queda fuera, se mete en la línea. Casilla: «X» centrada en ella.
 */
export function snapToSlot(xy, kind, field, slots, max = SNAP_DISTANCE) {
  let best = null;
  for (const s of slots) {
    if (s.kind !== kind) continue;
    let d;
    let to;
    if (kind === 'box') {
      const c = boxCenterOf(xy, field);
      const center = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
      d = Math.hypot(c.x - center.x, c.y - center.y);
      to = toFieldXY(center, 'box', field);
    } else {
      const outside = xy.x < s.x ? s.x - xy.x : xy.x > s.x + s.w ? xy.x - (s.x + s.w) : 0;
      d = Math.hypot(outside, xy.y - (s.y + LIFT));
      const x = Math.min(Math.max(xy.x, s.x + PAD_X), Math.max(s.x + PAD_X, s.x + s.w - 10));
      to = { x: round(x), y: round(s.y + LIFT) };
    }
    if (d <= max && (!best || d < best.d)) best = { d, to, slot: s };
  }
  return best ? { ...best.to, slot: best.slot, distance: round(best.d) } : null;
}

/** Ancho de un texto: el de pdf.js si lo hay; si no, una estimación (media letra por punto de cuerpo, a 10 pt). */
const widthOf = (t) => (Number(t?.w) > 0 ? Number(t.w) : String(t?.text ?? '').length * 5);

/** Lado por defecto cuando la IA no dice ninguno: línea a la derecha, casilla a la izquierda del texto. */
export const defaultSide = (kind) => (kind === 'box' ? 'box-left' : 'right');

/** Colocación de respaldo sin hueco ni ancla de A: junto a la etiqueta de B, en el lado pedido. */
export function fallbackXY(anchor, side, kind, field) {
  const fs = fontSizeOf(field);
  const w = widthOf(anchor);
  switch (sideFor(kind, side)) {
    case 'left':
      return { x: round(Math.max(0, anchor.x - 6 - 8 * fs)), y: anchor.y };
    case 'below':
      return { x: anchor.x, y: round(anchor.y - fs - 6) };
    case 'above':
      return { x: anchor.x, y: round(anchor.y + fs + 6) };
    case 'box-left':
      return toFieldXY({ x: anchor.x - 9, y: anchor.y + 3.5 }, 'box', field);
    case 'box-right':
      return toFieldXY({ x: anchor.x + w + 9, y: anchor.y + 3.5 }, 'box', field);
    case 'right':
    default:
      return kind === 'box' ? toFieldXY({ x: anchor.x - 9, y: anchor.y + 3.5 }, 'box', field) : { x: round(anchor.x + w + 6), y: anchor.y };
  }
}

/** Texto del lado para los motivos («hueco a la derecha»). */
export const SIDE_TEXT = {
  right: 'hueco a la derecha',
  below: 'hueco debajo',
  above: 'hueco encima',
  left: 'hueco a la izquierda',
  'box-left': 'casilla a la izquierda',
  'box-right': 'casilla a la derecha',
};

/**
 * Lado que tenía el campo respecto a una etiqueta de A (null si no tiene una relación clara con ella).
 * Casilla: misma altura que la etiqueta, a su izquierda o derecha. Línea: misma línea base (derecha/izquierda) o
 * debajo/encima, a poca distancia y solapando en horizontal.
 */
export function sideInA(field, label, kind) {
  if (kind === 'box') {
    const c = boxCenterOf(field, field);
    const mid = label.y + 3.5;
    if (Math.abs(c.y - mid) > 8) return null;
    if (c.x < label.x && label.x - c.x <= 40) return 'box-left';
    const end = label.x + widthOf(label);
    if (c.x > end && c.x - end <= 40) return 'box-right';
    return null;
  }
  const dy = field.y - label.y;
  const end = label.x + widthOf(label);
  if (Math.abs(dy) <= 4) {
    if (field.x >= end - 2 && field.x - end <= 200) return 'right';
    if (field.x < label.x && label.x - field.x <= 250) return 'left';
    return null;
  }
  const overlaps = field.x <= end + 40 && field.x >= label.x - 60;
  if (!overlaps) return null;
  if (dy < 0 && -dy <= 45) return 'below';
  if (dy > 0 && dy <= 45) return 'above';
  return null;
}
