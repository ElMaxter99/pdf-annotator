// Regenerates the README screenshots (screenshots/*.png) from the production build.
// Usage: npm run build && node scripts/screenshots.mjs   (PW_CHROMIUM=<path> to use an installed Chromium)
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'screenshots');
const PORT = 4310 + 7;
// A non-local host name shows the app as on the public site (the local AI is hidden there).
const HOST = 'pdf-annotator.test';
const BASE = `http://${HOST}:${PORT}`;
const PDF = join(root, 'examples', 'factura-ejemplo.pdf');
const JSON_TEXT = JSON.stringify(
  JSON.parse(readFileSync(join(root, 'examples', 'anotaciones-ejemplo.json'), 'utf8')),
  null,
  2,
);
const pdfBuffer = readFileSync(PDF);
const VIEWPORT = { width: 1600, height: 900 };

const server = spawn(process.execPath, ['e2e/static-server.mjs', 'dist/pdf-annotator/browser'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});

async function waitForServer() {
  for (let i = 0; i < 50; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('The static server did not start (did you run `npm run build`?)');
}

/** A fresh page with the one-off tips already seen, in Spanish and the given theme. */
async function newPage(browser, { theme = 'dark', viewport = VIEWPORT } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'es-ES' });
  await context.addInitScript((mode) => {
    if (sessionStorage.getItem('shots-ready')) return;
    sessionStorage.setItem('shots-ready', '1');
    localStorage.setItem('pdf-annotator.language', 'es-ES');
    localStorage.setItem('pdf-annotator-theme', mode);
    localStorage.setItem('pdf-annotator.guide.steps', '1');
    localStorage.setItem('pdf-annotator.guide.hint', '1');
    localStorage.setItem('pdf-annotator.zoomHint', '1');
    localStorage.setItem('pdf-annotator.previewMode', 'map');
  }, theme);
  await context.route('**/_vercel/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  return context.newPage();
}

const settle = (page, ms = 600) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });
const blur = (page) => page.evaluate(() => document.activeElement?.blur());

/** Opens the example invoice with its example annotations. */
async function openExample(page) {
  await page.goto(`${BASE}/landing`);
  await page.locator('input[type=file]').setInputFiles(PDF);
  await page.waitForURL('**/workspace');
  await page.locator('.canvas--pdf').waitFor();
  await settle(page, 900);
  await page.getByRole('tab', { name: /^\s*Anotaciones/ }).click();
  await page.locator('textarea.json-editor').fill(JSON_TEXT);
  await page.keyboard.press('Control+s');
  await settle(page);
  await page.locator('textarea.json-editor').evaluate((el) => el.scrollTo(0, 0));
  await blur(page);
  await page.mouse.move(5, VIEWPORT.height - 5);
  await settle(page);
}

async function landing(browser) {
  const page = await newPage(browser, { viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/landing`);
  await settle(page, 900);
  await shot(page, 'main');
  await page.context().close();
}

async function workspace(browser) {
  const page = await newPage(browser);
  await openExample(page);
  await shot(page, 'workspace');

  // Editing one annotation.
  await page.locator('.annotation').filter({ hasText: 'cliente.nombre' }).first().click();
  await page.locator('.annotation-editor').waitFor();
  await settle(page);
  await shot(page, 'example_use');
  await page.keyboard.press('Escape');
  await settle(page);

  // JSON as a tree.
  await page.getByRole('button', { name: 'Ver modo árbol' }).click();
  await settle(page);
  // Open the first levels (document → pages → page 1 → fields → the first fields).
  for (let i = 0; i < 7; i += 1) {
    const collapsed = page
      .locator('.json-tree__toggle:has(.json-tree__chevron--collapsed)')
      .first();
    if (!(await collapsed.count())) break;
    await collapsed.click();
    await settle(page, 250);
  }
  await settle(page, 300);
  await blur(page);
  await shot(page, 'json-tree');

  // Guides, rulers and grid.
  await page.getByRole('tab', { name: /^\s*Ajustes/ }).click();
  const advanced = page.locator('.advanced-toggle');
  if ((await advanced.getAttribute('aria-expanded')) !== 'true') await advanced.click();
  await page.getByLabel('Activar guías y snapping').check();
  await settle(page);
  await blur(page);
  await shot(page, 'guides');
  await page.getByLabel('Activar guías y snapping').uncheck();

  // Keyboard shortcuts.
  await blur(page);
  await page.keyboard.press('?');
  await settle(page);
  await shot(page, 'shortcuts');
  await page.context().close();
}

async function light(browser) {
  const page = await newPage(browser, { theme: 'light' });
  await openExample(page);
  await shot(page, 'light');
  await page.context().close();
}

/** The example invoice moved on the page: a realistic «new version» (B) of it. */
async function shiftedPdf(dx, dy) {
  const source = await PDFDocument.load(pdfBuffer);
  const doc = await PDFDocument.create();
  const [embedded] = await doc.embedPdf(source, [0]);
  doc.addPage([embedded.width, embedded.height]).drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await doc.save());
}

async function batch(browser) {
  const versionB = await shiftedPdf(18, -24);
  const page = await newPage(browser);
  const file = (name, mimeType, buffer) => ({ name, mimeType, buffer });
  await page.goto(`${BASE}/landing`);
  await page
    .locator('input[type=file]')
    .setInputFiles(
      ['0331', '0332', '0333', '0334'].map((n) =>
        file(`factura-${n}.pdf`, 'application/pdf', pdfBuffer),
      ),
    );
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(
      ['0331', '0332', '0333'].map((n) =>
        file(`factura-${n}.json`, 'application/json', Buffer.from(JSON_TEXT)),
      ),
    );
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(
      ['0331', '0332'].map((n) => file(`factura-${n}-nuevo.pdf`, 'application/pdf', versionB)),
    );
  await settle(page, 1200);
  await page.mouse.move(5, 5);
  await shot(page, 'batch-panel');

  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await page.locator('.canvas--pdf').waitFor();
  await settle(page, 900);
  // «Copiar y ajustar por textos» places A's fields on the moved B; apply the proposal.
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-adjust').click();
  await page.getByTestId('adjust-apply').waitFor({ timeout: 20000 });
  await page.getByTestId('adjust-apply').click();
  await settle(page);
  if (!(await page.getByTestId('split-a').isVisible()))
    await page.getByTestId('mode-split').click();
  await page.getByTestId('split-a').waitFor();
  for (const close of await page.locator('.toast button').all()) await close.click();
  await settle(page, 1200);
  await blur(page);
  await page.mouse.move(5, VIEWPORT.height - 5);
  await shot(page, 'batch-split');
  await page.context().close();
}

try {
  await waitForServer();
  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
    ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
  });
  for (const step of [landing, workspace, light, batch]) {
    await step(browser);
    console.log(`✓ ${step.name}`);
  }
  await browser.close();
} finally {
  server.kill();
}
