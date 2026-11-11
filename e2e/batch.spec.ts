import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const FIELDS = JSON.parse(json.toString()).pages[0].fields.length as number;

const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

/** Opens the tray with one original (PDF + JSON) and its new version already paired. */
async function openBatch(page: Page, options: { withB?: boolean } = {}) {
  await stubAnalytics(page);
  await page.goto('/lote');
  await expect(
    page.getByRole('heading', { name: 'Empieza soltando tus PDF originales (A)' }),
  ).toBeVisible();
  await page
    .getByTestId('input-a')
    .setInputFiles([
      file('factura-0331.pdf', pdf, 'application/pdf'),
      file('factura-0331.json', json, 'application/json'),
    ]);
  await expect(page.getByTestId('batch-row')).toHaveCount(1);
  await expect(page.getByTestId('batch-row')).toContainText(`${FIELDS} campos en A`);
  if (options.withB !== false) {
    await page
      .getByTestId('input-b')
      .setInputFiles(file('factura-0331-nuevo.pdf', pdf, 'application/pdf'));
    await expect(page.getByTestId('batch-row')).toContainText('Por revisar');
  }
}

async function openRow(page: Page) {
  await page.getByTestId('review-next').click();
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
}

test('the tray starts empty and pairs the new version by name', async ({ page }) => {
  await openBatch(page);
  await expect(page.getByTestId('batch-row')).toContainText('factura-0331-nuevo.pdf');
  await expect(page.getByTestId('review-next')).toBeEnabled();
  await expect(page.getByTestId('download-ready')).toBeDisabled();
});

test('an unpaired new version is reported and can be assigned from its row', async ({ page }) => {
  await openBatch(page, { withB: false });
  await page
    .getByTestId('input-b')
    .setInputFiles(file('otro-documento.pdf', pdf, 'application/pdf'));
  await expect(page.locator('.toast--warning')).toContainText('sin pareja');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Subir B' }).click();
  await (await chooser).setFiles(file('cualquier-nombre.pdf', pdf, 'application/pdf'));
  await expect(page.getByTestId('batch-row')).toContainText('cualquier-nombre.pdf');
});

test('B starts empty, A can be put in and the PDF is marked ready and downloaded', async ({
  page,
}) => {
  await openBatch(page);
  await openRow(page);

  await expect(page.getByTestId('mark-ready')).toBeDisabled();
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(FIELDS);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await expect(page.getByTestId('mark-ready')).toBeEnabled();

  // A single undo step takes the template back out.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(FIELDS);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page.getByTestId('mark-ready').click();
  await expect(page.getByRole('dialog')).toContainText('factura-0331-nuevo.pdf');
  await page.getByTestId('confirm-ready').click();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('batch-row')).toContainText('Listo');
  await expect(page.locator('.batch-bar__count')).toHaveText('1 de 1 listos');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-ready').click(),
  ]);
  expect(download.suggestedFilename()).toBe('factura-0331-nuevo.json');
  const content = JSON.parse(readFileSync((await download.path()) as string, 'utf8'));
  expect(content.pages[0].fields).toHaveLength(FIELDS);
});

test('missing fields block «Listo» until each one is placed or dismissed', async ({ page }) => {
  await openBatch(page);
  await openRow(page);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  // Remove one annotation from B: it reappears as «Falta en B».
  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(1);
  await expect(page.getByTestId('mark-ready')).toBeDisabled();
  await expect(page.getByTestId('mark-ready')).toContainText('faltan 1');
  await expect(page.locator('.reference-field--missing')).toHaveCount(1);

  await page.getByTestId('place-missing').click();
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await page.getByTestId('dismiss-missing').click();
  await expect(page.getByTestId('mark-ready')).toBeEnabled();
  await expect(page.locator('.migration-dismissed')).toContainText('Descartados de A (1)');
});

test('a moved field is reported and A can be seen alone by holding the A key', async ({ page }) => {
  await openBatch(page);
  await openRow(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();

  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.migration-row[data-status="moved"]')).toHaveCount(1);
  await expect(page.locator('.reference-field')).toHaveCount(1);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('a');
  await expect(page.locator('.canvas-container--reference-only')).toHaveCount(1);
  await expect(page.locator('.reference-field--solo')).toHaveCount(FIELDS);
  await page.keyboard.up('a');
  await expect(page.locator('.canvas-container--reference-only')).toHaveCount(0);
});

test('the batch and B survive a reload of the tray', async ({ page }) => {
  await openBatch(page);
  await openRow(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await page.waitForTimeout(600); // autosave debounce
  await page.getByTestId('back-to-batch').click();
  await page.waitForURL('**/lote');

  await page.reload();
  await expect(page.getByTestId('batch-row')).toHaveCount(1);
  await openRow(page);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
});
