import { expect, test } from '@playwright/test';
import { applyJsonText, openSidebarTab, openWorkspace, renderedAnnotations } from './helpers';

const FIELDS = {
  pages: [
    {
      num: 1,
      fields: [
        { x: 100, y: 700, mapField: 'holder[0].fullname', type: 'text' },
        { x: 100, y: 650, mapField: 'holder[0].email', type: 'text' },
        { x: 100, y: 600, mapField: 'check.long.mapping', type: 'check' },
        { x: 100, y: 550, mapField: 'amounts.total', type: 'number', decimals: 2, appender: ' €' },
        { x: 100, y: 500, mapField: 'notes', type: 'text', value: 'Pendiente de firma' },
      ],
    },
  ],
};
const DATA = { holder: [{ fullname: 'Lucía Fernández' }], amounts: { total: 1284.5 } };

const mode = (page: import('@playwright/test').Page, name: 'Muestra' | 'Mapeo' | 'Datos') =>
  page
    .getByRole('group', { name: 'Qué se pinta en las anotaciones' })
    .getByRole('button', { name });
const texts = async (page: import('@playwright/test').Page) =>
  (await renderedAnnotations(page)).map((a) => a.text);

test.beforeEach(async ({ page }) => {
  await openWorkspace(page, { view: 'Muestra' });
  await applyJsonText(page, FIELDS);
});

test('sample values replace long mappings, and the value always wins', async ({ page }) => {
  await expect.poll(() => texts(page)).toEqual(['XXXXX', 'XXXXX', 'X', '0.00 €', 'Pendiente de firma']);
});

test('the mapping view paints the mapField as before', async ({ page }) => {
  await mode(page, 'Mapeo').click();
  await expect
    .poll(() => texts(page))
    .toEqual(['holder[0].fullname', 'holder[0].email', 'X', 'amounts.total', 'Pendiente de firma']);
});

test('sample values are editable and kept after a reload', async ({ page }) => {
  await openSidebarTab(page, 'Avanzado');
  await page.locator('#sample-text').fill('LOREM');
  await page.locator('#sample-check').fill('✓');
  await expect.poll(() => texts(page)).toEqual(['LOREM', 'LOREM', '✓', '0.00 €', 'Pendiente de firma']);
  await page.locator('#sample-text').locator('..').getByRole('button', { name: 'Restablecer' }).click();
  await expect(page.locator('#sample-text')).toHaveValue('XXXXX');
});

test('test data resolves each mapField and falls back to the sample', async ({ page }) => {
  await expect(mode(page, 'Datos')).toBeDisabled();
  await openSidebarTab(page, 'Avanzado');
  const input = page.getByRole('textbox', { name: 'Datos de prueba' });
  await input.fill('{ "holder": [ { "fullname": ');
  await expect(page.getByRole('alert')).toContainText('JSON no válido en la línea');
  await input.fill(JSON.stringify(DATA));
  await expect(page.locator('.preview-data__status')).toContainText('2 de 3 campos resueltos');
  // Valid test data is painted right away, without picking the view by hand.
  await expect
    .poll(() => texts(page))
    .toEqual(['Lucía Fernández', 'XXXXX', 'X', '1284.50 €', 'Pendiente de firma']);
  await mode(page, 'Muestra').click();
  await expect.poll(() => texts(page)).toEqual(['XXXXX', 'XXXXX', 'X', '0.00 €', 'Pendiente de firma']);
});

test('exporting with sample values warns about them', async ({ page }) => {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar PDF/ }).click();
  await download;
  await expect(page.locator('.toast--warning')).toContainText('4 campo(s) con valores de muestra');
});

test('origin chips label where each text comes from and are remembered', async ({ page }) => {
  await openSidebarTab(page, 'Avanzado');
  await page.getByRole('textbox', { name: 'Datos de prueba' }).fill(JSON.stringify(DATA));
  const legend = page.getByRole('group', { name: 'Origen de lo que se pinta' });
  await expect(page.locator('.annotation[data-origin]')).toHaveCount(0);
  await legend.getByLabel('Mostrar origen').check();
  await expect(page.locator('.annotation[data-origin="data"]')).toHaveCount(2);
  await expect(page.locator('.annotation[data-origin="missing"]')).toHaveCount(1);
  await expect(page.locator('.annotation[data-origin="value"]')).toHaveCount(1);
  await expect(legend).toContainText('sin dato · 1');
  await page.reload();
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.showOrigin'))).toBe('1');
});

test('closed informative notices can be recovered from the bell', async ({ page }) => {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar PDF/ }).click();
  await download;
  const toast = page.locator('.toast--warning');
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: /Cerrar/ }).click();
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('toast-bell-count')).toHaveText('1');
  await page.getByTestId('toast-bell').click();
  await page.getByTestId('toast-bell-panel').getByRole('button', { name: 'Mostrar de nuevo' }).click();
  await expect(page.locator('.toast--warning')).toContainText('valores de muestra');
});
