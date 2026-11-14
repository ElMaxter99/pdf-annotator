import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

// Needs the local helper with the simulated provider (playwright.config.ts starts it with AI_HELPER_FAKE=1).
const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const FIELDS = JSON.parse(json.toString()).pages[0].fields.length as number;
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

async function shiftedPdf(dx: number, dy: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(source, [0]);
  const sheet = out.addPage([embedded.width, embedded.height]);
  sheet.drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await out.save());
}

/** Batch with one template and a shifted B, opened in the editor. */
async function openBatchWithB(page: Page, provider: string | null = 'fake') {
  await stubAnalytics(page);
  if (provider) {
    await page.addInitScript((p) => localStorage.setItem('pdf-annotator.ai.provider', p), provider);
  }
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf', pdf, 'application/pdf'), file('factura-0332.pdf', pdf, 'application/pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('input-templates').setInputFiles(file('factura-0331.json', json, 'application/json'));
  await expect(page.getByTestId('template-rows')).toContainText(`${FIELDS} campos`);
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', await shiftedPdf(20, -30), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
}

test('«Copiar y adaptar con IA» asks once, proposes, is reviewed and applied in one undo step', async ({ page }) => {
  await openBatchWithB(page);
  await expect(page.getByTestId('ai-chip')).toContainText('Simulado');

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  // first time: privacy notice, nothing is sent before accepting
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await page.getByTestId('ai-consent-ok').click();

  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
  await expect(page.locator('.annotation')).toHaveCount(0); // B untouched until apply
  await page.getByTestId('ai-toggle-list').click();
  await expect(page.getByTestId('ai-fields').locator('li')).toHaveCount(FIELDS);

  // cancel leaves B as it was
  await page.getByTestId('ai-cancel').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(0);

  // second time: no notice (remembered), apply
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
  await page.getByTestId('ai-apply').click({ timeout: 30000 });
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('without the helper the chip says so and the AI option explains how to start it', async ({ page }) => {
  await page.route('**/127.0.0.1:4310/**', (route) => route.abort());
  await openBatchWithB(page, null);
  await expect(page.getByTestId('ai-chip')).toContainText('sin conectar');
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-panel')).toContainText('npm run start:ia');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('the model is picked from the list the helper reads, never typed, and remembered', async ({ page }) => {
  await openBatchWithB(page);
  await page.getByTestId('ai-chip').click();
  const toggle = page.getByTestId('ai-model-toggle');
  await expect(page.getByTestId('ai-model-refresh')).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('ai-model-opt-fake-small')).toBeVisible();
  await expect(page.getByTestId('ai-panel').locator('input[type=text]')).toHaveCount(0);
  await page.getByTestId('ai-model-opt-fake-large').click();
  await expect(page.getByTestId('ai-model-current')).toContainText('Simulado grande');
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.models'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ fake: 'fake-large' });
  const lists = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.modelLists'));
  expect(lists ?? '').not.toContain('fake-large');
});

test('a saved model the CLI no longer offers goes back to a valid one with a notice', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.models', JSON.stringify({ fake: 'modelo-retirado' })));
  await openBatchWithB(page);
  await page.getByTestId('ai-chip').click();
  await expect(page.getByTestId('ai-model-retired')).toContainText('modelo-retirado');
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.models'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ fake: '' });
});

test('if the helper cannot list the models the error is clear and «Reintentar» is offered', async ({ page }) => {
  await page.route('**/127.0.0.1:4310/models**', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'auth', message: 'x' } }) }),
  );
  await openBatchWithB(page);
  await page.getByTestId('ai-chip').click();
  await expect(page.getByTestId('ai-model-error')).toContainText('No se pudo leer la lista de modelos');
  await expect(page.getByTestId('ai-model-retry')).toBeVisible();
  await page.unroute('**/127.0.0.1:4310/models**');
  await page.getByTestId('ai-model-retry').click();
  await expect(page.getByTestId('ai-model-error')).toHaveCount(0);
});

test('«Ver detalles» shows what was sent, the steps and says the simulated provider reports no usage', async ({ page }) => {
  await openBatchWithB(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });

  await page.getByTestId('ai-details-open').click();
  const dialog = page.getByTestId('ai-details');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Terminado');
  await expect(page.getByTestId('ai-details-steps')).toContainText('Preparar las páginas');
  await expect(page.getByTestId('ai-details-steps')).toContainText(`${FIELDS} de ${FIELDS} campos colocados`);
  await expect(page.getByTestId('ai-details-sent')).toContainText('fields.json');
  await expect(page.getByTestId('ai-details-usage')).toContainText('No medible');
  await page.getByTestId('ai-details-tab-sent').click();
  await expect(page.getByTestId('ai-details-steps')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('ai-apply')).toBeVisible();
});

test('the retry option is remembered and off by default for Copilot', async ({ page }) => {
  await openBatchWithB(page);
  await page.getByTestId('ai-chip').click();
  const toggle = page.getByTestId('ai-retry-toggle');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.retry'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ claude: true, copilot: false, fake: false });
});

// ---- «Trasladar con IA» sobre todo el lote -----------------------------------------------------

/** Panel with one pair (0331 + shifted B) and one PDF without B. */
async function openPanelWithPair(page: Page) {
  await stubAnalytics(page);
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.provider', 'fake'));
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf', pdf, 'application/pdf'), file('factura-0332.pdf', pdf, 'application/pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('input-templates').setInputFiles(file('factura-0331.json', json, 'application/json'));
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', await shiftedPdf(20, -30), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
}

test('«Trasladar con IA» en lote: estimación, cola, propuesta guardada y revisión PDF a PDF', async ({ page }) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-dialog')).toBeVisible();
  await expect(page.getByTestId('ai-batch-estimate')).toContainText('1');
  await page.getByTestId('ai-batch-cascade').uncheck(); // fuerza el camino de la IA
  await page.getByTestId('ai-batch-start').click();

  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-chip-ready')).toBeVisible();
  // nothing is applied by itself
  await page.getByTestId('ai-batch-review-first').click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.getByTestId('ai-review')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('ai-saved')).toBeVisible();
  await expect(page.locator('.annotation')).toHaveCount(0);
  await page.getByTestId('ai-apply').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  // accepted: the saved copy is gone, going back to the panel shows no proposal to review
  await page.goBack();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('ai-review-proposal')).toHaveCount(0);
});

test('«Trasladar con IA» en lote: el ajuste por textos resuelve sin gastar una petición', async ({ page }) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-cascade')).toBeChecked();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-chip-free')).toBeVisible();
});

test('«Trasladar con IA» en lote: sin ayudante se explica y no se envía nada', async ({ page }) => {
  await openPanelWithPair(page);
  await page.route('http://127.0.0.1:4310/**', (route) => route.abort());
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-offline')).toBeVisible();
  await expect(page.getByTestId('ai-batch-start')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-batch-dialog')).toHaveCount(0);
});

test('«Trasladar con IA» en lote: proveedor en tarjetas y modelo elegido de la lista', async ({ page }) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-change').click();
  // Without the real CLIs only the simulated provider is installed: the others show disabled, as in the editor panel.
  await expect(page.getByTestId('ai-batch-provider-claude')).toBeVisible();
  await expect(page.getByTestId('ai-batch-provider-copilot')).toBeVisible();
  await expect(page.getByTestId('ai-batch-provider-fake')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('ai-batch-model-toggle').click();
  await page.getByTestId('ai-batch-model-opt-fake-large').click();
  await expect(page.getByTestId('ai-batch-model-current')).toContainText('Simulado grande');
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.models'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ fake: 'fake-large' });
});

test('«Trasladar con IA» en lote: «Ver detalles» enseña los PDFs, los pasos y el consumo del lote', async ({ page }) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-details')).toBeVisible();
  await page.getByTestId('ai-batch-details').click();
  const dialog = page.getByTestId('ai-bdetails');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('ai-batch-status').locator('[data-testid^="ai-bdetails-item-"]')).toHaveCount(1);
  await expect(page.getByTestId('ai-bdetails-steps')).toContainText(/\S/);
  await expect(page.getByTestId('ai-bdetails-batch')).toBeVisible();
  await page.getByTestId('ai-bdetails-tab-sent').click();
  await expect(page.getByTestId('ai-bdetails-sent')).toBeVisible();
  await page.keyboard.press('Escape'); // closes the side panel; the work goes on
  await expect(page.getByTestId('ai-batch-status')).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  // Once finished, the row keeps a link to what happened.
  await expect(page.getByTestId('ai-chip-details').first()).toBeVisible();
});

test('en una web pública (no local) no hay rastro de la IA', async ({ page }) => {
  await stubAnalytics(page);
  await page.route('http://app.test/**', async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4300${url.pathname}${url.search}` });
    await route.fulfill({ response });
  });
  await page.goto('http://app.test/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('a.pdf', pdf, 'application/pdf'), file('b.pdf', pdf, 'application/pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('input-templates').setInputFiles(file('a.json', json, 'application/json'));
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('batch-more')).toBeVisible();
  await expect(page.getByTestId('ai-batch-button')).toHaveCount(0);
  await page.getByText('a.pdf').first().click();
  await expect(page.getByTestId('ai-chip')).toHaveCount(0);
});

test('panel del lote compacto: ⋯ guarda las acciones raras y las acciones de fila salen al pasar el ratón', async ({ page }) => {
  await openPanelWithPair(page);
  await expect(page.getByTestId('download-ready')).toHaveCount(0); // aparece en la cabecera cuando hay listos
  await page.getByTestId('batch-more').click();
  await expect(page.getByTestId('batch-testdata')).toBeVisible();
  await expect(page.getByTestId('download-ready')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('batch-more-menu')).toHaveCount(0);

  const actions = page.locator('.batch-row__actions').first();
  await expect(actions).toHaveCSS('opacity', '0');
  await page.getByTestId('panel-item').first().hover();
  await expect(actions).toHaveCSS('opacity', '1');
});
