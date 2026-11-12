// Prueba de humo de la app de escritorio: arranca Electron, comprueba la web empaquetada, el ayudante de IA y el aviso de actualización.
// Uso: node desktop/smoke.mjs   (necesita `npm run build`; en Linux sin pantalla: xvfb-run -a node desktop/smoke.mjs)
import { _electron as electron } from '@playwright/test';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ tag_name: 'v99.0.0', html_url: 'https://github.com/ElMaxter99/pdf-annotator/releases/tag/v99.0.0', draft: false, prerelease: false }));
}).listen(0, '127.0.0.1');
await new Promise((r) => api.once('listening', r));
const apiUrl = `http://127.0.0.1:${api.address().port}/latest`;

const app = await electron.launch({
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', here],
  timeout: 60000,
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', AI_HELPER_FAKE: '1', PDF_ANNOTATOR_RELEASE_API: apiUrl, },
});
app.process().on('exit', (code, signal) => console.error(`[electron] terminó: código ${code}, señal ${signal}`));
app.on('window', (w) => console.log('[electron] ventana', w.url()));
app.process().stderr?.on('data', (d) => process.stderr.write(`[electron] ${d}`));
app.process().stdout?.on('data', (d) => process.stdout.write(`[electron] ${d}`));
try {
  const page = await app.firstWindow({ timeout: 60000 });
  await page.waitForURL('app://pdf-annotator/landing');
  assert.ok(await page.locator('body').innerText().then((t) => t.length > 20), 'la landing se pinta');
  assert.equal(await page.evaluate(() => window.desktop?.isDesktop), true, 'el puente existe');
  assert.equal(await page.evaluate(() => typeof require), 'undefined', 'la web no tiene Node');
  // El ayudante arranca en paralelo a la ventana: se espera a que responda.
  const health = await page.evaluate(async () => {
    const port = window.desktop.helperPort;
    for (let i = 0; i < 40; i++) {
      try {
        return await (await fetch(`http://127.0.0.1:${port}/status`)).json();
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error('el ayudante no responde');
  });
  assert.equal(health.ok, true, 'el ayudante responde a la app');
  assert.ok(health.providers.fake, 'proveedor simulado activo');
  const card = page.locator('[data-testid=update-card]');
  await card.waitFor({ timeout: 20000 });
  assert.match(await card.innerText(), /99\.0\.0/);
  await page.screenshot({ path: path.join(process.env.SMOKE_OUT || '/tmp', 'desktop-update.png') });
  await card.locator('.btn--ghost').click();
  await card.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  assert.equal(await card.count(), 0, '«Más tarde» oculta la tarjeta');
  console.log('OK: app de escritorio');
} finally {
  await app.close();
  api.close();
}
