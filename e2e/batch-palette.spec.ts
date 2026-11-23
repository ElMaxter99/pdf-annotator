import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

/** Three PDFs, only factura-0331 has a template; opens the panel. */
async function openPanel(page: Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles(
      ['factura-0331', 'factura-0332', 'factura-0333'].map((n) =>
        file(`${n}.pdf`, pdf, 'application/pdf'),
      ),
    );
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('factura-0331.json', json, 'application/json'));
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(3);
}

test('Ctrl+K opens the palette in the batch panel and the footer hint is there', async ({
  page,
}) => {
  await openPanel(page);
  await expect(page.getByTestId('batch-keyhint')).toContainText('Ctrl+K');
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await expect(page.getByTestId('palette-row-review-next')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
});

test('actions without a selection are dimmed with their reason', async ({ page }) => {
  await openPanel(page);
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('listos');
  const row = page.getByTestId('palette-row-sel-ready');
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row).toContainText('Selecciona antes algún PDF');
});

test('marking as ready from the palette keeps the confirmation and the undo', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('select-all').check();
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('marcar');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('bulk-dialog')).toBeVisible();
  await page.getByTestId('bulk-confirm').click();
  await expect(page.getByTestId('bulk-undo')).toBeVisible();
  await expect(page.locator('.batch-bar__count')).toContainText('1 de 3 listos');
});

test('«Ir a» opens the PDF in the editor', async ({ page }) => {
  await openPanel(page);
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('0332');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/workspace**');
});

test('a filter from the palette changes the panel', async ({ page }) => {
  await openPanel(page);
  await page.keyboard.press('Control+k');
  await page.getByTestId('palette-input').fill('mostrar listos');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('panel-item')).toHaveCount(0);
});
