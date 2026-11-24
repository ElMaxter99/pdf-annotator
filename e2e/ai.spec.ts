import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics, openLote } from './helpers';

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
    .setInputFiles([
      file('factura-0331.pdf', pdf, 'application/pdf'),
      file('factura-0332.pdf', pdf, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('factura-0331.json', json, 'application/json'));
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

test('«Copiar y adaptar con IA» asks once, writes the proposal in B in one undo step and is kept or discarded', async ({
  page,
}) => {
  await openBatchWithB(page);
  await expect(page.getByTestId('ai-chip')).toContainText('Simulado');

  await openLote(page);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  // first time: privacy notice, nothing is sent before accepting
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await page.getByTestId('ai-consent-ok').click();

  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS); // written in B as soon as it arrives
  // the dock sits under the pages: «Enlazado» can no longer cover its buttons (P-67 · P-69)
  const dock = await page.getByTestId('ai-review').boundingBox();
  const link = await page.getByTestId('split-link').boundingBox();
  expect(dock && link && link.y + link.height <= dock.y).toBe(true);
  // the list lives in «Anotaciones»: «Revisar campos» opens it
  await page.getByTestId('ai-review-fields').click();
  await expect(page.getByTestId('ai-proposal')).toBeVisible();
  // the helper placed the obvious ones by text (identical, unique label in B with its slot): marked «colocado sin IA»
  await expect(page.getByTestId('ai-row-without-ai').first()).toBeVisible();
  await expect(page.locator('.ai-proposal__row')).toHaveCount(FIELDS);
  await expect(page.getByTestId('ai-tab-badge')).toBeVisible();
  await expect(page.getByTestId('migration-list').locator('[data-status="missing"]')).toHaveCount(
    0,
  );
  // «Quitar todas» takes them out of B; «Marcar las altas» writes the sure ones back
  await page.getByTestId('ai-select-none').click();
  await expect(page.locator('.annotation')).toHaveCount(0);
  await page.getByTestId('ai-select-high').click();
  await expect(page.locator('.annotation').first()).toBeVisible();

  // «Descartar» asks first and takes what the AI wrote out of B
  await page.getByTestId('ai-more').click();
  await page.getByTestId('ai-discard').click();
  await expect(page.getByTestId('ai-confirm')).toBeVisible();
  await page.getByTestId('ai-confirm-back').click();
  await expect(page.getByTestId('ai-review')).toBeVisible();
  await page.getByTestId('ai-more').click();
  await page.getByTestId('ai-discard').click();
  await page.getByTestId('ai-confirm-discard').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.getByTestId('ai-proposal')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(0);

  // second time: no notice (remembered); one Ctrl+Z takes the whole proposal out, Ctrl+Y brings it back
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
  await expect(page.getByTestId('ai-review')).toBeVisible(); // the review stays; the rows are just out of B
  await page.keyboard.press('Control+y');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  // «Dar por buena» only closes the review: B keeps the fields
  await page.getByTestId('ai-apply').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
});

test('moving a field written by the AI is undoable and redoable, step by step', async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  const first = page.locator('.annotation').first();
  await first.scrollIntoViewIfNeeded();
  const before = await first.boundingBox();
  if (!before) throw new Error('no field written in B');
  await page.mouse.move(before.x + 4, before.y + 4);
  await page.mouse.down();
  await page.mouse.move(before.x + 44, before.y + 34, { steps: 5 });
  await page.mouse.up();
  const moved = await first.boundingBox();
  expect(
    moved && Math.abs(moved.x - (before.x + 40)) < 3 && Math.abs(moved.y - (before.y + 30)) < 3,
  ).toBe(true);
  // moving it keeps it as a field of the proposal (the row is marked as changed)
  await page.getByTestId('ai-review-fields').click();
  await expect(page.getByTestId('ai-row-edited')).toHaveCount(1);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('ai-row-edited')).toHaveCount(0);
  const back = await first.boundingBox();
  expect(back && Math.abs(back.x - before.x) < 3 && Math.abs(back.y - before.y) < 3).toBe(true);
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('ai-row-edited')).toHaveCount(1);

  // one more undo and the move is gone; another one takes the whole proposal out of B
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
  await expect(page.getByTestId('ai-proposal-field').first()).toBeVisible(); // rows out of B are grey, one click puts them back
  await page.getByTestId('ai-proposal-field').first().click();
  await expect(page.locator('.annotation')).toHaveCount(1);
});

test("copies of fields written by the AI are the user's own: discarding the proposal keeps them", async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS * 2);
  await page.getByTestId('ai-more').click();
  await page.getByTestId('ai-discard').click();
  await page.getByTestId('ai-confirm-discard').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
});

test('without the helper the chip says so and the AI option explains how to start it', async ({
  page,
}) => {
  await page.route('**/127.0.0.1:4310/**', (route) => route.abort());
  await openBatchWithB(page, null);
  await expect(page.getByTestId('ai-chip')).toContainText('sin conectar');
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-panel')).toContainText('npm run start:ia');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('the model list can be filtered by typing', async ({ page }) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('ai-chip').click();
  await page.getByTestId('ai-model-toggle').click();
  const search = page.getByTestId('ai-model-search');
  await expect(search).toBeFocused();
  await search.fill('grande');
  await expect(page.getByTestId('ai-model-opt-fake-large')).toBeVisible();
  await expect(page.getByTestId('ai-model-opt-fake-small')).toHaveCount(0);
  await search.fill('zzzz');
  await expect(page.getByTestId('ai-model-none')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(page.getByTestId('ai-model-opt-fake-small')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-model-list')).toHaveCount(0);
});

test('the model is picked from the list the helper reads, never typed, and remembered', async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
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

test('a saved model the CLI no longer offers goes back to a valid one with a notice', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('pdf-annotator.ai.models', JSON.stringify({ fake: 'modelo-retirado' })),
  );
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('ai-chip').click();
  await expect(page.getByTestId('ai-model-retired')).toContainText('modelo-retirado');
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.models'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ fake: '' });
});

test('if the helper cannot list the models the error is clear and «Reintentar» is offered', async ({
  page,
}) => {
  await page.route('**/127.0.0.1:4310/models**', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'auth', message: 'x' } }),
    }),
  );
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('ai-chip').click();
  await expect(page.getByTestId('ai-model-error')).toContainText(
    'No se pudo leer la lista de modelos',
  );
  await expect(page.getByTestId('ai-model-retry')).toBeVisible();
  await page.unroute('**/127.0.0.1:4310/models**');
  await page.getByTestId('ai-model-retry').click();
  await expect(page.getByTestId('ai-model-error')).toHaveCount(0);
});

test('«Ver detalles» shows what was sent, the steps and says the simulated provider reports no usage', async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });

  await page.getByTestId('ai-more').click();
  await page.getByTestId('ai-details-open').click();
  const dialog = page.getByTestId('ai-details');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Terminado');
  await expect(page.getByTestId('ai-details-steps')).toContainText('Preparar las páginas');
  await expect(page.getByTestId('ai-details-steps')).toContainText(
    `${FIELDS} de ${FIELDS} campos colocados`,
  );
  await expect(page.getByTestId('ai-details-sent')).toContainText('fields.json');
  await expect(page.getByTestId('ai-details-usage')).toContainText('No medible');
  await page.getByTestId('ai-details-tab-sent').click();
  await expect(page.getByTestId('ai-details-steps')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('ai-apply')).toBeVisible();
});

test('the retry option is remembered and on by default with every provider', async ({ page }) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('ai-chip').click();
  const toggle = page.getByTestId('ai-retry-toggle');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.retry'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ claude: true, copilot: true, fake: false });
});

// ---- «Trasladar con IA» sobre todo el lote -----------------------------------------------------

/** Panel with one pair (0331 + shifted B) and one PDF without B. */
async function openPanelWithPair(page: Page, bPdf?: Buffer) {
  await stubAnalytics(page);
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.provider', 'fake'));
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('factura-0331.pdf', pdf, 'application/pdf'),
      file('factura-0332.pdf', pdf, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('factura-0331.json', json, 'application/json'));
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(
      file('factura-0331-nuevo.pdf', bPdf ?? (await shiftedPdf(20, -30)), 'application/pdf'),
    );
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
}

/** A «new version» that shares no label with A: every field of the template is absent from B. */
async function unrelatedPdf(): Promise<Buffer> {
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const sheet = out.addPage([595, 842]);
  sheet.drawText('Documento sin relación', { x: 60, y: 780, size: 14, font });
  return Buffer.from(await out.save());
}

test('«Trasladar con IA» en lote: estimación, cola, propuesta guardada y revisión PDF a PDF', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-dialog')).toBeVisible();
  await expect(page.getByTestId('ai-batch-estimate')).toContainText('1');
  await page.getByTestId('ai-batch-cascade').uncheck(); // fuerza el camino de la IA
  await page.getByTestId('ai-batch-start').click();

  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-chip-ready')).toBeVisible();
  // nothing is written in B by itself: only when the PDF is opened for review
  await page.getByTestId('ai-batch-review-first').click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.getByTestId('ai-review')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('ai-saved')).toBeVisible();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await page.getByTestId('ai-apply').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  // accepted: the saved copy is gone, going back to the panel shows no proposal to review
  await page.goBack();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('ai-review-proposal')).toHaveCount(0);
});

test('«Trasladar con IA» en lote: elegir un PDF se ve y su resumen está siempre a la vista (P-72)', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });

  // by default the summary is about the whole batch and sits at the foot of the panel, on screen
  const sheet = page.getByTestId('ai-batch-sheet');
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId('ai-sheet-title')).toContainText('todo el lote');
  await expect(page.getByTestId('ai-scope-pick')).toHaveCount(0);

  // picking a row marks it, says what it does and the summary names it
  const row = page.locator('[data-testid^="ai-bdetails-item-"]').first();
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ai-row-viewing')).toBeVisible();
  await expect(page.getByTestId('ai-scope-pick')).toContainText('.pdf');
  await expect(page.getByTestId('ai-sheet-title')).not.toContainText('todo el lote');
  const box = await sheet.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport && box.y + box.height <= viewport.height).toBe(true);

  // Esc lets go first (the panel stays), the ✕ of the scope does the same
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-batch-status')).toBeVisible();
  await expect(page.getByTestId('ai-scope-pick')).toHaveCount(0);
  await expect(page.getByTestId('ai-sheet-title')).toContainText('todo el lote');
  await row.click();
  await page.getByTestId('ai-scope-release').click();
  await expect(page.getByTestId('ai-scope-pick')).toHaveCount(0);
  // clicking the chosen row again also lets it go
  await row.click();
  await row.click();
  await expect(page.getByTestId('ai-scope-pick')).toHaveCount(0);
});

test('«Trasladar con IA» en lote: el ajuste por textos resuelve sin gastar una petición', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-cascade')).toBeChecked();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-chip-free')).toBeVisible();
});

test('«Trasladar con IA» en lote: el modal es mínimo y la información extra sale solo si se pide', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  const dialog = page.getByTestId('ai-batch-dialog');
  await expect(dialog).toBeVisible();

  // At rest: summary, provider, the «Ajustar por textos» option and the buttons; no long notices.
  await expect(page.getByTestId('ai-batch-estimate')).toBeVisible();
  await expect(page.getByTestId('ai-batch-current')).toBeVisible();
  await expect(page.getByTestId('ai-batch-cascade')).toBeVisible();
  await expect(page.getByTestId('ai-batch-info-body')).toHaveCount(0);
  await expect(page.getByTestId('ai-batch-breakdown')).toHaveCount(0);
  await expect(dialog.locator('.ai-note')).toHaveCount(0);
  await expect(page.getByTestId('ai-batch-nomeasure')).toHaveCount(0);

  // Left-out PDFs: a one-line label; the breakdown only when asked for.
  const omit = page.getByTestId('ai-batch-omit');
  await expect(omit).toContainText('Omitidos: 1');
  await omit.click();
  await expect(page.getByTestId('ai-batch-breakdown')).toBeVisible();
  await omit.click();
  await expect(page.getByTestId('ai-batch-breakdown')).toHaveCount(0);

  // «Más información» (ⓘ): requests and what is sent.
  const info = page.getByTestId('ai-batch-info');
  await info.click();
  await expect(page.getByTestId('ai-batch-info-body')).toContainText('Qué se envía');
  await info.click();
  await expect(page.getByTestId('ai-batch-info-body')).toHaveCount(0);

  // First time: one privacy line with its checkbox.
  const consent = page.getByTestId('ai-batch-consent');
  await expect(consent).toContainText('Se envían los PDF A y B');
  await expect(consent.locator('input[type=checkbox]')).toBeVisible();

  // It stays compact.
  const box = (await dialog.boundingBox())!;
  expect(box.height).toBeLessThan(420);
});

test('«Trasladar con IA» en lote: en la cuadrícula, «Ver detalles» del chip abre los detalles y no el editor', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('view-grid').click();
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-chip-ready')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('ai-chip-details').click();
  await expect(page.getByTestId('ai-bdetails')).toBeVisible();
  await expect(page).toHaveURL(/\/lote/);
});

test('«Trasladar con IA» en lote: los campos que no existen en B no cuentan como fallo', async ({
  page,
}) => {
  await openPanelWithPair(page, await unrelatedPdf());
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  // Nothing exists in B: the PDF is «Lista» (all that can be placed is placed) and says how many are absent.
  await expect(page.getByTestId('ai-chip-ready')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('ai-chip-absent')).toContainText(`${FIELDS} ya no en B`);
  await expect(page.getByTestId('ai-chip-failed')).toHaveCount(0);
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

test('«Trasladar con IA» en lote: proveedor en tarjetas y modelo elegido de la lista', async ({
  page,
}) => {
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

test('«Trasladar con IA» en lote: «Ver detalles» enseña los PDFs, los pasos y el consumo del lote', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-details')).toBeVisible();
  await page.getByTestId('ai-batch-details').click();
  const dialog = page.getByTestId('ai-bdetails');
  await expect(dialog).toBeVisible();
  // the details take the place of the list and the summary: no nested scroll areas in the panel
  await expect(
    page.getByTestId('ai-batch-status').locator('[data-testid^="ai-bdetails-item-"]'),
  ).toHaveCount(0);
  await expect(page.getByTestId('ai-batch-sheet')).toHaveCount(0);
  await expect(page.getByTestId('ai-bdetails-steps')).toContainText(/\S/);
  await expect(page.getByTestId('ai-bdetails-batch')).toBeVisible();
  await page.getByTestId('ai-bdetails-tab-sent').click();
  await expect(page.getByTestId('ai-bdetails-sent')).toBeVisible();
  const scrollers = await page.getByTestId('ai-batch-status').evaluate(
    (panel) =>
      [panel, ...panel.querySelectorAll('*')].filter((el) => {
        const c = getComputedStyle(el);
        return /(auto|scroll)/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 1;
      }).length,
  );
  expect(scrollers).toBeLessThanOrEqual(1);
  // «Volver a la lista» (or Esc) brings the list and the summary back
  await page.getByTestId('ai-batch-details-back').click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByTestId('ai-batch-status').locator('[data-testid^="ai-bdetails-item-"]'),
  ).toHaveCount(1);
  await expect(page.getByTestId('ai-batch-sheet')).toBeVisible();
  await page.getByTestId('ai-batch-details').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape'); // first Esc: back to the list
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('ai-batch-status')).toBeVisible();
  await page.keyboard.press('Escape'); // then it closes the side panel; the work goes on
  await expect(page.getByTestId('ai-batch-status')).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  // Once finished, the row keeps a link to what happened.
  await expect(page.getByTestId('ai-chip-details').first()).toBeVisible();
});

test('en una web pública (no local) no hay rastro de la IA', async ({ page }) => {
  await stubAnalytics(page);
  await page.route('http://app.test/**', async (route) => {
    const url = new URL(route.request().url());
    try {
      const response = await route.fetch({
        url: `http://127.0.0.1:4300${url.pathname}${url.search}`,
      });
      await route.fulfill({ response });
    } catch {
      // A request still in flight when the page navigates or the test ends loses its response
      // («Fetch response has been disposed»): nothing is waiting for it any more.
      await route.abort().catch(() => undefined);
    }
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

test('panel del lote compacto: ⋯ guarda las acciones raras y las acciones de fila salen al pasar el ratón', async ({
  page,
}) => {
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

test('«Trasladar con IA» en lote: la cola vive en el ayudante y el panel lo dice', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-via-helper')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('ai-batch-concurrency')).toContainText('2 a la vez');
  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  // a finished queue is forgotten: nothing to recover after a reload
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.queue'))).toBeNull();
  await expect(page.getByTestId('ai-batch-pause')).toHaveCount(0);
});

test('«Trasladar con IA»: instrucciones para la IA del lote y de un PDF, guardadas y enviadas (A6)', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await page.getByTestId('ai-batch-button').click();
  // Folded by default: one line, no text box.
  const toggle = page.getByTestId('ai-batch-instructions-toggle');
  await expect(toggle).toContainText('Instrucciones para la IA');
  await expect(toggle).toContainText('(opcional)');
  await expect(page.getByTestId('ai-batch-instructions')).toHaveCount(0);
  await toggle.click();
  await page
    .getByTestId('ai-batch-instructions')
    .fill('Las casillas van a la izquierda del texto.');
  // Closing the popover keeps what was typed (saved on the batch).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-batch-dialog')).toHaveCount(0);
  const storedSettings = () =>
    page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const open = indexedDB.open('pdf-annotator-batch', 1);
          open.onerror = () => resolve('');
          open.onsuccess = () => {
            const get = open.result
              .transaction('items')
              .objectStore('items')
              .get('__batch-settings__');
            get.onsuccess = () =>
              resolve(
                String(
                  (get.result as { aiInstructions?: string } | undefined)?.aiInstructions ?? '',
                ),
              );
            get.onerror = () => resolve('');
          };
        }),
    );
  await expect.poll(storedSettings).toBe('Las casillas van a la izquierda del texto.');

  await page.reload();
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page.getByTestId('ai-batch-button').click();
  await expect(page.getByTestId('ai-batch-instructions-on')).toBeVisible();
  await page.getByTestId('ai-batch-instructions-toggle').click();
  await expect(page.getByTestId('ai-batch-instructions')).toHaveValue(
    'Las casillas van a la izquierda del texto.',
  );

  // They go to the helper with the PDF.
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/batch\/[^/]+\/items$/.test(request.url())) {
      sent.push(
        String(
          (JSON.parse(request.postData() ?? '{}') as { instructions?: unknown }).instructions ?? '',
        ),
      );
    }
  });
  await page.getByTestId('ai-batch-cascade').uncheck();
  await page.getByTestId('ai-batch-start').click();
  await expect(page.getByTestId('ai-batch-summary')).toBeVisible({ timeout: 30000 });
  expect(sent).toEqual(['Las casillas van a la izquierda del texto.']);

  // In the editor the PDF follows the batch until it gets its own, and «Usar las del lote» goes back.
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await openLote(page);
  await page.getByTestId('ai-chip').click();
  await page.getByTestId('ai-instructions-toggle').click();
  const box = page.getByTestId('ai-instructions');
  await expect(box).toHaveValue('Las casillas van a la izquierda del texto.');
  await expect(page.getByTestId('ai-instructions-source')).toContainText('Las del lote');
  await box.fill('El CIF ahora se llama NIF.');
  await expect(page.getByTestId('ai-instructions-source')).toContainText('Solo este PDF', {
    timeout: 5000,
  });
  await page.getByTestId('ai-instructions-reset').click();
  await expect(box).toHaveValue('Las casillas van a la izquierda del texto.');
  await expect(page.getByTestId('ai-instructions-source')).toContainText('Las del lote');
});

test('«Copiar y adaptar con IA»: el número de página repetido en A se propone en cada página de B (3 → 4)', async ({
  page,
}) => {
  const pages = async (n: number) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= n; i += 1)
      doc.addPage([595, 842]).drawText(`Página ${i}`, { x: 60, y: 780, size: 14, font });
    return Buffer.from(await doc.save());
  };
  const template = {
    pages: [1, 2, 3].map((num) => ({
      num,
      fields: [{ x: 540, y: 30, mapField: `numpages${num - 1}`, fontSize: 9, type: 'text' }],
    })),
  };
  await stubAnalytics(page);
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.provider', 'fake'));
  await page.goto('/landing');
  const a = await pages(3);
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('parte.pdf', a, 'application/pdf'),
      file('otro.pdf', a, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('parte.json', Buffer.from(JSON.stringify(template)), 'application/json'));
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('parte-nuevo.pdf', await pages(4), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('parte-nuevo.pdf');
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'parte.pdf' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('ai-review-fields').click();
  // los 3 de A y uno nuevo para la página 4 de B (numpages3), marcado «repetido en cada página»
  await expect(page.locator('.ai-proposal__row')).toHaveCount(4);
  await expect(
    page.locator('.ai-proposal__row', { hasText: 'numpages3' }).getByTestId('ai-row-pattern'),
  ).toBeVisible();
  // grupos claros: el de la página nueva va en «Nuevos en B (no estaban en A)», separado de los que vienen de A
  await expect(page.getByTestId('ai-group-newInB')).toContainText('Nuevos en B');
  await expect(page.getByTestId('ai-proposal-newInB')).toContainText('numpages3');
  await expect(page.getByTestId('ai-proposal-newInB').locator('.ai-proposal__row')).toHaveCount(1);
  await page.getByTestId('ai-apply').click();
  await expect(page.locator('.annotation')).toHaveCount(1); // la de la página 1 de B
});

test('traslado cortado: al volver aparece el aviso con lo que falta y se puede descartar conservando lo guardado', async ({
  page,
}) => {
  await openPanelWithPair(page);
  await expect(page.getByTestId('ai-draft')).toHaveCount(0); // sin pasada previa no hay aviso

  // La pasada se «cortó»: el borrador dice que se lanzaron los dos PDF y ninguno llegó a tener propuesta.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('pdf-annotator-batch', 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('items', 'readwrite');
          const store = tx.objectStore('items');
          const keys = store.getAllKeys();
          keys.onsuccess = () => {
            const ids = (keys.result as string[]).filter((key) => !key.startsWith('__'));
            store.put(
              { ids, provider: 'fake', startedAt: Date.now(), started: [], failed: [] },
              '__tmp__',
            );
            const all = store.get('__batch-settings__');
            all.onsuccess = () =>
              store.put(
                {
                  ...(all.result ?? { aiInstructions: '' }),
                  aiRun: {
                    ids,
                    provider: 'fake',
                    startedAt: Date.now(),
                    started: [],
                    failed: [],
                    rerun: [],
                  },
                },
                '__batch-settings__',
              );
            store.delete('__tmp__');
          };
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();
  await expect(page.getByTestId('ai-draft')).toBeVisible();
  await expect(page.getByTestId('ai-chip-notStarted').first()).toBeVisible();
  await expect(page.getByTestId('ai-draft')).toContainText('0');

  await page.getByTestId('ai-draft-choose').click();
  await expect(page.locator('.batch-selbar')).toBeVisible();

  await page.getByTestId('ai-draft-discard').click();
  await expect(page.getByTestId('ai-draft')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('ai-draft')).toHaveCount(0);
});
