import assert from 'node:assert/strict';
import { test } from 'node:test';
import { concurrencyFor, createBatchQueue, createSlots, FINISHED_TTL_MS } from './queue.mjs';

const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

/** Ejecutor simulado: cada llamada queda pendiente hasta que el test la resuelve o la rechaza. */
function harness(opts = {}) {
  const calls = [];
  let n = 0;
  let clock = 0;
  const slots = createSlots((p) => concurrencyFor(p, opts.env ?? {}));
  const queue = createBatchQueue({
    slots,
    newId: () => `b${++n}`,
    now: () => clock,
    run: (job, hooks) =>
      new Promise((resolve, reject) => {
        const call = { job, hooks, resolve, reject };
        calls.push(call);
        hooks.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('Cancelado.'), { code: 'aborted' })),
        );
      }),
  });
  return { calls, slots, queue, advance: (ms) => (clock += ms) };
}
const fill = (q, id, ids, closeLast = true) =>
  ids.forEach((x, i) => q.add(id, x, { a: x }, { last: closeLast && i === ids.length - 1 }));

test('concurrencia: Claude 2 (1 a 2 configurable), Copilot siempre 1', () => {
  assert.equal(concurrencyFor('claude', {}), 2);
  assert.equal(concurrencyFor('claude', { AI_HELPER_CONCURRENCY: '1' }), 1);
  assert.equal(concurrencyFor('claude', { AI_HELPER_CONCURRENCY: '9' }), 2);
  assert.equal(concurrencyFor('claude', { AI_HELPER_CONCURRENCY: 'x' }), 2);
  assert.equal(concurrencyFor('copilot', { AI_HELPER_CONCURRENCY: '2' }), 1);
});

test('semáforo: acquire se agota y release libera una sola vez', () => {
  const s = createSlots((p) => (p === 'copilot' ? 1 : 2));
  const r1 = s.acquire('claude');
  const r2 = s.acquire('claude');
  assert.equal(s.acquire('claude'), null);
  assert.ok(s.acquire('copilot'));
  r1();
  r1();
  assert.equal(s.used('claude'), 1);
  assert.ok(s.acquire('claude'));
  r2();
});

test('Claude lanza 2 a la vez y el resto espera su turno', async () => {
  const { calls, queue } = harness();
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2', 'p3', 'p4']);
  await settle();
  assert.equal(calls.length, 2);
  assert.equal(queue.get(id).counts.running, 2);
  calls[0].resolve({ rows: [] });
  await settle();
  assert.equal(calls.length, 3);
  calls[1].resolve({ rows: [] });
  calls[2].resolve({ rows: [] });
  await settle();
  calls[3].resolve({ rows: [1] });
  await settle();
  const snap = queue.get(id);
  assert.equal(snap.state, 'done');
  assert.equal(snap.counts.done, 4);
  assert.deepEqual(queue.getItem(id, 'p4').result, { rows: [1] });
});

test('Copilot nunca pasa de 1', async () => {
  const { calls, queue } = harness();
  const { id } = queue.create({ provider: 'copilot' });
  fill(queue, id, ['p1', 'p2', 'p3']);
  await settle();
  assert.equal(calls.length, 1);
  calls[0].resolve({});
  await settle();
  assert.equal(calls.length, 2);
});

test('los huecos se comparten con /propose', async () => {
  const { calls, queue, slots } = harness();
  const release = slots.acquire('claude');
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2']);
  await settle();
  assert.equal(calls.length, 1);
  release();
  queue.resume(id);
  await settle();
  assert.equal(calls.length, 2);
});

test('un límite pausa el lote y deja los pendientes en cola, no fallidos', async () => {
  const { calls, queue } = harness();
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2', 'p3']);
  await settle();
  calls[0].reject(Object.assign(new Error('límite'), { code: 'limit', reset: '18:30' }));
  await settle();
  let snap = queue.get(id);
  assert.equal(snap.paused.reason, 'limit');
  assert.equal(snap.paused.reset, '18:30');
  assert.equal(snap.counts.failed, 0);
  assert.equal(calls.length, 2, 'no se lanza ninguno más');
  calls[1].resolve({});
  await settle();
  assert.equal(calls.length, 2);
  queue.resume(id);
  await settle();
  assert.equal(calls.length, 4, 'p1 (devuelto a la cola) y p3');
  assert.equal(calls[2].job.payload.a, 'p1');
});

test('cortacircuitos: 2 fallos seguidos del mismo tipo pausan; uno distinto reinicia la racha', async () => {
  const { calls, queue } = harness({ env: { AI_HELPER_CONCURRENCY: '1' } });
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2', 'p3', 'p4']);
  await settle();
  calls[0].reject(Object.assign(new Error('x'), { code: 'timeout' }));
  await settle();
  calls[1].reject(Object.assign(new Error('x'), { code: 'cli_error' }));
  await settle();
  assert.equal(queue.get(id).paused, null, 'tipos distintos: racha reiniciada');
  calls[2].reject(Object.assign(new Error('x'), { code: 'cli_error' }));
  await settle();
  const snap = queue.get(id);
  assert.equal(snap.paused.reason, 'breaker');
  assert.equal(snap.counts.queued, 1);
  assert.equal(snap.counts.failed, 3);
  queue.resume(id, { retryFailed: true });
  await settle();
  assert.equal(queue.get(id).counts.failed, 0);
});

test('un fallo propio del PDF no pausa y la cola sigue', async () => {
  const { calls, queue } = harness({ env: { AI_HELPER_CONCURRENCY: '1' } });
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2']);
  await settle();
  calls[0].reject(Object.assign(new Error('sin leer'), { code: 'images_not_read' }));
  await settle();
  assert.equal(queue.get(id).paused, null);
  assert.equal(calls.length, 2);
  assert.equal(queue.getItem(id, 'p1').error.code, 'images_not_read');
});

test('cancelar aborta lo que corre y descarta lo que espera', async () => {
  const { calls, queue, slots } = harness();
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1', 'p2', 'p3']);
  await settle();
  queue.cancel(id);
  await settle();
  const snap = queue.get(id);
  assert.equal(snap.state, 'cancelled');
  assert.deepEqual(snap.counts, {
    total: 3,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    cancelled: 3,
  });
  assert.equal(calls.length, 2);
  assert.equal(slots.used('claude'), 0);
});

test('el lote sigue vivo sin cliente: el estado se consulta después', async () => {
  const { calls, queue } = harness();
  const { id } = queue.create({ provider: 'claude' });
  fill(queue, id, ['p1']);
  await settle();
  calls[0].hooks.onStage('asking', 2);
  assert.equal(queue.get(id).items[0].stage, 'asking');
  assert.equal(queue.get(id).items[0].attempt, 2);
  calls[0].resolve({ rows: [] });
  await settle();
  assert.equal(queue.list().length, 1);
  assert.equal(queue.get(id).state, 'done');
});

test('no se mezclan lotes de proveedores distintos y un lote sin hueco no bloquea al otro', async () => {
  const { calls, queue } = harness();
  const c = queue.create({ provider: 'copilot' }).id;
  const k = queue.create({ provider: 'claude' }).id;
  fill(queue, c, ['c1', 'c2'], false);
  fill(queue, k, ['k1'], false);
  await settle();
  assert.deepEqual(calls.map((x) => x.job.provider).sort(), ['claude', 'copilot']);
});

test('validaciones al añadir: duplicado, id raro, lote cerrado, desconocido', () => {
  const { queue } = harness();
  const { id } = queue.create({ provider: 'claude' });
  assert.equal(queue.add(id, 'p1', {}).ok, true);
  assert.equal(queue.add(id, 'p1', {}).error, 'duplicate');
  assert.equal(queue.add(id, '../x', {}).error, 'item_id');
  assert.equal(queue.add('nope', 'p2', {}).error, 'not_found');
  queue.close(id);
  assert.equal(queue.add(id, 'p2', {}).error, 'closed');
});

test('los lotes terminados caducan; los activos no', async () => {
  const { calls, queue, advance } = harness();
  const a = queue.create({ provider: 'claude' }).id;
  fill(queue, a, ['p1']);
  await settle();
  calls[0].resolve({});
  await settle();
  advance(FINISHED_TTL_MS + 1);
  const b = queue.create({ provider: 'claude' }).id;
  assert.equal(queue.get(a), null);
  assert.ok(queue.get(b));
});
