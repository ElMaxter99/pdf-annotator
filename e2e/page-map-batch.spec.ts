import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

/** B = a blank cover followed by the invoice (A). */
async function withCover(): Promise<Buffer> {
  const out = await PDFDocument.create();
  out.addPage([595, 842]);
  const [copy] = await out.copyPages(await PDFDocument.load(pdf), [0]);
  out.addPage(copy);
  return Buffer.from(await out.save());
}

/** Three PDFs: 0331 and 0332 get a B with a cover, 0333 has no B. Opens the panel in list view. */
async function openPanel(page: Page) {
  const cover = await withCover();
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles(['factura-0331', 'factura-0332', 'factura-0333'].map((n) => file(`${n}.pdf`, pdf)));
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles({ name: 'factura-0331.json', mimeType: 'application/json', buffer: json });
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles([file('factura-0331-nuevo.pdf', cover), file('factura-0332-nuevo.pdf', cover)]);
  await expect(page.getByTestId('panel-list')).toContainText('factura-0332-nuevo.pdf');
}

test('«Sugerir tablas» applies the clear tables of the marked PDFs and can undo them', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('select-item').nth(0).check();
  await page.getByTestId('select-item').nth(1).click({ modifiers: ['Shift'] });
  await page.getByTestId('select-item').nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('selection-bar')).toContainText('3 seleccionados');

  await page.getByTestId('bulk-tables').click();
  const dialog = page.getByTestId('pagemap-batch');
  await expect(dialog).toContainText('Pueden recibir una tabla: 2 de 3 PDF');
  await expect(dialog).toContainText('Se omiten: sin versión B');
  await page.getByTestId('pagemap-batch-start').click();

  await expect(page.getByTestId('pagemap-batch-done')).toContainText('Tablas aplicadas: 2');
  const rows = page.getByTestId('pagemap-batch-rows').locator('.pmb-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Aplicada · 1 de 2 emparejadas');
  await page.getByTestId('pagemap-batch-close').click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByTestId('bulk-undo')).toContainText('Tablas de páginas aplicadas: 2');
  await expect(page.getByText('Páginas emparejadas').first()).toBeVisible();

  // Undo removes the tables again: a second run offers them once more.
  await page.getByTestId('bulk-undo-btn').click();
  await page.getByTestId('bulk-tables').click();
  await expect(page.getByTestId('pagemap-batch')).toContainText('Pueden recibir una tabla: 2 de 3 PDF');
});

test('«Sugerir tablas» is disabled when no marked PDF has a B', async ({ page }) => {
  await openPanel(page);
  await page.getByRole('checkbox', { name: /Seleccionar factura-0333/ }).check();
  await expect(page.getByTestId('bulk-tables')).toBeDisabled();
});
