#!/usr/bin/env node
// Ayudante local de la IA: la app (navegador) no puede lanzar `claude` ni `copilot`, así que lo hace este proceso,
// solo en 127.0.0.1, solo para los orígenes de la app y con un token de cada arranque. Nunca va en el despliegue.
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { runProposal } from './pipeline.mjs';
import { PROVIDERS, findExecutable } from '../ai-phase0/providers.mjs';

const PORT = Number(process.env.AI_HELPER_PORT || 4310);
const ORIGINS = new Set((process.env.AI_HELPER_ORIGINS || 'http://localhost:4200,http://127.0.0.1:4200,http://localhost:4300,http://127.0.0.1:4300').split(','));
const MAX_BODY = 60 * 1024 * 1024;
const token = randomBytes(24).toString('hex');
let busy = false;

const providersInfo = () => ({
  claude: { label: PROVIDERS.claude.label, found: !!findExecutable('claude') },
  copilot: { label: PROVIDERS.copilot.label, found: !!findExecutable('copilot') },
  ...(process.env.AI_HELPER_FAKE === '1' ? { fake: { label: 'Simulado', found: true } } : {}),
});

function send(res, status, body, cors) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Petición demasiado grande.'), { code: 'too_big' }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  const host = (req.headers.host || '').split(':')[0];
  // Contra DNS rebinding: solo se atiende con Host de bucle local.
  if (host !== 'localhost' && host !== '127.0.0.1') return send(res, 403, { error: 'host' }, {});
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true }, {});
  const allowed = origin && ORIGINS.has(origin);
  const cors = allowed ? { 'access-control-allow-origin': origin, vary: 'origin', 'access-control-allow-headers': 'content-type, x-ai-token', 'access-control-allow-methods': 'GET, POST, OPTIONS' } : {};
  if (req.method === 'OPTIONS') return send(res, allowed ? 204 : 403, {}, cors);
  if (!allowed) return send(res, 403, { error: 'origin' }, {});
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/status') {
    return send(res, 200, { ok: true, version: 1, token, busy, providers: providersInfo() }, cors);
  }
  if (req.method === 'POST' && url.pathname === '/propose') {
    if (req.headers['x-ai-token'] !== token) return send(res, 401, { error: 'token' }, cors);
    if (busy) return send(res, 409, { error: 'busy' }, cors);
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return send(res, 400, { error: 'json' }, cors);
    }
    const { provider, a, b, template } = body ?? {};
    const model = typeof body?.model === 'string' && /^[\w.\-:\/\[\]]{1,60}$/.test(body.model) ? body.model : undefined;
    const maxAttempts = body?.retry === false ? 1 : 2;
    if (typeof a !== 'string' || typeof b !== 'string' || !template || !Array.isArray(template.pages)) return send(res, 400, { error: 'datos' }, cors);
    busy = true;
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', ...cors });
    const line = (o) => !res.writableEnded && res.write(JSON.stringify(o) + '\n');
    try {
      const result = await runProposal({
        provider,
        model,
        maxAttempts,
        aBytes: Buffer.from(a, 'base64'),
        bBytes: Buffer.from(b, 'base64'),
        template,
        keepApiKey: process.env.AI_HELPER_KEEP_API_KEY === '1',
        timeoutMs: Number(process.env.AI_HELPER_TIMEOUT || 300) * 1000,
        signal: ac.signal,
        onStage: (stage, n) => line({ stage, n }),
        onEvent: (event) => line({ event }),
      });
      line({ result });
    } catch (e) {
      line({ error: { code: e.code || 'error', message: String(e.message || e), reset: e.reset ?? null } });
    } finally {
      busy = false;
      if (!res.writableEnded) res.end();
    }
    return;
  }
  return send(res, 404, { error: 'ruta' }, cors);
});

server.listen(PORT, '127.0.0.1', () => {
  const p = providersInfo();
  console.log(`Ayudante IA en http://127.0.0.1:${PORT} (solo este equipo).`);
  for (const [k, v] of Object.entries(p)) console.log(`  ${k}: ${v.found ? 'encontrado' : 'NO encontrado en el PATH'}`);
  console.log('Déjalo abierto mientras uses la IA en la app. Ctrl+C para pararlo.');
});
