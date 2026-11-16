// Prueba de extremo a extremo del ayudante con el proveedor simulado: la cola vive en el proceso, no en la conexión.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PORT = 4300 + Math.floor(Math.random() * 90) + 400;
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = 'http://localhost:4200';
const sample = (f) => fileURLToPath(new URL(`../ai-phase0/sample-plano/${f}`, import.meta.url));
const CASES = ['factura-desplazada', 'contrato-etiquetas-cambian', 'alta-banco-otra-pagina'];
let proc;
let token;

const call = async (path, { method = 'GET', body, auth = true } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      origin: ORIGIN,
      ...(auth ? { 'x-ai-token': token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

before(async () => {
  proc = spawn(process.execPath, [fileURLToPath(new URL('./server.mjs', import.meta.url))], {
    env: { ...process.env, AI_HELPER_FAKE: '1', AI_HELPER_PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      token = (await call('/status', { auth: false })).json.token;
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('El ayudante no arrancó');
});
after(() => proc?.kill());

test('exige token y origen en las rutas del lote', async () => {
  assert.equal((await call('/batch', { auth: false })).status, 401);
  const res = await fetch(`${BASE}/batch`, { headers: { origin: 'http://evil.example' } });
  assert.equal(res.status, 403);
});

test('un lote de 3 pares sale adelante y se puede consultar después', async () => {
  assert.equal((await call('/batch', { method: 'POST', body: { provider: 'nope' } })).status, 400);
  const created = await call('/batch', { method: 'POST', body: { provider: 'fake' } });
  assert.equal(created.status, 201);
  const id = created.json.id;
  assert.equal(created.json.concurrency, 2);
  for (const [i, c] of CASES.entries()) {
    const a = (await readFile(sample(`A-${c}.pdf`))).toString('base64');
    const b = (await readFile(sample(`B-${c}.pdf`))).toString('base64');
    const template = JSON.parse(await readFile(sample(`A-${c}.json`), 'utf8'));
    const r = await call(`/batch/${id}/items`, {
      method: 'POST',
      body: { itemId: `i${i}`, a, b, template, last: i === CASES.length - 1 },
    });
    assert.equal(r.status, 202, JSON.stringify(r.json));
  }
  let snap;
  for (let i = 0; i < 150; i++) {
    snap = (await call(`/batch/${id}`)).json;
    if (snap.state === 'done') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(snap.state, 'done');
  assert.deepEqual(snap.counts, {
    total: 3,
    queued: 0,
    running: 0,
    done: 3,
    failed: 0,
    cancelled: 0,
  });
  const item = (await call(`/batch/${id}/items/i0`)).json;
  assert.equal(item.state, 'done');
  assert.ok(item.result.rows.length > 0);
  assert.equal(
    (
      await call(`/batch/${id}/items`, {
        method: 'POST',
        body: { itemId: 'x', a: '', b: '', template: { pages: [] } },
      })
    ).status,
    409,
  );
  assert.equal((await call(`/batch/${id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await call(`/batch/${id}`)).status, 404);
});
