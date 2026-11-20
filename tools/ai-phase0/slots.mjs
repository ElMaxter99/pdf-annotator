// Huecos de escritura dibujados en el PDF (líneas para escribir y casillas), sin E/S ni pdf.js: reglas puras.
// Coordenadas en puntos PDF, origen abajo-izquierda (la misma convención que los textos de readPdf).
// El pipeline las usa al resolver las propuestas y en el pase sin IA (place.mjs).

/** Códigos de operador de pdf.js 5.x que se usan aquí (copia de `pdfjs.OPS`; un test comprueba que coinciden). */
export const PDFJS_OPS = {
  setLineWidth: 2,
  setDash: 6,
  setGState: 9,
  save: 10,
  restore: 11,
  transform: 12,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  constructPath: 91,
};

/** Órdenes dentro del búfer de un `constructPath` de pdf.js 5.x (`DrawOPS`). */
export const DRAW_OPS = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 };

export const SLOT_DEFAULTS = {
  minLine: 20, // longitud mínima de una línea para escribir
  maxThickness: 3, // grosor máximo de una línea (trazo o rectángulo relleno muy bajo)
  minBox: 5, // lado mínimo de una casilla
  maxBox: 20, // lado máximo de una casilla
  boxRatio: 1.35, // proporción máxima lado largo / lado corto de una casilla
  maxFrame: 30, // altura máxima de un recuadro alargado que se trata como línea (su borde inferior)
  mergeGap: 3, // separación máxima para unir dos trozos de la misma línea
  yTol: 0.75, // diferencia vertical máxima para considerar dos trozos en la misma línea
};

const STROKES = new Set(['stroke', 'closeStroke', 'fillStroke', 'eoFillStroke', 'closeFillStroke', 'closeEOFillStroke']);
const FILLS = new Set(['fill', 'eoFill']);

const IDENTITY = [1, 0, 0, 1, 0, 0];
/** Matriz que aplica primero `m` y luego `ctm` (operador `cm` de PDF). */
export function compose(ctm, m) {
  const [a, b, c, d, e, f] = ctm;
  return [a * m[0] + c * m[1], b * m[0] + d * m[1], a * m[2] + c * m[3], b * m[2] + d * m[3], a * m[4] + c * m[5] + e, b * m[4] + d * m[5] + f];
}
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const r1 = (v) => Math.round(v * 10) / 10;

/** Trocea el búfer de un `constructPath` en subtrayectos: { pts: [[x,y]…], closed, curved }. */
export function parsePathBuffer(buf) {
  const subs = [];
  let cur = null;
  const start = (x, y) => {
    cur = { pts: [[x, y]], closed: false, curved: false };
    subs.push(cur);
  };
  for (let i = 0; i < (buf?.length ?? 0); ) {
    const op = buf[i++];
    if (op === DRAW_OPS.moveTo) {
      start(buf[i], buf[i + 1]);
      i += 2;
    } else if (op === DRAW_OPS.lineTo) {
      if (!cur) start(buf[i], buf[i + 1]);
      else cur.pts.push([buf[i], buf[i + 1]]);
      i += 2;
    } else if (op === DRAW_OPS.curveTo) {
      if (!cur) start(buf[i + 4], buf[i + 5]);
      cur.curved = true;
      cur.pts.push([buf[i + 4], buf[i + 5]]);
      i += 6;
    } else if (op === DRAW_OPS.quadraticCurveTo) {
      if (!cur) start(buf[i + 2], buf[i + 3]);
      cur.curved = true;
      cur.pts.push([buf[i + 2], buf[i + 3]]);
      i += 4;
    } else if (op === DRAW_OPS.closePath) {
      if (cur) {
        cur.closed = true;
        const [x, y] = cur.pts[0];
        cur = { pts: [[x, y]], closed: false, curved: false };
        subs.push(cur);
      }
    } else break; // búfer desconocido: mejor no inventar nada
  }
  return subs.filter((s) => s.pts.length > 1);
}

/** Si los puntos (ya transformados) forman un rectángulo alineado con los ejes, devuelve { x, y, w, h }. */
export function asRect(pts, eps = 0.5) {
  let p = pts;
  if (p.length === 5 && Math.abs(p[0][0] - p[4][0]) <= eps && Math.abs(p[0][1] - p[4][1]) <= eps) p = p.slice(0, 4);
  if (p.length !== 4) return null;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % 4];
    if (Math.abs(x1 - x2) > eps && Math.abs(y1 - y2) > eps) return null;
  }
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const isBox = (r, o) => {
  const lo = Math.min(r.w, r.h);
  const hi = Math.max(r.w, r.h);
  return lo >= o.minBox && hi <= o.maxBox && hi / lo <= o.boxRatio;
};

/**
 * Recorre la lista de operadores de una página (`page.getOperatorList()` de pdf.js 5.x) y devuelve los trazos útiles,
 * ya en coordenadas de página: { hsegs, vsegs, rects } antes de clasificar. Aplica save/restore, cm y los
 * formularios XObject; el grosor del trazo se escala con la matriz.
 */
export function collectGeometry(fnArray, argsArray, { ops = PDFJS_OPS } = {}) {
  const name = Object.fromEntries(Object.entries(ops).map(([k, v]) => [v, k]));
  let st = { ctm: IDENTITY, lw: 1, dashed: false };
  const stack = [];
  const hsegs = [];
  const vsegs = [];
  const rects = [];
  for (let i = 0; i < fnArray.length; i++) {
    const op = name[fnArray[i]];
    const args = argsArray[i];
    if (!op) continue;
    if (op === 'save') stack.push({ ...st });
    else if (op === 'restore') st = stack.pop() ?? st;
    else if (op === 'transform') st.ctm = compose(st.ctm, args);
    else if (op === 'paintFormXObjectBegin') {
      stack.push({ ...st });
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) st.ctm = compose(st.ctm, Array.from(args[0]));
    } else if (op === 'paintFormXObjectEnd') st = stack.pop() ?? st;
    else if (op === 'setLineWidth') st.lw = args[0];
    else if (op === 'setDash') st.dashed = Array.isArray(args?.[0]) && args[0].some((v) => v > 0);
    else if (op === 'setGState') {
      for (const [k, v] of args?.[0] ?? []) {
        if (k === 'LW') st.lw = v;
        if (k === 'D') st.dashed = Array.isArray(v?.[0]) && v[0].some((n) => n > 0);
      }
    } else if (op === 'constructPath') {
      const paint = name[args?.[0]];
      const buf = args?.[1]?.[0];
      if (!buf || !(STROKES.has(paint) || FILLS.has(paint))) continue;
      const stroked = STROKES.has(paint);
      const m = st.ctm;
      // grosor en página: el trazo es perpendicular a la línea; para horizontales cuenta la escala vertical
      const sy = Math.hypot(m[2], m[3]);
      const sx = Math.hypot(m[0], m[1]);
      for (const sub of parsePathBuffer(buf)) {
        if (sub.curved) continue;
        const pts = sub.pts.map(([x, y]) => apply(m, x, y));
        const rect = asRect(pts);
        if (rect) {
          rects.push({ ...rect, stroked, lw: stroked ? st.lw * Math.min(sx, sy) : 0, dashed: st.dashed });
          continue;
        }
        if (!stroked) continue;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x1, y1] = pts[k];
          const [x2, y2] = pts[k + 1];
          if (Math.abs(y1 - y2) <= 0.5 && Math.abs(x2 - x1) > 0.5) {
            hsegs.push({ x: Math.min(x1, x2), y: (y1 + y2) / 2, w: Math.abs(x2 - x1), h: st.lw * sy, dashed: st.dashed });
          } else if (Math.abs(x1 - x2) <= 0.5 && Math.abs(y2 - y1) > 0.5) {
            vsegs.push({ x: (x1 + x2) / 2, y: Math.min(y1, y2), w: st.lw * sx, h: Math.abs(y2 - y1) });
          }
        }
      }
    }
  }
  return { hsegs, vsegs, rects };
}

/** Une trozos de línea contiguos o solapados en la misma altura (líneas partidas, dibujadas dos veces…). */
export function mergeLines(lines, opts = {}) {
  const o = { ...SLOT_DEFAULTS, ...opts };
  const byY = [...lines].sort((a, b) => a.page - b.page || a.y - b.y);
  const rows = [];
  for (const l of byY) {
    const row = rows.at(-1);
    if (row && row[0].page === l.page && Math.abs(row[0].y - l.y) <= o.yTol) row.push(l);
    else rows.push([l]);
  }
  const out = [];
  for (const row of rows) {
    let prev = null;
    for (const l of row.sort((a, b) => a.x - b.x)) {
      if (prev && l.x <= prev.x + prev.w + o.mergeGap) {
        prev.w = Math.max(prev.x + prev.w, l.x + l.w) - prev.x;
        prev.h = Math.max(prev.h, l.h);
        prev.dashed = prev.dashed && l.dashed;
      } else {
        prev = { ...l };
        out.push(prev);
      }
    }
  }
  return out;
}

/** Quita casillas repetidas: concéntricas o casi iguales (marco relleno + interior blanco, trazo + relleno…). Se queda la mayor. */
export function dedupeBoxes(boxes, tol = 2) {
  const sorted = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  const out = [];
  for (const b of sorted) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dup = out.some((k) => k.page === b.page && Math.abs(k.x + k.w / 2 - cx) <= tol && Math.abs(k.y + k.h / 2 - cy) <= tol && b.w <= k.w + tol && b.h <= k.h + tol);
    if (!dup) out.push(b);
  }
  return out;
}

/** Casillas dibujadas con cuatro trazos sueltos: dos horizontales iguales unidas por dos verticales en sus extremos. */
export function boxesFromSegments(hsegs, vsegs, opts = {}) {
  const o = { ...SLOT_DEFAULTS, ...opts };
  const e = 1;
  const short = hsegs.filter((s) => s.w >= o.minBox - e && s.w <= o.maxBox + e);
  const vs = vsegs.filter((s) => s.h >= o.minBox - e && s.h <= o.maxBox + e);
  const covers = (x, y0, y1) => vs.some((v) => Math.abs(v.x - x) <= e && v.y <= y0 + e && v.y + v.h >= y1 - e);
  const out = [];
  for (const lo of short) {
    for (const hi of short) {
      const h = hi.y - lo.y;
      if (h <= 0 || Math.abs(hi.x - lo.x) > e || Math.abs(hi.w - lo.w) > e) continue;
      const r = { x: lo.x, y: lo.y, w: lo.w, h };
      if (isBox(r, o) && covers(lo.x, lo.y, hi.y) && covers(lo.x + lo.w, lo.y, hi.y)) out.push(r);
    }
  }
  return out;
}

/**
 * Clasifica la geometría de una página en huecos: [{ page, kind: 'line' | 'box', x, y, w, h }].
 * - line: x = inicio, y = altura del trazo (centro), w = longitud, h = grosor. `dashed: true` si es discontinua;
 *   `frame: <alto>` si viene de un recuadro alargado (y = su borde inferior).
 * - box: x, y = esquina inferior izquierda, w, h = lados.
 */
export function classifyGeometry({ hsegs = [], vsegs = [], rects = [] }, page, opts = {}) {
  const o = { ...SLOT_DEFAULTS, ...opts };
  const lines = [];
  const boxes = [];
  for (const r of rects) {
    if (isBox(r, o)) boxes.push({ page, x: r.x, y: r.y, w: r.w, h: r.h });
    else if (r.w >= o.minLine && r.h + r.lw <= o.maxThickness) {
      lines.push({ page, x: r.x, y: r.y + r.h / 2, w: r.w, h: Math.max(r.h, r.lw), dashed: r.dashed });
    } else if (r.stroked && r.w >= o.minLine && r.h <= o.maxFrame && r.h > r.lw) {
      lines.push({ page, x: r.x, y: r.y, w: r.w, h: r.lw, dashed: r.dashed, frame: r.h });
    }
  }
  for (const s of hsegs) if (s.h <= o.maxThickness) lines.push({ page, ...s });
  for (const b of boxesFromSegments(hsegs, vsegs, o)) boxes.push({ page, ...b });
  const merged = mergeLines(lines, o).filter((l) => l.w >= o.minLine);
  const tidy = (s) => {
    const t = { page: s.page, kind: s.kind, x: r1(s.x), y: r1(s.y), w: r1(s.w), h: r1(s.h) };
    if (s.dashed) t.dashed = true;
    if (s.frame) t.frame = r1(s.frame);
    return t;
  };
  return [
    ...merged.map((l) => tidy({ ...l, kind: 'line' })),
    ...dedupeBoxes(boxes).map((b) => tidy({ ...b, kind: 'box' })),
  ].sort((a, b) => b.y - a.y || a.x - b.x);
}

/** Lista de operadores de una página → huecos. `ops` = `pdfjs.OPS` (por defecto, la copia de pdf.js 5.x). */
export function slotsFromOps(fnArray, argsArray, { page = 1, ops = PDFJS_OPS, ...opts } = {}) {
  return classifyGeometry(collectGeometry(fnArray, argsArray, { ops }), page, opts);
}

// ── Huecos escritos con caracteres («Nombre: ________», «Fecha: .........», «……») ─────────────────────────────────

export const TEXT_SLOT_DEFAULTS = {
  minUnderscores: 3, // guiones bajos mínimos de un hueco
  minDots: 4, // puntos mínimos (una «…» cuenta como 3)
  minLine: SLOT_DEFAULTS.minLine, // ancho mínimo, como las líneas dibujadas
  fontSize: 10, // cuerpo supuesto para estimar el ancho si el texto no trae `w`
  drop: 2, // el trazo virtual queda tanto por debajo de la línea base (punto de escritura = línea base)
  thickness: 0.5, // grosor nominal del trazo virtual
  dupTol: 3, // diferencia vertical máxima con una línea dibujada para darlo por repetido
};

/** Tramos de relleno: guiones bajos, puntos o «…», con como mucho un espacio entre ellos. */
const FILLER_RUN = /[_.…](?:[  ]?[_.…])*/gu;
const FILLER_ONLY = /^[\s ]*[_.…](?:[\s ]*[_.…])*[\s ]*$/u;

/** Ancho aproximado (en em) de un carácter en una sans tipo Helvetica: solo sirve para repartir `w` entre trozos. */
function charEm(ch) {
  if (ch === '…') return 1;
  if (ch === '_') return 0.556;
  if (/[.,:;!|'iljIf\s]/u.test(ch)) return 0.278;
  if (/[mwMW]/u.test(ch)) return 0.85;
  if (/\p{Lu}/u.test(ch)) return 0.68;
  if (/\p{Ll}/u.test(ch)) return 0.52;
  return 0.556;
}
const em = (s) => [...s].reduce((n, ch) => n + charEm(ch), 0);

/** ¿El tramo cuenta como hueco? ≥ 3 guiones bajos o ≥ 4 puntos (cada «…» vale 3). */
const isFiller = (run, o) =>
  (run.match(/_/g) ?? []).length >= o.minUnderscores || (run.match(/\./g) ?? []).length + 3 * (run.match(/…/g) ?? []).length >= o.minDots;

/** Tramos de relleno de un texto que cuentan como hueco: [{ start, end }] en índices de carácter (code points). */
export function fillerRuns(text, opts = {}) {
  const o = { ...TEXT_SLOT_DEFAULTS, ...opts };
  const s = String(text ?? '');
  const out = [];
  for (const m of s.matchAll(FILLER_RUN)) {
    if (!isFiller(m[0], o)) continue;
    const start = [...s.slice(0, m.index)].length;
    out.push({ start, end: start + [...m[0]].length });
  }
  return out;
}

/** ¿El texto es solo relleno («________», «. . . . .»)? No es una etiqueta ni «otro texto» entre etiqueta y hueco. */
export const isFillerText = (text, opts = {}) => FILLER_ONLY.test(String(text ?? '')) && fillerRuns(text, opts).length > 0;

/** Texto sin sus tramos de relleno («Nombre: ________» → «Nombre:»), para comparar etiquetas. */
export function labelText(text, opts = {}) {
  const s = String(text ?? '');
  const runs = fillerRuns(s, opts);
  if (!runs.length) return s;
  return [...s]
    .filter((_, i) => !runs.some((r) => i >= r.start && i < r.end))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ancho total de un texto: el de pdf.js (`w`) o una estimación con el cuerpo supuesto. */
const totalWidth = (t, o) => (Number(t?.w) > 0 ? Number(t.w) : em(String(t?.text ?? '')) * o.fontSize);

/** Ancho de la etiqueta de un texto: hasta donde empieza su primer relleno (sin espacios); sin relleno, el ancho entero. */
export function labelWidth(t, opts = {}) {
  const o = { ...TEXT_SLOT_DEFAULTS, ...opts };
  const text = String(t?.text ?? '');
  const runs = fillerRuns(text, o);
  if (!runs.length) return totalWidth(t, o);
  const prefix = [...text].slice(0, runs[0].start).join('').trimEnd();
  return prefix ? (totalWidth(t, o) * em(prefix)) / (em(text) || 1) : 0;
}

/**
 * Huecos escritos con caracteres en los textos de readPdf: [{ page, kind: 'line', x, y, w, h, fromText: true }].
 * Sirve el texto entero («________») o un trozo («Nombre: ________»: el hueco empieza donde empiezan los guiones).
 * La posición del relleno dentro del texto se estima repartiendo su `w` (o un ancho estimado) según el ancho
 * aproximado de cada carácter. `y` queda `drop` pt bajo la línea base, así el punto de escritura de nearestSlot
 * (2 pt por encima) cae en la línea base del texto. `drawn` = huecos dibujados: un relleno sobre una línea dibujada no
 * se repite.
 */
export function slotsFromTexts(texts, { drawn = [], ...opts } = {}) {
  const o = { ...TEXT_SLOT_DEFAULTS, ...opts };
  const found = [];
  for (const t of texts ?? []) {
    const text = String(t?.text ?? '');
    const runs = fillerRuns(text, o);
    if (!runs.length) continue;
    const chars = [...text];
    const total = totalWidth(t, o);
    const full = em(text) || 1;
    for (const r of runs) {
      const x = t.x + (total * em(chars.slice(0, r.start).join(''))) / full;
      const w = (total * em(chars.slice(r.start, r.end).join(''))) / full;
      if (w >= o.minLine) found.push({ page: t.page, kind: 'line', x, y: t.y - o.drop, w, h: o.thickness, fromText: true });
    }
  }
  const overlapsDrawn = (s) =>
    drawn.some((d) => d.kind === 'line' && d.page === s.page && Math.abs(d.y - s.y) <= o.dupTol && Math.min(d.x + d.w, s.x + s.w) - Math.max(d.x, s.x) > s.w / 2);
  return mergeLines(found.filter((s) => !overlapsDrawn(s)))
    .map((s) => ({ page: s.page, kind: 'line', x: r1(s.x), y: r1(s.y), w: r1(s.w), h: r1(s.h), fromText: true }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
}

export const NEAREST_DEFAULTS = {
  radius: 200, // distancia máxima del ancla al hueco
  prefer: 'auto', // 'auto' (el más cercano) | 'right' | 'below' | 'above' | 'left'
  strict: false, // con prefer concreto: true = solo ese lado (null si no hay); false = si no hay, el más cercano
  kind: 'line', // 'line' (líneas para escribir) | 'box' (casillas)
  yTol: 6, // tolerancia vertical para «en la misma línea»
  minBelow: 4, // un trazo más cerca que esto bajo la línea base es el subrayado del propio texto
  maxBelow: 40, // distancia vertical máxima para «justo debajo» (y «justo encima»)
  minAbove: 7, // un trazo encima tiene que pasar por encima de las letras del ancla
  belowWeight: 1.5, // con prefer 'auto', la distancia de «debajo» cuenta tanto más (gana la misma línea si dudan)
  boxSide: 'left', // casillas: 'left' (casilla a la izquierda de la opción) | 'right' | 'auto'
  maxBoxGap: 30, // casillas: separación horizontal máxima entre casilla y texto
  fontSize: 10, // tamaño supuesto del texto (si el ancla no trae h) para hallar su centro vertical
  padX: 2, // punto de escritura en una línea: tanto a la derecha del inicio
  lift: 2, // … y tanto por encima del trazo
};

/** Textos que pueden estorbar entre una etiqueta y su hueco: los que no son solo relleno («____» es el propio hueco). */
const solid = (texts) => (texts ?? []).filter((t) => !isFillerText(t.text));

/** Texto (de `texts`) entre dos x en la línea base del ancla, sin contar el propio ancla ni los rellenos. */
const textBetween = (texts, anchor, x0, x1, yTol) =>
  solid(texts).some(
    (t) => t.page === anchor.page && !(t.x === anchor.x && t.y === anchor.y) && Math.abs(t.y - anchor.y) <= yTol && t.x > x0 + 1 && t.x < x1 - 1,
  );

/** ¿La línea tiene su propia etiqueta a la izquierda en su misma altura? Entonces es el hueco «a la derecha» de otro texto. */
const ownedLine = (texts, anchor, s, yTol) =>
  solid(texts).some(
    (t) => t.page === anchor.page && t !== anchor && !(t.x === anchor.x && t.y === anchor.y) && Math.abs(t.y - s.y) <= yTol && t.x < s.x - 1 && s.x - (t.x + (t.w ?? 0)) <= 60,
  );

/**
 * Hueco más probable para un texto ancla { page, x, y, w?, h? } (x, y = inicio de la línea base, como en readPdf).
 * Líneas (`kind: 'line'`): a la derecha en la misma línea base (±yTol) o justo debajo (solapando en horizontal); con
 * `prefer: 'above' | 'left'`, también justo encima o a la izquierda en la misma línea base. `strict` = solo el lado pedido.
 * Casillas (`kind: 'box'`): la casilla a la izquierda (o derecha, `boxSide`) del texto de la opción, centrada en su altura.
 * `opts.texts` (los de readPdf) descarta huecos con otro texto en medio y, debajo/encima, las líneas que tienen su propia
 * etiqueta a la izquierda en su altura (son el hueco «a la derecha» de otro texto). Los huecos escritos con caracteres
 * (`fromText`, de slotsFromTexts) cuentan igual: los textos que son solo relleno no estorban, y si el ancla trae su propio
 * relleno («Nombre: ____»), mide desde el final de la etiqueta, así ese relleno es su hueco a la derecha. Devuelve null o
 * { slot, side: 'right' | 'below' | 'above' | 'left', distance, point: { x, y } }; `point` es donde se escribiría:
 * inicio de la línea un poco por encima, o el centro de la casilla.
 */
export function nearestSlot(anchor, slots, opts = {}) {
  const o = { ...NEAREST_DEFAULTS, ...opts };
  // Con relleno propio («Nombre: ____»), la etiqueta acaba donde empiezan los guiones: ese hueco queda «a la derecha».
  const right = anchor.x + (anchor.w ? labelWidth(anchor) : 0);
  const cands = [];
  for (const s of slots) {
    if (s.page !== anchor.page || s.kind !== o.kind) continue;
    if (o.kind === 'line') {
      const dy = s.y - anchor.y;
      // a la derecha: empieza tras el ancla (no su subrayado) y en la misma línea base
      if (Math.abs(dy) <= o.yTol && s.x >= right - 2 && s.x > anchor.x + 2 && !textBetween(o.texts, anchor, right, s.x, o.yTol)) {
        const dx = Math.max(0, s.x - right);
        cands.push({ slot: s, side: 'right', distance: Math.hypot(dx, dy) });
      }
      // debajo: por debajo del subrayado propio, sin pasarse, y solapando la columna del ancla
      const below = anchor.y - s.y;
      const colEnd = right + (anchor.w ? 0 : 40);
      const blocked = solid(o.texts).some((t) => t.page === anchor.page && t.y < anchor.y - 1 && t.y > s.y && t.x >= s.x - 5 && t.x <= s.x + s.w);
      if (below >= o.minBelow && below <= o.maxBelow && s.x <= colEnd + 10 && s.x + s.w >= anchor.x - 10 && !blocked && !ownedLine(o.texts, anchor, s, o.yTol)) {
        const d = Math.hypot(Math.max(0, s.x - anchor.x), below);
        cands.push({ slot: s, side: 'below', distance: d, score: o.prefer === 'auto' ? d * o.belowWeight : d });
      }
      // encima y a la izquierda solo si se piden (la etiqueta bajo la línea, «____ Firma»; el hueco antes del texto)
      const above = s.y - anchor.y;
      if (o.prefer === 'above' && above >= o.minAbove && above <= o.maxBelow && s.x <= colEnd + 10 && s.x + s.w >= anchor.x - 10) {
        const between = solid(o.texts).some((t) => t.page === anchor.page && t.y > anchor.y + 1 && t.y < s.y && t.x >= s.x - 5 && t.x <= s.x + s.w);
        if (!between && !ownedLine(o.texts, anchor, s, o.yTol)) cands.push({ slot: s, side: 'above', distance: Math.hypot(Math.max(0, s.x - anchor.x), above) });
      }
      if (o.prefer === 'left' && Math.abs(dy) <= o.yTol && s.x + s.w <= anchor.x + 2 && !textBetween(o.texts, anchor, s.x + s.w, anchor.x, o.yTol)) {
        cands.push({ slot: s, side: 'left', distance: Math.hypot(Math.max(0, anchor.x - (s.x + s.w)), dy) });
      }
    } else {
      const mid = anchor.y + (anchor.h ?? o.fontSize) * 0.35;
      if (Math.abs(s.y + s.h / 2 - mid) > Math.max(o.yTol, s.h * 0.6)) continue;
      const gapL = anchor.x - (s.x + s.w);
      const gapR = s.x - right;
      if (o.boxSide !== 'right' && gapL >= -2 && gapL <= o.maxBoxGap && !textBetween(o.texts, anchor, s.x + s.w, anchor.x, o.yTol)) {
        cands.push({ slot: s, side: 'left', distance: Math.max(0, gapL) });
      }
      if (o.boxSide !== 'left' && s.x > anchor.x + 2 && gapR >= -2 && gapR <= o.maxBoxGap && !textBetween(o.texts, anchor, right, s.x, o.yTol)) {
        cands.push({ slot: s, side: 'right', distance: Math.max(0, gapR) + 0.01 });
      }
    }
  }
  const inRange = cands.filter((c) => c.distance <= o.radius);
  if (!inRange.length) return null;
  const wanted = o.kind === 'line' && o.prefer !== 'auto' ? inRange.filter((c) => c.side === o.prefer) : inRange;
  if (o.strict && !wanted.length) return null;
  const pool = wanted.length ? wanted : inRange;
  const score = (c) => c.score ?? c.distance;
  const best = pool.reduce((a, b) => (score(b) < score(a) ? b : a));
  const s = best.slot;
  const point = s.kind === 'box' ? { x: r1(s.x + s.w / 2), y: r1(s.y + s.h / 2) } : { x: r1(s.x + o.padX), y: r1(s.y + o.lift) };
  return { slot: s, side: best.side, distance: r1(best.distance), point };
}
