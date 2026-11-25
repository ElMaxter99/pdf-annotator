import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const file = (name: string) => ({ name, mimeType: 'application/pdf', buffer: pdf });

async function openPanel(page: Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf'), file('factura-0332.pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
}

test('«Añadir PDFs A» crea filas nuevas, omite duplicados y se puede deshacer', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('add-a-open').click();
  await page
    .getByTestId('add-a-input')
    .setInputFiles([file('anexo-1.pdf'), file('factura-0331.pdf')]);
  await expect(page.getByTestId('add-a-rows')).toContainText('Ya está en el lote');
  await page.getByTestId('add-a-next').click();
  await page.getByTestId('add-a-go').click();
  await expect(page.getByTestId('add-a-done')).toContainText('1 PDF A añadidos');
  await page.getByTestId('add-a-close').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(3);

  await page.getByTestId('bulk-undo-btn').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
});

test('«Reemplazar A» confirma lo que se descarta y se puede deshacer', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await page.getByTestId('row-replace-a').first().click();
  await page.getByTestId('input-row-a').setInputFiles(file('nuevo-a.pdf'));
  const dialog = page.getByTestId('replace-a');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('nuevo-a.pdf');
  await page.getByTestId('replace-a-yes').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('bulk-undo')).toContainText('A reemplazado');
  await expect(page.getByTestId('panel-item').filter({ hasText: 'nuevo-a.pdf' })).toHaveCount(1);

  await page.getByTestId('bulk-undo-btn').click();
  await expect(page.getByTestId('panel-item').filter({ hasText: 'nuevo-a.pdf' })).toHaveCount(0);
});
