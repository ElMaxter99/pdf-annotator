// Lanzadores de los dos CLI. El prompt va SIEMPRE en prompt.md dentro de la carpeta de trabajo:
// la línea de comandos solo lleva texto fijo, nunca contenido del PDF.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const INSTRUCTION = 'Lee el archivo prompt.md de esta carpeta y sigue sus instrucciones. Responde solo con el JSON pedido.';
const win = process.platform === 'win32';

/** Con stream-json, la línea del evento final `{"type":"result",…}`; con json normal, todo el texto. */
export function finalResultLine(stdout) {
  const lines = String(stdout ?? '').trim().split('\n');
  if (lines.length > 1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"type":"result"')) continue;
      try {
        if (JSON.parse(lines[i])?.type === 'result') return lines[i];
      } catch {
        // línea que no es el evento final
      }
    }
  }
  return String(stdout ?? '');
}

/** Un evento de stream-json de Claude → paso legible para la persona (o null si no aporta). Nunca incluye contenido de los PDF. */
export function describeClaudeEvent(line) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j?.type === 'assistant') {
    const out = [];
    for (const c of j.message?.content ?? []) {
      if (c.type === 'tool_use') out.push({ kind: 'read', file: String(c.input?.file_path ?? '').split(/[\\/]/).pop().slice(0, 60), tool: String(c.name).slice(0, 30) });
      else if (c.type === 'text' && c.text) out.push({ kind: 'answer', chars: c.text.length });
    }
    const u = j.message?.usage;
    return { id: typeof j.message?.id === 'string' ? j.message.id : null, steps: out, usage: u ? { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 } : null };
  }
  return null;
}

/** Uso total de la ejecución: `modelUsage` suma todos los turnos; `usage` puede reflejar solo el último. */
export function totalUsage(j) {
  const models = j?.modelUsage && typeof j.modelUsage === 'object' ? Object.values(j.modelUsage) : [];
  if (models.length) {
    const sum = (k) => models.reduce((n, m) => n + (Number(m?.[k]) || 0), 0);
    return { input_tokens: sum('inputTokens'), output_tokens: sum('outputTokens'), cache_read_input_tokens: sum('cacheReadInputTokens'), cache_creation_input_tokens: sum('cacheCreationInputTokens') };
  }
  return j?.usage;
}

/** Líneas JSONL de `copilot --output-format json` → objetos (ignora lo que no sea JSON). */
function jsonLines(stdout) {
  const out = [];
  for (const l of String(stdout ?? '').split('\n')) {
    const t = l.trim();
    if (!t.startsWith('{')) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* línea parcial */
    }
  }
  return out;
}

/** Consumo acumulado que Copilot anota en `session.usage_checkpoint` (tokens por tipo y AI credits ≈ totalNanoAiu / 1e9). */
function copilotUsageFrom(d) {
  if (!d || typeof d !== 'object') return null;
  const t = d.accountingSnapshot?.tokenDetails ?? {};
  const n = (k) => Number(t[k]?.tokenCount) || 0;
  const nano = Number(d.totalNanoAiu);
  return {
    usage: { input: n('input'), output: n('output'), cacheRead: n('cache_read'), cacheWrite: n('cache_write') },
    aiCredits: Number.isFinite(nano) && nano > 0 ? Math.round(nano / 1e6) / 1e3 : null,
    premiumRequests: Number.isFinite(Number(d.totalPremiumRequests)) ? Number(d.totalPremiumRequests) : null,
  };
}

/** Un evento JSONL de Copilot → pasos legibles y consumo acumulado (o null). Nunca incluye contenido de los PDF. */
export function describeCopilotEvent(line) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j?.type === 'assistant.message') {
    const steps = [];
    for (const r of j.data?.toolRequests ?? []) {
      const a = r?.arguments ?? {};
      const file = String(a.path ?? a.file_path ?? a.filePath ?? '').split(/[\\/]/).pop().slice(0, 60);
      steps.push({ kind: 'read', file, tool: String(r?.name ?? 'tool').slice(0, 30) });
    }
    if (typeof j.data?.content === 'string' && j.data.content) steps.push({ kind: 'answer', chars: j.data.content.length });
    return steps.length ? { steps, usage: null, cumulative: null } : null;
  }
  if (j?.type === 'session.usage_checkpoint') {
    const u = copilotUsageFrom(j.data);
    return u ? { steps: [], usage: u.usage, cumulative: u } : null;
  }
  return null;
}

/** Salida completa de `copilot --output-format json`: texto de la respuesta final y consumo real. `null` si no es JSONL de Copilot. */
export function parseCopilotJsonl(stdout) {
  const events = jsonLines(stdout);
  if (!events.some((e) => typeof e?.type === 'string')) return null;
  let text = '';
  let cum = null;
  let result = null;
  for (const e of events) {
    if (e.type === 'assistant.message' && typeof e.data?.content === 'string' && e.data.content.trim()) text = e.data.content;
    else if (e.type === 'session.usage_checkpoint') cum = copilotUsageFrom(e.data) ?? cum;
    else if (e.type === 'result') result = e;
  }
  const prem = Number(result?.usage?.premiumRequests);
  return {
    text,
    usage: cum?.usage ?? null,
    aiCredits: cum?.aiCredits ?? null,
    premiumRequests: Number.isFinite(prem) ? prem : cum?.premiumRequests ?? null,
    exitCode: typeof result?.exitCode === 'number' ? result.exitCode : null,
  };
}

export const PROVIDERS = {
  claude: {
    label: 'Claude Code (claude -p)',
    cmd: 'claude',
    // `opts.stream` (ayudante de la app): stream-json emite un evento por línea (pasos, lecturas, uso) para verlo en vivo.
    args: (opts = {}) => ['-p', INSTRUCTION, '--output-format', opts.stream ? 'stream-json' : 'json', ...(opts.stream ? ['--verbose'] : []), '--allowedTools', 'Read', ...(opts.model ? ['--model', opts.model] : [])],
    // Con --output-format json el texto de la respuesta viene en `result`; con stream-json, en el último evento `result`.
    extract(stdout) {
      try {
        const j = JSON.parse(finalResultLine(stdout));
        return { text: typeof j.result === 'string' ? j.result : stdout, meta: { costUsd: j.total_cost_usd, turns: j.num_turns, usage: totalUsage(j), isError: j.is_error === true, permissionDenials: Array.isArray(j.permission_denials) ? j.permission_denials.length : 0, stopReason: j.stop_reason ?? j.subtype ?? null } };
      } catch {
        return { text: stdout, meta: {} };
      }
    },
    // Para usar la suscripción hay que quitar la clave de API del entorno (si existe, el CLI cobra por API).
    env: (base, { keepApiKey }) => {
      const env = { ...base };
      if (!keepApiKey) delete env.ANTHROPIC_API_KEY;
      return env;
    },
  },
  copilot: {
    label: 'Copilot CLI (copilot -p)',
    cmd: 'copilot',
    // Banderas SIN VERIFICAR contra tu versión: si fallan, ajusta con COPILOT_ARGS='["-p","...","--allow-all-tools"]'.
    // Cada PNG se adjunta con `--attachment=<archivo>` (verificado con un PNG; `COPILOT_ATTACH_IMAGES=0` lo desactiva).
    args: (opts = {}) =>
      process.env.COPILOT_ARGS
        ? JSON.parse(process.env.COPILOT_ARGS).map((a) => (a === '{{prompt}}' ? INSTRUCTION : a))
        : [
            '-p',
            opts.instruction ?? INSTRUCTION,
            '--allow-all-tools',
            // Sin terminal: gastaba decenas de llamadas `bash` explorando y multiplicaba el consumo. La denegación gana a --allow-all-tools; `COPILOT_ALLOW_SHELL=1` la quita.
            ...(process.env.COPILOT_ALLOW_SHELL === '1' ? [] : ['--deny-tool=shell']),
            ...(opts.stream ? ['--output-format', 'json'] : []),
            ...(opts.model ? ['--model', opts.model] : []),
            ...(process.env.COPILOT_ATTACH_IMAGES === '0' ? [] : (opts.attachments ?? []).map((f) => `--attachment=${f}`)),
          ],
    // Con --output-format json (ayudante) llega JSONL con el consumo real; sin él, texto plano y sin cifras.
    extract(stdout) {
      const p = parseCopilotJsonl(stdout);
      if (!p) return { text: stdout, meta: {} };
      return { text: p.text || stdout, meta: { usage: p.usage ? { input_tokens: p.usage.input, output_tokens: p.usage.output, cache_read_input_tokens: p.usage.cacheRead, cache_creation_input_tokens: p.usage.cacheWrite } : undefined, aiCredits: p.aiCredits, premiumRequests: p.premiumRequests, isError: p.exitCode != null && p.exitCode !== 0 && !p.text } };
    },
    env: (base) => ({ ...base }),
  },
};

// En Windows las instalaciones por npm dejan `claude.cmd` y los .cmd no se pueden lanzar sin shell. Para no usar
// `shell: true` (concatena argumentos sin escapar), se busca el ejecutable en el PATH y, si es un .cmd, se llama a
// `cmd.exe /d /s /c` con una línea de comandos que montamos nosotros. Los argumentos son siempre texto fijo del script.
export function findExecutable(name, env = process.env) {
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  const exts = win ? ['.exe', '.com', '.cmd', '.bat'] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

export const quote = (s) => (/[\s&()^%!|<>"]/.test(s) ? `"${String(s).replaceAll('"', '\\"')}"` : s);

export function buildSpawn(exe, args) {
  if (win && /\.(cmd|bat)$/i.test(exe)) {
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[quote(exe), ...args.map(quote)].join(' ')}"`], options: { windowsVerbatimArguments: true } };
  }
  return { file: exe, args, options: {} };
}

function killTree(child) {
  if (win && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  else child.kill();
}

export function runCli(name, cwd, opts = {}) {
  const p = PROVIDERS[name];
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  return new Promise((resolve) => {
    const exe = findExecutable(p.cmd);
    if (!exe) {
      resolve({ ok: false, seconds: 0, stdout: '', stderr: `No encuentro «${p.cmd}» en el PATH. Instálalo e inicia sesión una vez a mano (escribe «${p.cmd}» en la terminal).`, code: -1 });
      return;
    }
    const started = Date.now();
    const sp = buildSpawn(exe, p.args(opts));
    const child = spawn(sp.file, sp.args, { cwd, env: p.env(process.env, opts), stdio: ['ignore', 'pipe', 'pipe'], ...sp.options });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);
    const beat = opts.quiet ? null : setInterval(() => process.stdout.write('.'), 10_000);
    let aborted = false;
    const onAbort = () => {
      aborted = true;
      killTree(child);
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    let lineBuf = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      if (!opts.onLine) return;
      lineBuf += d;
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) opts.onLine(l);
    });
    child.stderr.on('data', (d) => (stderr += d));
    const done = (res) => {
      clearTimeout(timer);
      if (beat) clearInterval(beat);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve(res);
    };
    child.on('error', (e) => done({ ok: false, seconds: 0, stdout, stderr: String(e.message), code: -1 }));
    child.on('close', (code) => {
      if (opts.onLine && lineBuf.trim()) opts.onLine(lineBuf);
      lineBuf = '';
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      if (aborted) {
        done({ ok: false, seconds, stdout, stderr, code: -3, aborted: true });
        return;
      }
      if (timedOut) {
        done({ ok: false, seconds, stdout, code: -2, stderr: `Tiempo agotado: «${p.cmd}» no respondió en ${Math.round(timeoutMs / 1000)} s. Ejecuta «${p.cmd}» a mano, comprueba que la sesión está iniciada y que no pide confirmaciones; sube el límite con --timeout <segundos>.\n${stderr}` });
        return;
      }
      done({ ok: code === 0, seconds, stdout, stderr, code });
    });
  });
}

// Detecta que la suscripción ha llegado a su límite de uso (Claude devuelve 429 `usage_limit_reached`).
// Devuelve un mensaje claro en español con la hora de reinicio, o null si el error es otro.
export function detectLimit(stdout, stderr = '') {
  const text = `${stdout}\n${stderr}`;
  let result = '';
  try {
    const j = JSON.parse(stdout);
    if (j && (j.api_error === 'usage_limit_reached' || j.api_error_status === 429)) result = String(j.result ?? '');
    else if (j && /hit your .*limit/i.test(String(j.result ?? ''))) result = String(j.result);
  } catch {
    const m = text.match(/"result":"([^"]*limit[^"]*)"/i);
    if (m) result = m[1];
    else if (/usage_limit_reached/.test(text)) result = text.match(/You've hit your[^"\n]*/)?.[0] ?? 'limit';
  }
  if (!result) return null;
  const reset = result.match(/resets?\s+(?:at\s+)?(.+)$/i)?.[1]?.trim();
  const which = /5-hour/i.test(result) ? ' de 5 horas' : /week/i.test(result) ? ' semanal' : '';
  return `Tu suscripción ha llegado al límite${which}.${reset ? ` Se renueva a las ${reset}.` : ''} Vuelve a ejecutarlo entonces, o prueba con --provider copilot.`;
}
