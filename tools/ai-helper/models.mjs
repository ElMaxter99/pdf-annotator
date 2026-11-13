// Lista de modelos de cada CLI, tal como la ofrece su propio selector (/model): nunca una lista fija de la app.
// Claude Code: la petición de control `initialize` del modo stream-json devuelve `models` sin gastar tokens.
// Copilot CLI: no tiene comando para listarlos; el servidor ACP (`copilot --acp`) los devuelve al abrir una sesión.
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { PROVIDERS, buildSpawn, findExecutable } from '../ai-phase0/providers.mjs';

const MAX_MODELS = 60;
const ID = /^[\w.\-:/[\]]{1,60}$/;

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');

function clean(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    if (!m.id || !ID.test(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}

/** `response.models` de la respuesta `initialize` de Claude Code. «default» es un alias del recomendado y se omite. */
export function parseClaudeModels(models) {
  if (!Array.isArray(models)) return [];
  return clean(
    models
      .filter((m) => m && typeof m === 'object' && m.value !== 'default')
      .map((m) => ({ id: text(m.value, 60), name: text(m.displayName, 60) || text(m.value, 60), description: text(m.description, 120), group: '' })),
  );
}

const GROUPS = [
  [/^claude/i, 'Anthropic'],
  [/^(gpt|o\d|codex)/i, 'OpenAI'],
  [/^gemini/i, 'Google'],
];

/** `result.models` de `session/new` en ACP: `{ availableModels: [{ modelId, name, description }], currentModelId }`. */
export function parseAcpModels(models) {
  const list = Array.isArray(models?.availableModels) ? models.availableModels : [];
  return clean(
    list
      .filter((m) => m && typeof m === 'object' && m.modelId !== 'auto')
      .map((m) => {
        const id = text(m.modelId, 60);
        return { id, name: text(m.name, 60) || id, description: text(m.description, 120), group: GROUPS.find(([re]) => re.test(id))?.[1] ?? '' };
      }),
  );
}

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

/** Lanza el CLI, le habla por stdin/stdout con líneas JSON y para en cuanto `onLine` devuelve un valor. */
function converse(provider, args, { onStart, onLine, env, timeoutMs, signal }) {
  const exe = findExecutable(PROVIDERS[provider].cmd);
  if (!exe) return Promise.reject(fail('missing', `No encuentro «${PROVIDERS[provider].cmd}» en el PATH.`));
  const sp = buildSpawn(exe, args);
  return new Promise((resolve, reject) => {
    const child = spawn(sp.file, sp.args, { ...sp.options, cwd: tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let buffer = '';
    let stderr = '';
    let done = false;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try {
        child.stdin.end();
        child.kill();
      } catch {
        /* ya terminado */
      }
      fn(value);
    };
    const onAbort = () => finish(reject, fail('aborted', 'Cancelado.'));
    const timer = setTimeout(() => finish(reject, fail('timeout', 'El CLI no respondió a tiempo.')), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    const send = (o) => child.stdin.write(JSON.stringify(o) + '\n');
    child.stdin.on('error', () => undefined);
    child.stderr.on('data', (c) => (stderr = (stderr + c).slice(-2000)));
    child.stdout.on('data', (c) => {
      buffer += c;
      let i;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, i).trim();
        buffer = buffer.slice(i + 1);
        if (!line.startsWith('{')) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        try {
          const r = onLine(msg, send);
          if (r !== undefined) return finish(resolve, r);
        } catch (e) {
          return finish(reject, e);
        }
      }
    });
    child.on('error', (e) => finish(reject, fail('cli_error', String(e.message))));
    child.on('close', () => finish(reject, fail(/log ?in|auth|sign/i.test(stderr) ? 'auth' : 'cli_error', stderr.trim().slice(-300) || 'El CLI terminó sin dar la lista.')));
    onStart(send);
  });
}

async function claudeModels(opts) {
  const env = PROVIDERS.claude.env(process.env, { keepApiKey: opts.keepApiKey });
  return converse('claude', ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
    ...opts,
    env,
    onStart: (send) => send({ type: 'control_request', request_id: 'models', request: { subtype: 'initialize' } }),
    onLine(msg) {
      if (msg.type !== 'control_response' || msg.response?.request_id !== 'models') return undefined;
      if (msg.response.subtype === 'error') throw fail('cli_error', text(msg.response.error, 300));
      return parseClaudeModels(msg.response.response?.models);
    },
  });
}

async function copilotModels(opts) {
  return converse('copilot', ['--acp', '--stdio'], {
    ...opts,
    env: { ...process.env },
    onStart: (send) => send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: 1, clientCapabilities: {} } }),
    onLine(msg, send) {
      if (msg.id === 1 && msg.result) {
        send({ jsonrpc: '2.0', id: 2, method: 'session/new', params: { cwd: tmpdir(), mcpServers: [] } });
      } else if (msg.id === 1 && msg.error) {
        throw fail('cli_error', text(msg.error.message, 300));
      } else if (msg.id === 2 && msg.error) {
        throw fail(/auth/i.test(String(msg.error.message)) ? 'auth' : 'cli_error', text(msg.error.message, 300));
      } else if (msg.id === 2 && msg.result) {
        return parseAcpModels(msg.result.models);
      }
      return undefined;
    },
  });
}

// Con AI_HELPER_FAKE=1 (e2e) no hace falta ningún CLI: las tres listas son fijas.
const FAKE = {
  fake: [
    { id: 'fake-small', name: 'Simulado pequeño', description: 'Modelo de prueba', group: '' },
    { id: 'fake-large', name: 'Simulado grande', description: 'Modelo de prueba', group: '' },
  ],
  claude: [
    { id: 'sonnet', name: 'Sonnet 5.5', description: 'Efficient for routine tasks', group: '' },
    { id: 'haiku', name: 'Haiku 5.5', description: 'Fastest for quick answers', group: '' },
    { id: 'opus', name: 'Opus 5.5', description: 'For complex tasks', group: '' },
  ],
  copilot: [
    { id: 'claude-sonnet-5.5', name: 'Claude Sonnet 5.5', description: '', group: 'Anthropic' },
    { id: 'gpt-6.1-sol', name: 'gpt-6.1-sol', description: '', group: 'OpenAI' },
  ],
};

/** `{ models: [{ id, name, description, group }] }`; lanza con `code`: missing, auth, timeout, aborted, cli_error. */
export async function listModels(provider, { timeoutMs = 20000, signal, keepApiKey = false } = {}) {
  if (provider !== 'claude' && provider !== 'copilot' && provider !== 'fake') throw fail('provider', 'Proveedor desconocido.');
  if (process.env.AI_HELPER_FAKE === '1') return { models: FAKE[provider] };
  if (provider === 'fake') throw fail('provider', 'Proveedor desconocido.');
  const opts = { timeoutMs, signal, keepApiKey };
  return { models: await (provider === 'claude' ? claudeModels(opts) : copilotModels(opts)) };
}
