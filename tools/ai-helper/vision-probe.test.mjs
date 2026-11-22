// Prueba de vista del ayudante: imagen mínima con código y lado, veredicto y memoria por proveedor y modelo.
import assert from 'node:assert/strict';
import test from 'node:test';
import { drawProbe, ensureVision, forgetVision, judgeProbe } from './vision-probe.mjs';

const claudeOut = (text) => JSON.stringify({ type: 'result', result: text, num_turns: 1 });
const answer = (code, box) => async () => ({ ok: true, code: 0, seconds: 1, stderr: '', stdout: claudeOut(JSON.stringify({ code, box })) });

test('drawProbe da un PNG y judgeProbe exige el código (con la tolerancia de siempre) y el lado', () => {
  const png = drawProbe('K7F2', 'left');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(judgeProbe('{"code":"K7F2","box":"left"}', { code: 'K7F2', side: 'left' }).ok, true);
  assert.equal(judgeProbe('{"code":"K7FZ","box":"left"}', { code: 'K7F2', side: 'left' }).ok, true, 'Z/2 se confunden');
  assert.equal(judgeProbe('{"code":"K7F2","box":"right"}', { code: 'K7F2', side: 'left' }).ok, false, 'lado equivocado');
  assert.equal(judgeProbe('No puedo ver imágenes.', { code: 'K7F2', side: 'left' }).ok, false);
});

test('ensureVision: un modelo que ve pasa a la primera y se recuerda; uno solo de texto falla tras dos intentos', async () => {
  forgetVision();
  let calls = 0;
  const sees = async (...a) => (calls++, answer('ACEF', 'right')(...a));
  const ok = await ensureVision({ provider: 'claude', model: 'haiku', runCliImpl: sees, makeCode: () => 'ACEF', makeSide: () => 'right' });
  assert.deepEqual([ok.ok, ok.cached, calls], [true, false, 1]);
  const again = await ensureVision({ provider: 'claude', model: 'haiku', runCliImpl: sees });
  assert.deepEqual([again.ok, again.cached, calls], [true, true, 1], 'no se vuelve a preguntar');

  let blind = 0;
  const textOnly = async () => (blind++, { ok: true, code: 0, seconds: 1, stderr: '', stdout: claudeOut('No tengo acceso a imágenes.') });
  const no = await ensureVision({ provider: 'claude', model: 'solo-texto', runCliImpl: textOnly, makeCode: () => 'ACEF', makeSide: () => 'left' });
  assert.deepEqual([no.ok, no.attempts, blind], [false, 2, 2]);
  assert.equal((await ensureVision({ provider: 'claude', model: 'solo-texto', runCliImpl: textOnly })).cached, true);
});

test('ensureVision: si el CLI falla no se concluye nada (ok null, sin recordar) y lo cancelado se lanza', async () => {
  forgetVision();
  const broken = async () => ({ ok: false, code: 1, seconds: 1, stderr: 'boom', stdout: '' });
  const r = await ensureVision({ provider: 'claude', model: 'x', runCliImpl: broken });
  assert.equal(r.ok, null);
  assert.equal((await ensureVision({ provider: 'claude', model: 'x', runCliImpl: broken })).cached, false);
  await assert.rejects(ensureVision({ provider: 'claude', model: 'y', runCliImpl: async () => ({ aborted: true }) }), (e) => e.code === 'aborted');
});

test('runProposal se para con model_no_vision antes de gastar peticiones si el modelo no ve', async () => {
  forgetVision();
  const { runProposal } = await import('./pipeline.mjs');
  const { readFile } = await import('node:fs/promises');
  const dir = new URL('../ai-phase0/sample-plano/', import.meta.url);
  const load = async (c) => ({ aBytes: await readFile(new URL(`A-${c}.pdf`, dir)), bBytes: await readFile(new URL(`B-${c}.pdf`, dir)), template: JSON.parse(await readFile(new URL(`A-${c}.json`, dir), 'utf8')) });
  let calls = 0;
  const textOnly = async () => (calls++, { ok: true, code: 0, seconds: 1, stderr: '', stdout: claudeOut('Solo texto.') });
  process.env.AI_HELPER_TEXT_FIRST = '0';
  try {
    await assert.rejects(runProposal({ provider: 'claude', model: 'solo-texto', ...(await load('factura-desplazada')), runCliImpl: textOnly, visionProbe: true }), (e) => {
      assert.equal(e.code, 'model_no_vision');
      assert.equal(e.details.vision, 'failed');
      assert.equal(e.details.requests, 0, 'ninguna petición del traslado');
      return true;
    });
  } finally {
    delete process.env.AI_HELPER_TEXT_FIRST;
  }
  assert.equal(calls, 2, 'solo los dos intentos de la prueba de vista');
});
