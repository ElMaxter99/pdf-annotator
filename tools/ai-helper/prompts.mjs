// Prompts de «Trasladar con IA»: viven en Markdown en prompts/ (legibles y editables sin tocar JavaScript).
// Aquí solo se cargan y se rellenan sus {{marcadores}}; nada del PDF va en la línea de comandos, solo en prompt.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describePageMap, fillTemplate, stripTemplateComments } from '../ai-phase0/lib.mjs';
import { imageNames } from '../ai-phase0/passes.mjs';

export const PROMPT_NAMES = ['traslado', 'repregunta', 'reintento-imagenes', 'reintento-json'];
const DIR = new URL('./prompts/', import.meta.url);
let cache = null;

/** Lee (una vez) las plantillas sin sus comentarios. */
export function loadPrompts(dir = DIR) {
  if (cache && dir === DIR) return cache;
  const out = Object.fromEntries(PROMPT_NAMES.map((name) => [name, stripTemplateComments(readFileSync(fileURLToPath(new URL(`${name}.md`, dir)), 'utf8'))]));
  if (dir === DIR) cache = out;
  return out;
}

/** Rellena una plantilla por su nombre. */
export const renderPrompt = (name, vars, prompts = loadPrompts()) => fillTemplate(prompts[name], vars).replace(/\n{3,}/g, '\n\n');

const sizesOf = (pages, nums) => [...new Set(nums.map((n) => pages[n - 1]).filter(Boolean).map((p) => `${Math.round(p.width)}×${Math.round(p.height)}`))].join(' / ') || '?';

/**
 * prompt.md de una petición (pasada 1 o 2) con el aviso del reintento si lo hay.
 * @param {{pass: 1|2, pageA: number, pagesB: number[], notes: string[], fresh: boolean}} request
 * @param {{pagesA: Array<{width:number,height:number}>, pagesB: Array<{width:number,height:number}>, pageMap?: unknown, attached?: boolean}} ctx
 * @param {null | {kind: 'images'|'json', missing?: string[]}} retry
 */
export function requestPrompt(request, ctx, retry = null, prompts = loadPrompts()) {
  const images = imageNames(request);
  const aviso = !retry ? '' : retry.kind === 'images' ? renderPrompt('reintento-imagenes', { imagenes: (retry.missing ?? []).join(', ') }, prompts) : renderPrompt('reintento-json', {}, prompts);
  const vars = {
    paginaA: request.pageA,
    imagenA: `A-p${request.pageA}.png`,
    imagenesB: request.pagesB.map((p) => `B-p${p}.png`).join(', '),
    totalA: ctx.pagesA.length,
    totalB: ctx.pagesB.length,
    tamanoA: sizesOf(ctx.pagesA, [request.pageA]),
    tamanoB: sizesOf(ctx.pagesB, request.pagesB),
    tablaPaginas: describePageMap(ctx.pageMap).trimEnd(),
    adjuntas: ctx.attached ? 'Las imágenes ya vienen adjuntas a este mensaje: míralas ahí, no las abras con herramientas.\n\n' : '',
    listaImagenes: images.join(', '),
    ejemploImagenes: JSON.stringify(Object.fromEntries(images.map((n) => [n, 'XXXX']))),
    aviso: aviso ? `\n${aviso}` : '',
  };
  if (request.pass === 1) return renderPrompt('traslado', vars, prompts);
  return renderPrompt(
    'repregunta',
    {
      ...vars,
      novedad: request.fresh
        ? `Ahora van páginas de B que aún no habías visto (${request.pagesB.map((p) => `B-p${p}`).join(', ')}): búscalos en ellas.`
        : 'Son las mismas páginas de B que ya viste: lee el motivo de cada campo y corrige la respuesta.',
      motivos: request.notes.join('\n') || '- (sin detalle)',
    },
    prompts,
  );
}
