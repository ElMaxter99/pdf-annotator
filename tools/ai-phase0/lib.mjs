// Lógica pura de la fase 0 (sin E/S): preparar campos, leer la respuesta de la IA y convertirla en coordenadas.

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
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
export function missingImageCodes(data, codes) {
  return describeImageCodes(data, codes).missing;
}

/** Como `missingImageCodes`, y además lo que devolvió la IA por cada imagen que falla (para diagnosticar; los códigos son aleatorios, no contenido del PDF). */
export function describeImageCodes(data, codes) {
  const raw = data && typeof data === 'object' && !Array.isArray(data) && data.images && typeof data.images === 'object' ? data.images : {};
  // Admite claves como «A-p1.png» y un carácter mal transcrito (el modelo pequeño confunde letras parecidas).
  const got = {};
  for (const [k, v] of Object.entries(raw)) got[String(k).replace(/\.png$/i, '').trim()] = String(v ?? '').trim().toUpperCase();
  const close = (a, b) => a.length === b.length && [...a].filter((c, i) => c !== b[i]).length <= 1;
  const bad = Object.entries(codes).filter(([name, code]) => !close(got[name] ?? '', code));
  return {
    missing: bad.map(([name]) => name),
    given: bad.map(([name, code]) => ({ name, got: (got[name] ?? '').slice(0, 8), expected: code })),
    returned: Object.keys(got).length,
  };
}

/** Valida la respuesta. Devuelve `{ proposals, errors }`; descarta entradas mal formadas. */
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
      proposals.push({ id: item.id, found: false, reason: String(item.reason ?? '') });
      continue;
    }
    const page = Number(item.page);
    if (!Number.isInteger(page) || page < 1 || typeof item.anchorA !== 'string' || typeof item.anchorB !== 'string') {
      errors.push(`${item.id}: faltan page, anchorA o anchorB.`);
      continue;
    }
    proposals.push({
      id: item.id,
      found: true,
      page,
      anchorA: item.anchorA,
      anchorB: item.anchorB,
      dx: finite(item.dx),
      dy: finite(item.dy),
      confidence: clamp01(Number(item.confidence)),
      reason: String(item.reason ?? ''),
    });
  }
  for (const id of knownIds) if (!seen.has(id)) errors.push(`${id}: sin respuesta.`);
  return { proposals, errors };
}

const finite = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5);

/** Busca un texto exacto (normalizado) y, si hay varios, el más cercano a (nearX, nearY). */
export function findText(texts, page, wanted, nearX, nearY) {
  const w = norm(wanted);
  if (!w) return null;
  const onPage = texts.filter((t) => t.page === page);
  let hits = onPage.filter((t) => norm(t.text) === w);
  if (!hits.length) hits = onPage.filter((t) => norm(t.text).includes(w) || (norm(t.text).length > 2 && w.includes(norm(t.text))));
  if (!hits.length) return null;
  return hits.sort((a, b) => dist(a.x, a.y, nearX, nearY) - dist(b.x, b.y, nearX, nearY))[0];
}

/**
 * Convierte la propuesta (anclas por texto) en coordenadas de B en puntos PDF.
 * x,y = ancla B + (campo A − ancla A) + (dx,dy) que la IA haya estimado.
 */
export function resolveProposal(proposal, entry, textsA, textsB) {
  if (!proposal.found) return { ok: false, why: 'sin_resultado' };
  const f = entry.field;
  const a = findText(textsA, entry.page, proposal.anchorA, f.x, f.y);
  if (!a) return { ok: false, why: 'ancla_A_no_encontrada' };
  const b = findText(textsB, proposal.page, proposal.anchorB, a.x, a.y);
  if (!b) return { ok: false, why: 'ancla_B_no_encontrada' };
  return { ok: true, page: proposal.page, x: round(b.x + (f.x - a.x) + proposal.dx), y: round(b.y + (f.y - a.y) + proposal.dy) };
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

export function buildPrompt({ pagesA, pagesB, sizeA, sizeB, retryNote, codes, attached }) {
  const imgs = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-p${i + 1}.png`).join(', ');
  return `# Tarea: trasladar campos de un PDF A a un PDF B

Tienes en esta carpeta:
- ${imgs('A', pagesA)}: páginas del PDF A (imágenes).
- ${imgs('B', pagesB)}: páginas del PDF B, la versión nueva (imágenes).
- Tamaño de página en puntos PDF (ancho × alto): A ${sizeA}, B ${sizeB}.
- textsA.json y textsB.json: los textos de cada PDF con su página y posición (x, y en puntos PDF, origen abajo-izquierda; x, y es el inicio del texto en su línea base).
- fields.json: los campos del PDF A que hay que colocar en B. Cada campo trae "nearby": los textos más cercanos de A con su desplazamiento (dx, dy) hasta el campo.

Para cada campo de fields.json:
1. Elige en "nearby" el texto de A que mejor sirve de ancla (normalmente la etiqueta junto a la que se escribe el valor). Cópialo EXACTO en "anchorA".
2. Busca ese mismo texto, o el equivalente si cambió de redacción, en B y cópialo EXACTO de textsB.json en "anchorB", junto con su página en "page". El texto puede haberse movido a otra página.
3. La app calculará la posición final: ancla B + desplazamiento que tenía el campo en A. Si en B el campo ya no está en la misma posición relativa respecto a su etiqueta (se ve en las imágenes), estima la corrección en puntos PDF en "dx" y "dy" (si no cambió, 0 y 0). No calcules coordenadas absolutas.
4. Si no hay forma razonable de colocarlo (por ejemplo, la etiqueta ya no existe en B), devuelve "found": false con el motivo. No fuerces un ancla distinta.

${attached ? 'Las imágenes ya vienen adjuntas a este mensaje: míralas ahí, no las abras con herramientas.\n\n' : ''}Trabaja solo con las imágenes y los JSON de esta carpeta: abre cada imagen una sola vez, no uses la terminal ni escribas archivos.

Mira las imágenes de A y B para confirmar que el ancla es el mismo concepto. No inventes textos: "anchorA" y "anchorB" deben existir literalmente en textsA.json y textsB.json.

${codes ? `Cada imagen lleva en la esquina inferior derecha un código de 4 caracteres en un recuadro. Debes abrir TODAS las imágenes y copiar el código de cada una en "images" (${Object.keys(codes).join(', ')}). Sin esos códigos la respuesta se descarta.

Responde SOLO con un objeto JSON, sin texto antes ni después:
{"images":{"A-p1":"XXXX"},"fields":[{"id":"p1-f1","found":true,"page":1,"anchorA":"Cliente","anchorB":"Cliente","dx":0,"dy":0,"confidence":0.9,"reason":"una frase"}]}
"fields" lleva un objeto por campo.` : `Responde SOLO con una lista JSON, sin texto antes ni después, con un objeto por campo:
[{"id":"p1-f1","found":true,"page":1,"anchorA":"Cliente","anchorB":"Cliente","dx":0,"dy":0,"confidence":0.9,"reason":"una frase"}]`}
"confidence" va de 0 a 1.${retryNote ? `\n\nAVISO: ${retryNote}` : ''}
`;
}
