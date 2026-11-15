import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

/** Three PDFs, only factura-0331 has a template; opens the panel in list view. */
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
  await page.getByTestId('view-list').click();
}

const checkbox = (page: Page, name: string) =>
  page.getByRole('checkbox', { name: `Seleccionar ${name}` });

test('checkboxes, Shift range, Ctrl+A and Escape drive the selection bar', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);

  const boxes = page.getByTestId('select-item');
  await boxes.nth(0).check();
  await expect(page.getByTestId('selection-bar')).toContainText('1 seleccionados');

  await boxes.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('selection-bar')).toContainText('3 seleccionados');
  await expect(page.getByTestId('select-all-visible')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('selection-bar')).toContainText('3 seleccionados');
  await page.getByTestId('selection-clear').click();
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);
});

test('«Marcar Listo» skips PDFs without a template and can be undone', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('select-all').check();
  const ready = page.getByTestId('bulk-ready');
  await expect(ready).toContainText('1 / 3');
  await ready.click();
  await expect(page.getByTestId('bulk-dialog')).toContainText('Marcar 1 PDF como Listo');
  await expect(page.getByTestId('bulk-dialog')).toContainText('2 sin plantilla');
  await page.getByTestId('bulk-confirm').click();
  await expect(page.getByTestId('bulk-undo')).toContainText('1 PDF marcados como Listo');
  await expect(page.locator('.batch-bar__count')).toContainText('1 de 3 listos');

  await page.getByTestId('bulk-undo-btn').click();
  await expect(page.locator('.batch-bar__count')).toContainText('0 de 3 listos');
});

test('«Quitar» asks for the exact count and «Deshacer» brings the PDFs back', async ({ page }) => {
  await openPanel(page);
  await checkbox(page, 'factura-0332.pdf').check();
  await checkbox(page, 'factura-0333.pdf').check();
  await page.getByTestId('bulk-remove').click();
  await expect(page.getByTestId('bulk-dialog')).toContainText('Quitar 2 PDF del lote');
  await page.getByTestId('bulk-confirm').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(1);
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);

  await page.getByTestId('bulk-undo-btn').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(3);
});

test('a filter drops the hidden PDFs from the selection', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('select-all').check();
  await expect(page.getByTestId('selection-bar')).toContainText('3 seleccionados');
  await page.getByRole('button', { name: /Sin plantilla/ }).click();
  await expect(page.getByTestId('selection-bar')).toContainText('2 seleccionados');
  await page.getByRole('button', { name: /^Por revisar/ }).click();
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);
});
