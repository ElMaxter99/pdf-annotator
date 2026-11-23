import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

// Parejas A↔B del editor del lote: navegar desde las tarjetas, resaltar la pareja y unirla con una línea.
// Usa el ayudante con el proveedor simulado (playwright.config.ts lo arranca con AI_HELPER_FAKE=1).
const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

async function shiftedPdf(dx: number, dy: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(source, [0]);
  const sheet = out.addPage([embedded.width, embedded.height]);
  sheet.drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await out.save());
}

async function openBatchWithB(page: Page) {
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
  await page.getByTestId('input-b').setInputFiles(file('factura-0331-nuevo.pdf', await shiftedPdf(20, -30), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page.getByTestId('panel-item').filter({ hasText: 'factura-0331' }).getByRole('button', { name: 'Revisar' }).click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
}

async function proposeWithAi(page: Page) {
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
}

test('la tarjeta de la propuesta lleva a la pareja: A y B resaltados y unidos por una línea; Esc la quita', async ({ page }) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  await page.getByTestId('ai-review-fields').click();
  await expect(page.getByTestId('ai-proposal')).toBeVisible();

  // pulsar el nombre no marca ni desmarca la casilla
  const row = page.locator('.ai-proposal__row').filter({ has: page.locator('input[type=checkbox]') }).first();
  const box = row.locator('input[type=checkbox]');
  const before = await box.isChecked();
  await row.getByTestId('ai-row-go').click();
  expect(await box.isChecked()).toBe(before);

  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await expect(page.locator('.canvas-container--split-b .reference-field.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('pair-line')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pair-line')).toHaveCount(0);
  await expect(page.locator('.pair-focus')).toHaveCount(0);
});

test('clic en un campo de A dibuja la línea hasta su pareja en B; clic en vacío la quita', async ({ page }) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const fieldA = page.getByTestId('split-a').locator('.reference-field').first();
  const r = await fieldA.boundingBox();
  if (!r) throw new Error('sin campo de A');
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByTestId('pair-line')).toBeVisible();
  await expect(page.locator('.canvas-container--split-b .reference-field.pair-focus')).toHaveCount(1);

  // la línea va del campo de A al de B
  const line = page.getByTestId('pair-line').locator('line');
  const x1 = Number(await line.getAttribute('x1'));
  const x2 = Number(await line.getAttribute('x2'));
  expect(x2).toBeGreaterThan(x1);

  const pane = await page.getByTestId('split-a').boundingBox();
  if (!pane) throw new Error('sin panel A');
  await page.mouse.click(pane.x + 12, pane.y + 140);
  await expect(page.getByTestId('pair-line')).toHaveCount(0);
});

test('con la propuesta aplicada, la fila de un campo de B lleva a la pareja en «Dividida»', async ({ page }) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  await page.getByTestId('ai-apply').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a')).toBeVisible();
  await page.getByTestId('migration-list').locator('.migration-row__name').first().click();
  await expect(page.locator('.annotation.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('pair-line')).toBeVisible();
});

test('con la propuesta editable: pasar el ratón por un campo propuesto de B dibuja la línea a A y el clic sigue abriendo el editor', async ({ page }) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const proposed = page.getByTestId('ai-proposal-field').first();
  await expect(proposed).toBeVisible();
  const r = await proposed.boundingBox();
  if (!r) throw new Error('sin campo propuesto');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('pair-line')).toBeVisible();
  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.locator('.annotation-editor, app-annotation-editor').first()).toBeVisible();
});
