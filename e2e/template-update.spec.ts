import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

/** Three PDFs; only factura-0331 starts with a template. Opens the panel. */
async function openPanel(page: Page) {
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
}

/** A long file: factura-0331 with one extra field, factura-0332 as in the example, plus a stray one. */
function longFile(): string {
  const base = JSON.parse(json.toString());
  const changed = JSON.parse(json.toString());
  changed.pages[0].fields.push({ x: 50, y: 50, mapField: 'nuevo.campo', fontSize: 12, color: '#000000', type: 'text' });
  return [
    JSON.stringify({ pdfName: 'factura-0331.pdf', ...changed }),
    JSON.stringify({ pdfName: 'factura-0332.pdf', ...base }),
    JSON.stringify({ pdfName: 'otra.pdf', ...base }),
  ].join('\n');
}

test('«Actualizar plantillas» pega un fichero largo, enseña los cambios y se puede deshacer', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('update-templates').click();
  const dialog = page.getByTestId('tpl-update');
  await dialog.getByTestId('tpl-tab-paste').click();
  await dialog.getByTestId('tpl-paste').fill(longFile());
  await dialog.getByTestId('tpl-match').click();
  await expect(dialog.getByTestId('tpl-found')).toContainText('3 plantillas reconocidas');

  const rows = dialog.getByTestId('tpl-rows');
  await expect(rows).toContainText('factura-0331.pdf');
  await expect(rows.locator('[data-kind=update]')).toHaveCount(1);
  await expect(rows.locator('[data-kind=new]')).toHaveCount(1);
  await expect(rows.locator('[data-kind=none]')).toHaveCount(1);
  await expect(dialog.getByTestId('tpl-summary')).toContainText('2');

  await dialog.getByTestId('tpl-review').click();
  await expect(dialog).toContainText('Actualizar 2 plantillas');
  await dialog.getByTestId('tpl-backup').uncheck();
  await dialog.getByTestId('tpl-apply').click();
  await expect(dialog.getByTestId('tpl-done')).toBeVisible();
  await expect(dialog).toContainText('2 plantillas actualizadas');
  await dialog.getByTestId('tpl-done').click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByTestId('bulk-undo')).toContainText('2 plantillas actualizadas');
  await page.getByTestId('bulk-undo-btn').click();
  await expect(page.getByTestId('bulk-undo')).toHaveCount(0);

  // After undoing, a second run finds the same two changes again.
  await page.getByTestId('update-templates').click();
  await page.getByTestId('tpl-tab-paste').click();
  await page.getByTestId('tpl-paste').fill(longFile());
  await page.getByTestId('tpl-match').click();
  await expect(page.getByTestId('tpl-rows').locator('[data-kind=update]')).toHaveCount(1);
});

test('«Actualizar plantillas» con JSON por PDF empareja por nombre de archivo y avisa si todo coincide', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('update-templates').click();
  const dialog = page.getByTestId('tpl-update');
  await dialog
    .getByTestId('tpl-input')
    .setInputFiles({ name: 'factura-0331.json', mimeType: 'application/json', buffer: json });
  await expect(dialog.getByTestId('tpl-rows').locator('[data-kind=same]')).toHaveCount(1);
  await expect(dialog).toContainText('Tus plantillas ya coinciden con el fichero');
  await expect(dialog.getByTestId('tpl-review')).toBeDisabled();
});

test('«Actualizar plantillas» señala un JSON roto con su línea', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('update-templates').click();
  const dialog = page.getByTestId('tpl-update');
  await dialog.getByTestId('tpl-tab-paste').click();
  await dialog.getByTestId('tpl-paste').fill('{ "pdfName": "a.pdf",\n "pages": [ { "num": 1,, } ] }');
  await dialog.getByTestId('tpl-match').click();
  await expect(dialog).toContainText('JSON no válido: revisa la línea');
});
