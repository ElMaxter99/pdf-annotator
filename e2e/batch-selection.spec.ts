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

async function pickSort(page: Page, key: string): Promise<void> {
  await page.getByTestId('sort-select').click();
  await page.getByTestId(`sort-select-${key}`).click();
}

test('shows when a PDF changed state, tags the latest and sorts by it', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('row-stamp')).toHaveCount(0);
  await page.getByTestId('select-all').check();
  await page.getByTestId('bulk-ready').click();
  await page.getByTestId('bulk-confirm').click();
  await expect(page.getByTestId('row-stamp')).toHaveCount(1);
  await expect(page.getByTestId('row-stamp')).toContainText('hoy');
  await expect(page.getByTestId('row-last')).toHaveText('Último');

  await pickSort(page, 'change');
  await expect(page.getByTestId('panel-item').first()).toContainText('factura-0331.pdf');
  await pickSort(page, 'name');
  await expect(page.getByTestId('panel-item').first()).toContainText('factura-0331.pdf');
  await page.getByTestId('sort-head').click();
  await expect(page.getByTestId('sort-select')).toHaveAttribute('data-value', 'change');

  await pickSort(page, 'name');
  await page.getByTestId('sort-select-dir').click();
  await expect(page.getByTestId('panel-item').last()).toContainText('factura-0331.pdf');
  await pickSort(page, 'state');
  await expect(page.getByTestId('sort-select-dir')).toBeDisabled();
});

test('the sort menu works with the keyboard and closes with Esc', async ({ page }) => {
  await openPanel(page);
  const trigger = page.getByTestId('sort-select');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByTestId('sort-select-state')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('sort-select-name')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('data-value', 'name');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('the «Deshacer» notice sits above the selection bar and never covers it', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('select-all').check();
  await page.getByTestId('bulk-ready').click();
  await page.getByTestId('bulk-confirm').click();
  const undo = page.getByTestId('bulk-undo');
  const bar = page.getByTestId('selection-bar');
  await expect(undo).toBeVisible();
  await expect(bar).toBeVisible();
  const [u, b] = await Promise.all([undo.boundingBox(), bar.boundingBox()]);
  expect(u!.y + u!.height).toBeLessThanOrEqual(b!.y);
  await expect(page.getByTestId('bulk-ready')).toBeVisible();
  await page.getByTestId('bulk-undo-btn').click();
  await expect(undo).toHaveCount(0);
  await expect(bar).toBeVisible();
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
  await page.getByRole('button', { name: /^Pendientes/ }).click();
  await expect(page.getByTestId('selection-bar')).toHaveCount(0);
});

test('the funnel counts the batch and its steps filter the list', async ({ page }) => {
  await openPanel(page);
  const funnel = page.getByTestId('batch-funnel');
  await expect(page.getByTestId('funnel-all')).toContainText('3');
  await expect(page.getByTestId('funnel-a')).toContainText('1');
  await expect(page.getByTestId('funnel-ai')).toContainText('0');
  await page.getByTestId('funnel-a').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(1);
  await expect(page.getByTestId('batch-showing')).toContainText('1 de 3');
  await page.getByRole('button', { name: 'Quitar filtros' }).click();
  await expect(page.getByTestId('panel-item')).toHaveCount(3);
  await expect(funnel).toBeVisible();
  await expect(page.getByTestId('row-why').first()).toBeVisible();
});
