// Prueba de vista: antes de gastar peticiones grandes en un PDF, comprueba con una imagen mínima que el proveedor y el
// modelo elegidos LEEN imágenes y SITÚAN lo que ven (lo que necesita el traslado: leer las páginas y saber de qué lado
// está cada hueco). Un modelo solo de texto no pasa: se para con `model_no_vision` en vez de gastar tokens a ciegas.
// El resultado se recuerda por proveedor y modelo mientras viva el ayudante (una prueba por modelo, no por PDF).
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { codeWidth, createCanvas, drawCode, newCode } from '../ai-phase0/pdf.mjs';
import { describeImageCodes, parseJsonFromText } from '../ai-phase0/lib.mjs';
import { PROVIDERS, runCli } from '../ai-phase0/providers.mjs';

const cache = new Map();
export const visionKey = (provider, model) => `${provider}|${model ?? ''}`;
export const forgetVision = () => cache.clear();

/** Dibuja la imagen de prueba: el código grande arriba y un recuadro con una X abajo, a la izquierda o a la derecha. */
export function drawProbe(code, side) {
  const canvas = createCanvas(420, 220);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cell = 7;
  drawCode(ctx, code, Math.round((canvas.width - codeWidth(code, cell)) / 2), 24, cell);
  const x = side === 'left' ? 40 : canvas.width - 40 - 44;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, 140, 44, 44);
  ctx.beginPath();
  ctx.moveTo(x + 8, 148);
  ctx.lineTo(x + 36, 176);
  ctx.moveTo(x + 36, 148);
  ctx.lineTo(x + 8, 176);
  ctx.stroke();
  return canvas.toBuffer('image/png');
}

export const PROBE_PROMPT = [
  '# Prueba rápida de imagen',
  'Abre la imagen probe.png (una sola vez; no uses la terminal ni escribas archivos).',
  'Arriba hay un código de 4 caracteres muy grande. Abajo hay un cuadrado con una X, a la izquierda o a la derecha.',
  'Responde SOLO con este JSON, sin texto antes ni después:',
  '{"code":"<los 4 caracteres>","box":"left"}  (o "right" si el cuadrado está a la derecha)',
].join('\n');

/** ¿La respuesta demuestra que vio la imagen? Código (con la misma tolerancia que el traslado) y lado del recuadro. */
export function judgeProbe(text, { code, side }) {
  const data = parseJsonFromText(text, (d) => d && typeof d === 'object' && !Array.isArray(d) && 'code' in d);
  if (!data) return { ok: false, got: null };
  const codeOk = describeImageCodes({ images: { probe: String(data.code ?? '') } }, { probe: code }).missing.length === 0;
  const boxOk = String(data.box ?? '').toLowerCase() === side;
  return { ok: codeOk && boxOk, got: { code: String(data.code ?? '').slice(0, 8), box: String(data.box ?? '').slice(0, 8) } };
}

/**
 * Comprueba (o recuerda) que el modelo ve las imágenes. Devuelve `{ ok: true|false|null, cached, attempts }`:
 * `false` = probado dos veces con códigos distintos y no las ve (concluyente); `null` = no se pudo saber (fallo del CLI,
 * tiempo agotado…): no se recuerda y el traslado sigue, que ya informa de esos errores por su cuenta.
 */
export async function ensureVision({ provider, model, keepApiKey = false, timeoutMs = 120_000, signal, runCliImpl = runCli, makeCode = newCode, makeSide = () => (randomInt(2) ? 'left' : 'right') }) {
  const key = visionKey(provider, model);
  if (cache.has(key)) return { ...cache.get(key), cached: true };
  const work = await mkdtemp(path.join(os.tmpdir(), 'pdfann-vision-'));
  try {
    let attempts = 0;
    for (let i = 0; i < 2; i++) {
      attempts += 1;
      const code = makeCode();
      const side = makeSide();
      const png = path.join(work, 'probe.png');
      await writeFile(png, drawProbe(code, side));
      await writeFile(path.join(work, 'prompt.md'), PROBE_PROMPT);
      const run = await runCliImpl(provider, work, { model, keepApiKey, timeoutMs: Math.min(timeoutMs, 120_000), signal, quiet: true, attachments: [png], stream: false });
      if (run?.aborted) throw Object.assign(new Error('Cancelado.'), { code: 'aborted' });
      if (!run?.ok) return { ok: null, cached: false, attempts };
      const verdict = judgeProbe(PROVIDERS[provider].extract(run.stdout).text, { code, side });
      if (verdict.ok) {
        const result = { ok: true, attempts };
        cache.set(key, result);
        return { ...result, cached: false };
      }
    }
    const result = { ok: false, attempts };
    cache.set(key, result);
    return { ...result, cached: false };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
