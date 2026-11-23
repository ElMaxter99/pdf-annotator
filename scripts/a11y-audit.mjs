// Auditoría de accesibilidad con axe. Genera un JSON con los hallazgos y un resumen en consola.
// Uso: npm run build && npm run a11y   (o: node scripts/a11y-audit.mjs --out=ruta.json)
//   --fail-on=serious (lo usa el CI, `npm run a11y:ci`): sale con código 1 si hay hallazgos serios o críticos o si
//   un escenario no se pudo auditar.
//   PW_CHROMIUM=<ruta> usa un Chromium ya instalado; A11Y_PORT cambia el puerto (por defecto 4377).
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.A11Y_PORT ?? 4377);
const BASE = `http://127.0.0.1:${PORT}`;
const PDF = join(root, 'examples', 'factura-ejemplo.pdf');
const pdf = readFileSync(PDF);
const out = (process.argv.find((a) => a.startsWith('--out=')) ?? '--out=a11y-audit.json').slice(6);
const failOn = process.argv.find((a) => a.startsWith('--fail-on='))?.slice(10) ?? null;
const FAIL_IMPACTS = { critical: ['critical'], serious: ['serious', 'critical'] };
const WIDTHS = [1650, 1280];
const THEMES = ['dark', 'light'];

const server = spawn(process.execPath, ['e2e/static-server.mjs', 'dist/pdf-annotator/browser'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* aún no */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('El servidor estático no arrancó (¿has ejecutado `npm run build`?)');
}

/** Puente de escritorio mínimo sobre el código real de `desktop/projects-ipc.mjs` y una carpeta temporal. */
async function withDesktopProjects(page) {
  const userData = mkdtempSync(join(os.tmpdir(), 'pa-a11y-ud-'));
  const documents = mkdtempSync(join(os.tmpdir(), 'pa-a11y-docs-'));
  const base = join(documents, 'PDF Annotator');
  const make = (ref, name, lock) => {
    const dir = join(base, ...ref.split('/'));
    mkdirSync(join(dir, 'batch'), { recursive: true });
    writeFileSync(
      join(dir, 'project.json'),
      JSON.stringify({ v: 1, id: ref, name, createdAt: 1, updatedAt: 2 }),
    );
    if (lock) writeFileSync(join(dir, '.lock'), JSON.stringify(lock));
  };
  make('Ana/Cliente 1', 'Cliente 1');
  make('Ana/Cliente 2', 'Cliente 2', {
    host: 'OTRO-PC',
    token: 'x',
    since: Date.now(),
    seen: Date.now(),
  });
  const { setupProjectsIpc } = await import('../desktop/projects-ipc.mjs');
  const handlers = new Map();
  setupProjectsIpc({
    handle: (channel, fn) => handlers.set(channel, fn),
    app: { getPath: (n) => (n === 'documents' ? documents : userData), getVersion: () => '9.9.9' },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
    },
    shell: { showItemInFolder: () => undefined, openPath: async () => '' },
    safeStorage: {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (t) => Buffer.from(t),
      decryptString: (b) => b.toString(),
    },
    getWindow: () => ({ webContents: { send: () => undefined } }),
  });
  await page.exposeFunction('__projectsCall', async (channel, payload) => {
    const result = await handlers.get(channel)?.(...JSON.parse(payload));
    return JSON.stringify(result ?? null);
  });
  await page.addInitScript(() => {
    const w = window;
    const call = async (channel, ...args) =>
      JSON.parse(await w.__projectsCall(channel, JSON.stringify(args)));
    const channels = {
      info: 'projects:info',
      chooseRoot: 'projects:choose-root',
      list: 'projects:list',
      create: 'projects:create',
      open: 'projects:open',
      saveItem: 'projects:save-item',
      removeItem: 'projects:remove-item',
      renew: 'projects:renew',
      release: 'projects:release',
      rename: 'projects:rename',
      forget: 'projects:forget',
      revealFolder: 'projects:reveal-folder',
      importTarget: 'projects:import-target',
      exportInfo: 'projects:export-info',
      exportProject: 'projects:export',
      reveal: 'projects:reveal',
      cancel: 'projects:cancel',
      importInspect: 'projects:import-inspect',
      importRun: 'projects:import-run',
      syncStatus: 'sync:status',
      syncChoose: 'sync:choose',
      syncLink: 'sync:link',
      syncUnlink: 'sync:unlink',
      syncAll: 'sync:all',
      syncProject: 'sync:project',
      syncReveal: 'sync:reveal',
    };
    const projects = Object.fromEntries(
      Object.entries(channels).map(([m, c]) => [m, (i) => call(c, i)]),
    );
    projects.onSyncEvent = () => () => undefined;
    projects.onProgress = () => () => undefined;
    projects.pathForFile = () => '';
    w.desktop = {
      isDesktop: true,
      helperPort: 4310,
      projects,
      getUpdateState: async () => ({ status: 'idle', mode: 'manual', current: '1.15.0' }),
      onUpdateState: () => () => undefined,
      storage: {
        list: async () => ({
          entries: [
            { id: 'projects', group: 'work', path: '~/PDF Annotator', clearable: false, canOpen: true },
            { id: 'editor-data', group: 'work', path: '~/.config/pdf/IndexedDB', clearable: false, canOpen: true },
            { id: 'program', group: 'app', path: '/opt/pdf-annotator', clearable: false, canOpen: true },
            { id: 'settings', group: 'app', path: '~/.config/pdf', clearable: false, canOpen: true },
            { id: 'browser-cache', group: 'clearable', path: '~/.config/pdf/Cache', clearable: true, canOpen: true },
            { id: 'update-downloads', group: 'clearable', path: '~/.cache/pdf-updater', clearable: true, canOpen: true },
            { id: 'ai-temp', group: 'clearable', path: '/tmp/pdfann-ia-*', clearable: true, canOpen: true },
            { id: 'update-log', group: 'clearable', path: '~/.config/pdf/update.log', clearable: true, canOpen: true },
          ],
        }),
        size: async () => ({ bytes: 12_345_678, partial: false, exists: true }),
        clear: async () => ({ ok: true, freed: 12_345_678 }),
        reveal: async () => '',
      },
    };
  });
}

async function newPage(browser, { theme, width, desktop = false }) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'es-ES' });
  await context.addInitScript((mode) => {
    if (sessionStorage.getItem('a11y-ready')) return;
    sessionStorage.setItem('a11y-ready', '1');
    localStorage.setItem('pdf-annotator.language', 'es-ES');
    localStorage.setItem('pdf-annotator-theme', mode);
    localStorage.setItem('pdf-annotator.guide.steps', '1');
    localStorage.setItem('pdf-annotator.guide.hint', '1');
    localStorage.setItem('pdf-annotator.zoomHint', '1');
  }, theme);
  await context.route('**/_vercel/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  const page = await context.newPage();
  if (desktop) await withDesktopProjects(page);
  return { page, context };
}

const file = (name) => ({ name, mimeType: 'application/pdf', buffer: pdf });
const settle = (page, ms = 600) => page.waitForTimeout(ms);
const clickTab = (page, name) => page.getByRole('tab', { name: new RegExp(`^\\s*${name}`) }).click();

/** Cada escenario lleva la página a varios estados y llama a `audit(etiqueta)` en cada uno. */
const scenarios = [
  {
    name: 'landing',
    run: async (page, audit) => {
      await page.goto(`${BASE}/landing`);
      await settle(page);
      await audit('landing');
    },
  },
  {
    name: 'editor',
    run: async (page, audit) => {
      await page.goto(`${BASE}/landing`);
      await page.locator('input[type=file]').setInputFiles(PDF);
      await page.waitForURL('**/workspace');
      await page.locator('.canvas--pdf').waitFor();
      await settle(page, 1200);
      for (const tab of ['Documento', 'Anotaciones', 'Ajustes']) {
        await clickTab(page, tab);
        await settle(page, 300);
        await audit(`editor · pestaña ${tab}`);
      }
      await clickTab(page, 'Anotaciones');
      const box = await page.locator('.hitbox').boundingBox();
      await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.2);
      await settle(page, 400);
      await audit('editor · editor de anotación abierto');
    },
  },
  {
    name: 'lote',
    run: async (page, audit) => {
      await page.goto(`${BASE}/landing`);
      await page.locator('input[type=file]').setInputFiles([file('a-0001.pdf'), file('a-0002.pdf')]);
      await page.waitForURL('**/lote');
      await settle(page);
      await audit('lote · paso 1');
      await page.getByTestId('next-templates').click();
      await settle(page, 300);
      await audit('lote · paso 2');
      await page.getByTestId('open-panel').click();
      await page.getByTestId('panel-item').first().waitFor();
      await settle(page);
      await audit('lote · panel');
    },
  },
  {
    name: 'proyectos',
    desktop: true,
    run: async (page, audit) => {
      await page.goto(`${BASE}/proyectos`);
      await page.getByTestId('project-card').first().waitFor();
      await settle(page, 400);
      await audit('proyectos · lista');
    },
  },
  {
    name: 'almacenamiento',
    desktop: true,
    run: async (page, audit) => {
      await page.goto(`${BASE}/proyectos`);
      await page.getByTestId('project-card').first().waitFor();
      await page.getByTestId('storage-link').click();
      await page.getByTestId('storage-size-projects').filter({ hasText: 'MB' }).waitFor();
      await settle(page, 400);
      await audit('almacenamiento · panel');
      await page.getByTestId('storage-clear-browser-cache').click();
      await page.getByTestId('storage-confirm').waitFor();
      await settle(page, 300);
      await audit('almacenamiento · confirmar vaciado');
    },
  },
];

const results = [];
await waitForServer();
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
try {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const scenario of scenarios) {
        const { page, context } = await newPage(browser, { theme, width, desktop: scenario.desktop });
        const audit = async (state) => {
          const r = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
            .analyze();
          for (const v of r.violations) {
            results.push({
              state,
              theme,
              width,
              rule: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.map((n) => ({
                target: n.target.join(' '),
                html: n.html.slice(0, 160),
                summary: n.failureSummary?.split('\n').slice(1).join(' ').trim(),
              })),
            });
          }
          console.log(`${theme} ${width} ${state}: ${r.violations.length} reglas`);
        };
        try {
          await scenario.run(page, audit);
        } catch (error) {
          results.push({
            state: scenario.name,
            theme,
            width,
            rule: 'AUDIT-ERROR',
            help: String(error),
            nodes: [],
          });
          console.error(`ERROR ${theme} ${width} ${scenario.name}: ${error.message}`);
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
  server.kill();
}

writeFileSync(out, JSON.stringify(results, null, 2));
const byRule = new Map();
for (const r of results) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + r.nodes.length);
console.log(`\n${results.length} hallazgos (regla × estado) → ${out}`);
for (const [rule, n] of [...byRule].sort((a, b) => b[1] - a[1])) console.log(`  ${rule}: ${n} nodos`);

if (failOn) {
  const impacts = FAIL_IMPACTS[failOn] ?? FAIL_IMPACTS.serious;
  const blocking = results.filter((r) => r.rule === 'AUDIT-ERROR' || impacts.includes(r.impact));
  if (blocking.length) {
    console.error(`\n${blocking.length} hallazgos bloqueantes (${impacts.join(' o ')} o escenarios sin auditar):`);
    for (const r of blocking) console.error(`  ${r.rule} · ${r.theme} ${r.width} · ${r.state}: ${r.nodes.map((n) => n.target).join(', ') || r.help}`);
    process.exit(1);
  }
  console.log(`Sin hallazgos ${impacts.join(' ni ')}.`);
}
