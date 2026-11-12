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
        return { text: typeof j.result === 'string' ? j.result : stdout, meta: { costUsd: j.total_cost_usd, turns: j.num_turns, usage: j.usage, isError: j.is_error === true, permissionDenials: Array.isArray(j.permission_denials) ? j.permission_denials.length : 0, stopReason: j.stop_reason ?? j.subtype ?? null } };
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
    args: (opts = {}) => (process.env.COPILOT_ARGS ? JSON.parse(process.env.COPILOT_ARGS).map((a) => (a === '{{prompt}}' ? INSTRUCTION : a)) : ['-p', INSTRUCTION, '--allow-all-tools', ...(opts.model ? ['--model', opts.model] : [])]),
    extract: (stdout) => ({ text: stdout, meta: {} }),
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
