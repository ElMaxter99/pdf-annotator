// Cola propia del ayudante: lleva el lote en el proceso del ayudante para que sobreviva a recargas del navegador.
// Sin dependencias ni E/S: `run` (lanzar el CLI) se inyecta, así se prueba con un simulador.
// Reglas: concurrencia 2 con Claude (configurable de 1 a 2), siempre 1 con Copilot; un límite de uso pausa el lote
// y deja los pendientes «en cola» (no fallidos); 2 fallos seguidos del mismo tipo técnico lo pausan (cortacircuitos).

export const MAX_CLAUDE_CONCURRENCY = 2;
export const BREAKER_CODES = new Set(['cli_error', 'timeout', 'missing']);
export const BREAKER_STREAK = 2;
export const MAX_ITEMS_PER_BATCH = 200;
export const FINISHED_TTL_MS = 2 * 60 * 60 * 1000;

/** Cuántas peticiones a la vez admite cada proveedor. Copilot, siempre 1 (decisión de producto: sin picos de créditos). */
export function concurrencyFor(provider, env = process.env) {
  if (provider === 'copilot') return 1;
  const wanted = Math.trunc(Number(env.AI_HELPER_CONCURRENCY ?? MAX_CLAUDE_CONCURRENCY));
  if (!Number.isFinite(wanted)) return MAX_CLAUDE_CONCURRENCY;
  return Math.min(MAX_CLAUDE_CONCURRENCY, Math.max(1, wanted));
}

/** Semáforo por proveedor, compartido por `/propose` y el lote. */
export function createSlots(limitFor = concurrencyFor) {
  const used = new Map();
  return {
    /** Devuelve una función que libera el hueco, o null si el proveedor está al máximo. */
    acquire(provider) {
      const n = used.get(provider) ?? 0;
      if (n >= limitFor(provider)) return null;
      used.set(provider, n + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        used.set(provider, Math.max(0, (used.get(provider) ?? 1) - 1));
      };
    },
    used: (provider) => used.get(provider) ?? 0,
    max: limitFor,
    total: () => [...used.values()].reduce((a, b) => a + b, 0),
  };
}

const ITEM_ID = /^[\w.\-:]{1,80}$/;
export const validItemId = (id) => typeof id === 'string' && ITEM_ID.test(id);

/**
 * @param {object} o
 * @param {ReturnType<typeof createSlots>} o.slots
 * @param {(job: {provider: string, model?: string, retry: boolean, payload: any}, hooks: {signal: AbortSignal, onStage: Function, onEvent: Function}) => Promise<any>} o.run
 * @param {() => number} [o.now]
 * @param {() => string} o.newId
 */
export function createBatchQueue({ slots, run, now = Date.now, newId }) {
  const batches = new Map();
  const order = [];

  const touch = (batch) => {
    batch.rev += 1;
    batch.updatedAt = now();
  };

  function sweep() {
    for (const id of [...order]) {
      const b = batches.get(id);
      if (
        b &&
        b.state !== 'active' &&
        now() - b.updatedAt > FINISHED_TTL_MS &&
        ![...b.items.values()].some((i) => i.state === 'running')
      ) {
        batches.delete(id);
        order.splice(order.indexOf(id), 1);
      }
    }
  }

  function settle(batch) {
    if (batch.state === 'cancelled') return;
    const items = [...batch.items.values()];
    if (batch.closed && items.every((i) => i.state !== 'queued' && i.state !== 'running'))
      batch.state = 'done';
  }

  function pump() {
    for (const id of order) {
      const batch = batches.get(id);
      if (!batch || batch.state !== 'active' || batch.pausedReason) continue;
      for (const item of batch.items.values()) {
        if (item.state !== 'queued') continue;
        const release = slots.acquire(batch.provider);
        if (!release) break;
        start(batch, item, release);
        if (batch.pausedReason || batch.state !== 'active') break;
      }
    }
  }

  function start(batch, item, release) {
    const ac = new AbortController();
    item.controller = ac;
    item.state = 'running';
    item.stage = 'reading';
    item.attempt = null;
    item.startedAt = now();
    touch(batch);
    const payload = item.payload;
    Promise.resolve()
      .then(() =>
        run(
          { provider: batch.provider, model: batch.model, retry: batch.retry, payload },
          {
            signal: ac.signal,
            onStage: (stage, n) => {
              item.stage = stage;
              item.attempt = n ?? null;
              touch(batch);
            },
            onEvent: (event) => {
              if (event?.type === 'resolved')
                item.placed = { placed: event.placed, total: event.total };
              touch(batch);
            },
          },
        ),
      )
      .then(
        (result) => {
          if (item.state !== 'running') return;
          item.state = 'done';
          item.result = result;
          item.payload = null;
          item.finishedAt = now();
          batch.streak = { code: null, n: 0 };
        },
        (error) => {
          if (item.state !== 'running') return;
          const code = error?.code || 'error';
          item.finishedAt = now();
          if (code === 'aborted') {
            item.state = 'cancelled';
            item.payload = null;
            return;
          }
          if (code === 'limit') {
            // El límite no es culpa del PDF: vuelve a la cola y se pausa todo el lote hasta «Reanudar».
            item.state = 'queued';
            item.stage = null;
            batch.pausedReason = 'limit';
            batch.pausedInfo = { reset: error.reset ?? null, message: String(error.message ?? '') };
            return;
          }
          item.state = 'failed';
          item.error = {
            code,
            message: String(error?.message ?? error),
            reset: error?.reset ?? null,
            details: error?.details ?? null,
          };
          if (BREAKER_CODES.has(code)) {
            batch.streak =
              batch.streak.code === code ? { code, n: batch.streak.n + 1 } : { code, n: 1 };
            if (batch.streak.n >= BREAKER_STREAK) {
              batch.pausedReason = 'breaker';
              batch.pausedInfo = { code, message: item.error.message };
            }
          } else {
            batch.streak = { code: null, n: 0 };
          }
        },
      )
      .finally(() => {
        item.controller = null;
        release();
        settle(batch);
        touch(batch);
        pump();
      });
  }

  const publicItem = (item, withResult) => ({
    id: item.id,
    state: item.state,
    stage: item.stage,
    attempt: item.attempt,
    placed: item.placed ?? null,
    error: item.error ?? null,
    ...(withResult ? { result: item.result ?? null } : {}),
  });

  const snapshot = (batch) => {
    const items = [...batch.items.values()];
    const count = (s) => items.filter((i) => i.state === s).length;
    return {
      id: batch.id,
      rev: batch.rev,
      provider: batch.provider,
      state: batch.state,
      closed: batch.closed,
      paused: batch.pausedReason ? { reason: batch.pausedReason, ...batch.pausedInfo } : null,
      concurrency: slots.max(batch.provider),
      counts: {
        total: items.length,
        queued: count('queued'),
        running: count('running'),
        done: count('done'),
        failed: count('failed'),
        cancelled: count('cancelled'),
      },
      items: items.map((i) => publicItem(i, false)),
    };
  };

  return {
    create({ provider, model, retry = true }) {
      sweep();
      const batch = {
        id: newId(),
        provider,
        model,
        retry,
        state: 'active',
        closed: false,
        pausedReason: null,
        pausedInfo: null,
        streak: { code: null, n: 0 },
        items: new Map(),
        rev: 0,
        updatedAt: now(),
      };
      batches.set(batch.id, batch);
      order.push(batch.id);
      return snapshot(batch);
    },
    /** Añade pares (uno a uno, para no tener todos los PDF en el cuerpo de una sola petición). */
    add(batchId, itemId, payload, { last = false } = {}) {
      const batch = batches.get(batchId);
      if (!batch) return { error: 'not_found' };
      if (batch.state !== 'active' || batch.closed) return { error: 'closed' };
      if (!validItemId(itemId)) return { error: 'item_id' };
      if (batch.items.has(itemId)) return { error: 'duplicate' };
      if (batch.items.size >= MAX_ITEMS_PER_BATCH) return { error: 'too_many' };
      batch.items.set(itemId, {
        id: itemId,
        state: 'queued',
        stage: null,
        attempt: null,
        payload,
        result: null,
        error: null,
      });
      if (last) batch.closed = true;
      touch(batch);
      pump();
      return { ok: true };
    },
    close(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return null;
      batch.closed = true;
      settle(batch);
      touch(batch);
      return snapshot(batch);
    },
    get(batchId) {
      const batch = batches.get(batchId);
      return batch ? snapshot(batch) : null;
    },
    getItem(batchId, itemId) {
      const item = batches.get(batchId)?.items.get(itemId);
      return item ? publicItem(item, true) : null;
    },
    list() {
      sweep();
      return order
        .map((id) => batches.get(id))
        .filter(Boolean)
        .map(snapshot);
    },
    /** Reanuda tras un límite o el cortacircuitos; con `retryFailed` vuelven a la cola los fallidos que conservan sus datos. */
    resume(batchId, { retryFailed = false } = {}) {
      const batch = batches.get(batchId);
      if (!batch) return null;
      if (batch.state === 'active') {
        batch.pausedReason = null;
        batch.pausedInfo = null;
        batch.streak = { code: null, n: 0 };
        if (retryFailed)
          for (const i of batch.items.values())
            if (i.state === 'failed' && i.payload)
              Object.assign(i, { state: 'queued', error: null, stage: null });
        touch(batch);
        pump();
      }
      return snapshot(batch);
    },
    cancel(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return null;
      batch.state = 'cancelled';
      batch.closed = true;
      for (const i of batch.items.values()) {
        if (i.state === 'queued') {
          i.state = 'cancelled';
          i.payload = null;
        } else if (i.state === 'running') i.controller?.abort();
      }
      touch(batch);
      return snapshot(batch);
    },
    remove(batchId) {
      const batch = batches.get(batchId);
      if (!batch) return false;
      this.cancel(batchId);
      batches.delete(batchId);
      order.splice(order.indexOf(batchId), 1);
      return true;
    },
    /** Al apagar el ayudante: aborta todo lo que corra. */
    shutdown() {
      for (const id of order) this.cancel(id);
    },
    activeCount: () => order.filter((id) => batches.get(id)?.state === 'active').length,
  };
}
