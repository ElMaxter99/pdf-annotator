// Lanzadores de los dos CLI. El prompt va SIEMPRE en prompt.md dentro de la carpeta de trabajo:
// la línea de comandos solo lleva texto fijo, nunca contenido del PDF.
import { spawn } from 'node:child_process';

const INSTRUCTION = 'Lee el archivo prompt.md de esta carpeta y sigue sus instrucciones. Responde solo con el JSON pedido.';
const win = process.platform === 'win32';

export const PROVIDERS = {
  claude: {
    label: 'Claude Code (claude -p)',
    cmd: 'claude',
    args: () => ['-p', quote(INSTRUCTION), '--output-format', 'json', '--allowedTools', 'Read'],
    // Con --output-format json el texto de la respuesta viene en `result`.
    extract(stdout) {
      try {
        const j = JSON.parse(stdout);
        return { text: typeof j.result === 'string' ? j.result : stdout, meta: { costUsd: j.total_cost_usd, turns: j.num_turns, usage: j.usage } };
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
    args: () => (process.env.COPILOT_ARGS ? JSON.parse(process.env.COPILOT_ARGS).map((a) => (a === '{{prompt}}' ? quote(INSTRUCTION) : a)) : ['-p', quote(INSTRUCTION), '--allow-all-tools']),
    extract: (stdout) => ({ text: stdout, meta: {} }),
    env: (base) => ({ ...base }),
  },
};

function quote(s) {
  return win ? `"${s}"` : s;
}

export function runCli(name, cwd, opts = {}) {
  const p = PROVIDERS[name];
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(p.cmd, p.args(), { cwd, env: p.env(process.env, opts), shell: win, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), opts.timeoutMs ?? 10 * 60 * 1000);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, seconds: 0, stdout, stderr: String(e.message), code: -1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, seconds: Math.round((Date.now() - started) / 100) / 10, stdout, stderr, code });
    });
  });
}
