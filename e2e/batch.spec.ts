import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdfBytes = readFileSync(EXAMPLE_PDF);
const pdfFile = (name: string) => ({ name, mimeType: 'application/pdf', buffer: pdfBytes });
const jsonFile = (name: string) => ({
  name,
  mimeType: 'application/json',
  buffer: readFileSync(EXAMPLE_JSON),
});

async function startBatch(page: import('@playwright/test').Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([pdfFile('uno.pdf'), pdfFile('dos.pdf'), pdfFile('tres.pdf'), jsonFile('uno.json')]);
  await page.waitForURL('**/batch');
}

test('several files open the batch list and pair JSON by name', async ({ page }) => {
  await startBatch(page);
  await expect(page.getByRole('heading', { name: /Lote · 3 PDF/ })).toBeVisible();
  const rows = page.locator('.table [role=row][data-status]');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'uno.pdf' })).toHaveAttribute('data-status', 'missingNew');
  await expect(rows.filter({ hasText: 'dos.pdf' })).toHaveAttribute('data-status', 'noTemplate');
});

test('a single PDF still opens the editor', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(pdfFile('solo.pdf'));
  await page.waitForURL('**/workspace');
});

test('duplicates and non-PDF files are reported without blocking the batch', async ({ page }) => {
  await startBatch(page);
  await page.locator('input[type=file]').setInputFiles([pdfFile('uno.pdf'), { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  const notice = page.locator('.note--warn[role=alert]');
  await expect(notice).toContainText('uno.pdf');
  await expect(notice).toContainText('notas.txt');
});

test('paste a Mongo script, upload the new PDF, compare and save', async ({ page }) => {
  await startBatch(page);
  await page.locator('.table [role=row]', { hasText: 'dos.pdf' }).getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.waitForURL(/\/batch\/.+/);

  await page.locator('#template-text').fill('db.t.drop();\nvar pdfTemplate = { _id: ObjectId("abc"), pages: [ { num: 1, fields: [ { x: 150, y: 722, mapField: "cliente.nombre", fontSize: 12 } ] } ] };');
  await expect(page.locator('#template-status')).toContainText('1 páginas · 1 campos');
  await page.getByRole('button', { name: 'Usar plantilla' }).click();

  await page.locator('input[type=file][accept^="application/pdf"]').setInputFiles(pdfFile('dos-nuevo.pdf'));
  await expect(page.locator('app-batch-compare')).toBeVisible();
  await expect(page.locator('.pane')).toHaveCount(2);
  await expect(page.locator('.fld--new')).toHaveCount(1);

  await page.getByRole('button', { name: 'Superpuesto' }).click();
  await expect(page.locator('.cmp__panes--overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Lado a lado' }).click();

  const field = page.locator('.fld--new');
  const before = await field.boundingBox();
  await page.mouse.move(before!.x + 4, before!.y + 4);
  await page.mouse.down();
  await page.mouse.move(before!.x + 54, before!.y + 44, { steps: 4 });
  await page.mouse.up();
  const after = await field.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 30);
  await expect(page.getByRole('button', { name: /Deshacer/ })).toBeEnabled();

  await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
  await page.waitForURL(/\/batch\/.+/);
  await page.goto('/batch');
  await expect(page.locator('.table [role=row]', { hasText: 'dos.pdf' })).toHaveAttribute('data-status', 'relaid');
});

test('exports the JSON and the annotated PDF as loose files', async ({ page }) => {
  await startBatch(page);
  await page.locator('.table [role=row]', { hasText: 'uno.pdf' }).getByRole('button', { name: 'Subir PDF nuevo' }).click();
  await page.locator('input[type=file][accept^="application/pdf"]').setInputFiles(pdfFile('uno-nuevo.pdf'));
  await expect(page.locator('app-batch-compare')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
  await page.goto('/batch');
  await page.getByRole('button', { name: /Descargar \(1\)/ }).click();
  const names: string[] = [];
  page.on('download', (download) => names.push(download.suggestedFilename()));
  await page.getByRole('button', { name: /Descargar 2 archivos/ }).click();
  await expect(page.getByRole('heading', { name: 'Lote descargado' })).toBeVisible({ timeout: 30_000 });
  expect(names.sort()).toEqual(['uno.json', 'uno.pdf']);
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.locator('.table [role=row]', { hasText: 'uno.pdf' })).toHaveAttribute('data-status', 'exported');
});

test('a broken template is flagged with its line and does not block the others', async ({ page }) => {
  await startBatch(page);
  await page.locator('.table [role=row]', { hasText: 'tres.pdf' }).getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.locator('#template-text').fill('var t = {\n  pages: [ { num: 1, fields: [ { x: 1, y: , mapField: "a" } ] } ]\n};');
  await expect(page.locator('#template-status')).toContainText('línea 2');
  await expect(page.getByRole('button', { name: 'Usar plantilla' })).toBeDisabled();
});

test('the batch survives a reload and exports loose files', async ({ page }) => {
  await startBatch(page);
  await page.reload();
  await expect(page.locator('.table [role=row][data-status]')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Descargar \(0\)/ })).toBeDisabled();
});
