// Banco de medida de «Trasladar con IA» con el motor de la app (bench.mjs): casos, puntuación y salida. Sin E/S salvo
// `listCases`. Ningún resultado lleva contenido de los PDF: solo ids de campo, mapField, números y motivos.
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const exists = (p) => stat(p).then(() => true, () => false);
const round1 = (n) => Math.round(n * 10) / 10;

/** Un caso = { name, a, aJson, b, expected }: rutas a A.pdf, plantilla de A, B.pdf y solución conocida (opcional). */
export const folderCase = (dir, name = path.basename(dir)) => ({ name, a: path.join(dir, 'A.pdf'), aJson: path.join(dir, 'A.json'), b: path.join(dir, 'B.pdf'), expected: path.join(dir, 'expected.json') });
export const flatCase = (dir, name) => ({ name, a: path.join(dir, `A-${name}.pdf`), aJson: path.join(dir, `A-${name}.json`), b: path.join(dir, `B-${name}.pdf`), expected: path.join(dir, `expected-${name}.json`) });

/**
 * Casos de una carpeta, con el mismo formato que run.mjs: la carpeta misma (A.pdf, A.json, B.pdf), subcarpetas con
 * esos archivos (como `pairs/<nombre>/`) o archivos planos `A-<caso>.pdf`, `A-<caso>.json`, `B-<caso>.pdf` y
 * `expected-<caso>.json` (como `sample-plano/`). Solo cuenta un caso si tiene A, plantilla y B.
 */
export async function listCases(dir) {
  const complete = async (c) => (await exists(c.a)) && (await exists(c.aJson)) && (await exists(c.b));
  const self = folderCase(dir);
  if (await complete(self)) return [self];
  const out = [];
  const entries = (await readdir(dir, { withFileTypes: true })).sort((x, y) => x.name.localeCompare(y.name));
  for (const d of entries) {
    if (d.isDirectory()) {
      const c = folderCase(path.join(dir, d.name));
      if (await complete(c)) out.push(c);
    }
  }
  for (const d of entries) {
    const m = d.isFile() ? /^A-(.+)\.pdf$/.exec(d.name) : null;
    if (!m) continue;
    const c = flatCase(dir, m[1]);
    if (await complete(c)) out.push(c);
  }
  return out;
}

/** Solución conocida: `[{ id, page, x, y } | { id, gone: true }]` → Map id → { page, x, y } | { gone: true }. */
export function truthMap(expected) {
  if (!Array.isArray(expected)) return null;
  const m = new Map();
  for (const e of expected) {
    if (!e || typeof e.id !== 'string') continue;
    if (e.gone === true) m.set(e.id, { gone: true });
    else if (Number.isFinite(e.page) && Number.isFinite(e.x) && Number.isFinite(e.y)) m.set(e.id, { page: e.page, x: e.x, y: e.y });
  }
  return m;
}

/** Suma el uso que dio el CLI en cada llamada. null en lo que ninguna llamada midió (no se inventa nada). */
export function usageOf(attempts = []) {
  const sum = (pick) => {
    const vals = attempts.map(pick).filter((v) => typeof v === 'number' && Number.isFinite(v));
    return vals.length ? vals.reduce((n, v) => n + v, 0) : null;
  };
  const measured = attempts.some((a) => a.usage);
  return {
    tokens: measured
      ? {
          input: sum((a) => a.usage?.input) ?? 0,
          output: sum((a) => a.usage?.output) ?? 0,
          cacheRead: sum((a) => a.usage?.cacheRead) ?? 0,
          cacheWrite: sum((a) => a.usage?.cacheWrite) ?? 0,
        }
      : null,
    aiCredits: sum((a) => a.aiCredits),
    premiumRequests: sum((a) => a.premiumRequests),
    costUsd: sum((a) => a.costUsd),
    cliSeconds: round1(sum((a) => a.seconds) ?? 0),
  };
}

export const tokenTotal = (t) => (t ? t.input + t.output + t.cacheRead + t.cacheWrite : null);

/**
 * Resultado de un caso a partir de lo que devuelve `runProposal`. `entries` = campos de A (flattenFields), `truth` =
 * truthMap o null. Los campos guardan solo id, mapField, páginas, coordenadas, origen y motivo en código.
 */
export function scoreCase({ name, textFirst, result, entries, truth, seconds }) {
  const fields = result.rows.map((r) => {
    const entry = entries.find((e) => e.id === r.id);
    const t = truth?.get(r.id) ?? null;
    const f = { id: r.id, mapField: entry?.field?.mapField ?? null, page: r.page, ok: r.ok };
    if (r.ok) Object.assign(f, { newPage: r.newPage, x: round1(r.x), y: round1(r.y), source: r.source, snapped: r.snapped });
    else f.why = r.why;
    if (t?.gone) f.truth = { gone: true, ok: !r.ok };
    else if (t) f.truth = { page: t.page, pageOk: r.ok && r.newPage === t.page, errPt: r.ok && r.newPage === t.page ? round1(Math.hypot(r.x - t.x, r.y - t.y)) : null };
    return f;
  });
  const placed = fields.filter((f) => f.ok);
  const notPlaced = {};
  for (const f of fields) if (!f.ok && f.why !== 'no_existe_en_b') notPlaced[f.why] = (notPlaced[f.why] ?? 0) + 1;
  const withPos = fields.filter((f) => f.truth && !f.truth.gone);
  const gone = fields.filter((f) => f.truth?.gone);
  const errs = withPos.map((f) => f.truth.errPt).filter((e) => e !== null).sort((a, b) => a - b);
  const d = result.details ?? {};
  return {
    case: name,
    textFirst,
    error: null,
    total: fields.length,
    placed: placed.length,
    placedWithoutAi: placed.filter((f) => f.source === 'text').length,
    placedByAi: placed.filter((f) => f.source !== 'text').length,
    absent: fields.filter((f) => !f.ok && f.why === 'no_existe_en_b').length,
    notPlaced,
    known: truth ? { withPosition: withPos.length, pageOk: withPos.filter((f) => f.truth.pageOk).length, within5: errs.filter((e) => e <= 5).length, within15: errs.filter((e) => e <= 15).length, medianErrPt: errs.length ? errs[Math.floor(errs.length / 2)] : null, gone: gone.length, goneOk: gone.filter((f) => f.truth.ok).length } : null,
    requests: d.requests ?? 0,
    ...usageOf(d.attempts),
    capReached: d.diagnosis === 'cap_reached',
    seconds: round1(seconds),
    fields,
  };
}

/** Caso que falló (límite, CLI ausente, imágenes no leídas…): solo el código, nunca el mensaje (puede citar el PDF). */
export const failedCase = ({ name, textFirst, error, seconds, total = null }) => ({ case: name, textFirst, error: { code: error?.code ?? 'error', reset: error?.reset ?? null }, total, seconds: round1(seconds), fields: [] });

/** Totales de una tanda (con o sin pase sin IA). Los casos fallidos solo cuentan como fallidos. */
export function totals(runs) {
  const ok = runs.filter((r) => !r.error);
  const sum = (pick) => ok.reduce((n, r) => n + (pick(r) ?? 0), 0);
  const sumOrNull = (pick) => (ok.some((r) => pick(r) !== null && pick(r) !== undefined) ? sum(pick) : null);
  const notPlaced = {};
  for (const r of ok) for (const [k, v] of Object.entries(r.notPlaced)) notPlaced[k] = (notPlaced[k] ?? 0) + v;
  const known = ok.filter((r) => r.known);
  return {
    cases: runs.length,
    failed: runs.length - ok.length,
    total: sum((r) => r.total),
    placed: sum((r) => r.placed),
    placedWithoutAi: sum((r) => r.placedWithoutAi),
    placedByAi: sum((r) => r.placedByAi),
    absent: sum((r) => r.absent),
    notPlaced,
    known: known.length
      ? {
          withPosition: known.reduce((n, r) => n + r.known.withPosition, 0),
          pageOk: known.reduce((n, r) => n + r.known.pageOk, 0),
          within5: known.reduce((n, r) => n + r.known.within5, 0),
          within15: known.reduce((n, r) => n + r.known.within15, 0),
          gone: known.reduce((n, r) => n + r.known.gone, 0),
          goneOk: known.reduce((n, r) => n + r.known.goneOk, 0),
        }
      : null,
    requests: sum((r) => r.requests),
    tokens: sumOrNull((r) => tokenTotal(r.tokens)),
    aiCredits: sumOrNull((r) => r.aiCredits),
    costUsd: sumOrNull((r) => r.costUsd),
    seconds: round1(runs.reduce((n, r) => n + (r.seconds ?? 0), 0)),
  };
}

const dash = (v) => (v === null || v === undefined ? '–' : String(v));
const frac = (a, b) => (b ? `${a}/${b}` : '–');
const reasons = (o) => {
  const parts = Object.entries(o ?? {}).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`);
  return parts.length ? parts.join(', ') : '0';
};
const notPlacedCount = (o) => Object.values(o ?? {}).reduce((n, v) => n + v, 0);
const money = (r) => {
  const parts = [];
  if (r.aiCredits !== null && r.aiCredits !== undefined) parts.push(`${round1(r.aiCredits * 100) / 100} cr.`);
  if (r.costUsd !== null && r.costUsd !== undefined) parts.push(`$${(Math.round(r.costUsd * 1000) / 1000).toFixed(3)}`);
  return parts.join(' · ') || '–';
};
const tokensOf = (r) => dash(r.tokens && typeof r.tokens === 'object' ? tokenTotal(r.tokens) : r.tokens);

const HEAD = '| Caso | Campos | Colocados | Sin IA | No existe en B | Sin colocar (motivo) | Página OK | ≤ 5 pt | ≤ 15 pt | Ausentes OK | Peticiones | Tokens | Créditos / coste | Segundos |';
const SEP = '| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |';

function row(r) {
  if (r.error) return `| ${r.case} | ${dash(r.total)} | ✖ ${r.error.code}${r.error.reset ? ` (renueva ${r.error.reset})` : ''} | | | | | | | | | | | ${r.seconds} |`;
  const k = r.known;
  const cap = r.capReached ? ' (tope)' : '';
  return `| ${r.case} | ${r.total} | ${r.placed} | ${r.placedWithoutAi} | ${r.absent} | ${notPlacedCount(r.notPlaced)}${notPlacedCount(r.notPlaced) ? `: ${reasons(r.notPlaced)}` : ''} | ${k ? frac(k.pageOk, k.withPosition) : '–'} | ${k ? frac(k.within5, k.withPosition) : '–'} | ${k ? frac(k.within15, k.withPosition) : '–'} | ${k ? frac(k.goneOk, k.gone) : '–'} | ${r.requests}${cap} | ${tokensOf(r)} | ${money(r)} | ${r.seconds} |`;
}

function totalRow(t) {
  const k = t.known;
  return `| **Total** (${t.cases} casos${t.failed ? `, ${t.failed} fallidos` : ''}) | ${t.total} | ${t.placed} | ${t.placedWithoutAi} | ${t.absent} | ${notPlacedCount(t.notPlaced)}${notPlacedCount(t.notPlaced) ? `: ${reasons(t.notPlaced)}` : ''} | ${k ? frac(k.pageOk, k.withPosition) : '–'} | ${k ? frac(k.within5, k.withPosition) : '–'} | ${k ? frac(k.within15, k.withPosition) : '–'} | ${k ? frac(k.goneOk, k.gone) : '–'} | ${t.requests} | ${tokensOf(t)} | ${money(t)} | ${t.seconds} |`;
}

const MODE_TITLE = { true: 'Con pase sin IA', false: 'Sin pase sin IA (`AI_HELPER_TEXT_FIRST=0`)' };
const pct = (saved, base) => (base ? ` (${Math.round((saved / base) * 100)} %)` : '');
const diff = (on, off) => (on === null || off === null || on === undefined || off === undefined ? '–' : `${off - on}${pct(off - on, off)}`);

/** Informe completo: { meta, modes: [{ textFirst, runs, totals }], comparison? }. */
export function buildReport(meta, runsByMode) {
  const modes = runsByMode.map(({ textFirst, runs }) => ({ textFirst, runs, totals: totals(runs) }));
  const on = modes.find((m) => m.textFirst === true);
  const off = modes.find((m) => m.textFirst === false);
  let comparison = null;
  if (on && off) {
    comparison = {
      cases: on.runs.map((r) => {
        const o = off.runs.find((x) => x.case === r.case);
        return { case: r.case, placed: [r.placed ?? null, o?.placed ?? null], requests: [r.requests ?? null, o?.requests ?? null], tokens: [tokenTotal(r.tokens), tokenTotal(o?.tokens)], seconds: [r.seconds, o?.seconds ?? null] };
      }),
      totals: { placed: [on.totals.placed, off.totals.placed], requests: [on.totals.requests, off.totals.requests], tokens: [on.totals.tokens, off.totals.tokens], seconds: [on.totals.seconds, off.totals.seconds] },
    };
  }
  return { meta, modes, comparison };
}

export function renderMarkdown(report) {
  const { meta } = report;
  const lines = [
    `# Banco de «Trasladar con IA» · ${meta.date}`,
    '',
    `- Motor: \`runProposal\` (tools/ai-helper/pipeline.mjs), el mismo que usa la app.`,
    `- Proveedor: **${meta.provider}**${meta.model ? ` · modelo \`${meta.model}\`` : ''} · reintento ${meta.retry ? 'sí' : 'no'} · tope ${meta.maxRequests} peticiones por PDF.`,
    `- Casos: ${meta.cases} (\`${meta.casesDir}\`).`,
    '- Aciertos (≤ 5 / ≤ 15 pt, página OK) solo con solución conocida y en la misma página; «Ausentes OK» = campos que ya no están en B y no se colocaron.',
    '- Tokens y créditos solo si el CLI los da (Claude: tokens y coste equivalente en API; Copilot: créditos aproximados del JSONL). «–» = no medido.',
  ];
  if (meta.stopped) lines.push('', `**Parado** (${meta.stopped}): los casos que faltan no se han ejecutado.`);
  for (const m of report.modes) {
    lines.push('', `## ${MODE_TITLE[m.textFirst]}`, '', HEAD, SEP, ...m.runs.map(row), totalRow(m.totals));
  }
  const c = report.comparison;
  if (c) {
    const pair = (v) => `${dash(v[0])} / ${dash(v[1])}`;
    lines.push('', '## Con / sin pase sin IA', '', '| Caso | Colocados | Peticiones | Tokens | Segundos |', '| --- | ---: | ---: | ---: | ---: |');
    for (const r of c.cases) lines.push(`| ${r.case} | ${pair(r.placed)} | ${pair(r.requests)} | ${pair(r.tokens)} | ${pair(r.seconds)} |`);
    lines.push(`| **Total** | ${pair(c.totals.placed)} | ${pair(c.totals.requests)} | ${pair(c.totals.tokens)} | ${pair(c.totals.seconds)} |`);
    lines.push('', `Ahorro del pase sin IA: ${diff(c.totals.requests[0], c.totals.requests[1])} peticiones, ${diff(c.totals.tokens[0], c.totals.tokens[1])} tokens; colocados ${c.totals.placed[0] - c.totals.placed[1] >= 0 ? '+' : ''}${c.totals.placed[0] - c.totals.placed[1]}.`);
  }
  lines.push('', 'Detalle por campo (id, mapField, página, x/y, origen y motivo; sin texto de los PDF) en el `.json` del mismo nombre.');
  return lines.join('\n') + '\n';
}

/** Marca de fecha para el nombre del archivo: 2026-11-20-103105 (hora local). */
export function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
