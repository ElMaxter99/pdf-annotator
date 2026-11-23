import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics, openLote } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

/** B = a new cover page followed by the invoice (A): every page of B is one past its page in A. */
async function openWithCover(page: Page) {
  const out = await PDFDocument.create();
  out.addPage([595, 842]);
  const source = await PDFDocument.load(pdf);
  const [copy] = await out.copyPages(source, [0]);
  out.addPage(copy);
  const withCover = Buffer.from(await out.save());
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf', pdf), file('factura-0332.pdf', pdf)]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles({ name: 'factura-0331.json', mimeType: 'application/json', buffer: json });
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page.getByTestId('input-b').setInputFiles(file('factura-0331-nuevo.pdf', withCover));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await openLote(page);
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('pages-differ')).toContainText('A 1 págs · B 2 págs');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

const badge = (page: Page) => page.locator('.toolbar__badge[aria-live="polite"]').first();

test('page table: shifting by one pairs B 2 with A 1 and B 1 has no match', async ({ page }) => {
  await openWithCover(page);
  await page.getByTestId('notice-pages-map').click();
  const dialog = page.getByTestId('page-map-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('pm-note-number')).toBeVisible();
  await expect(page.getByTestId('pm-apply')).toBeDisabled();

  await page.getByTestId('pm-shift-back').click();
  await expect(page.getByTestId('pm-row-1').locator('select')).toHaveValue('');
  await expect(page.getByTestId('pm-row-2').locator('select')).toHaveValue('1');
  await expect(page.getByTestId('pm-summary')).toContainText('1 de 2');
  await page.getByTestId('pm-apply').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Páginas emparejadas: 1 de 2')).toBeVisible();
  await expect(page.getByTestId('pages-link')).toContainText('Páginas emparejadas');

  // B 1 has no page of A; B 2 goes with A 1.
  await expect(page.getByTestId('ghost-a')).toContainText('B 1 no tiene equivalente en A');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('ArrowRight');
  await expect(badge(page)).toContainText('2 / 2');
  await expect(page.getByTestId('ghost-a')).toHaveCount(0);
});

test('page table: «Sugerir por textos» finds the shift and «Poner plantilla A» copies by the table', async ({
  page,
}) => {
  await openWithCover(page);
  await page.getByTestId('notice-pages-map').click();
  await page.getByTestId('pm-suggest').click();
  await expect(page.getByTestId('pm-note-suggested')).toBeVisible();
  await expect(page.getByTestId('pm-row-2').locator('select')).toHaveValue('1');
  await expect(page.getByTestId('pm-row-1').locator('select')).toHaveValue('');
  await page.getByTestId('pm-apply').click();

  await openLote(page);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await expect(page.getByText('páginas con equivalente: 1 · sin equivalente: 1')).toBeVisible();
});

test('page table: a repeated page warns and cancelling leaves the table alone', async ({ page }) => {
  await openWithCover(page);
  await page.getByTestId('pages-menu').click();
  await page.getByTestId('pages-menu-map').click();
  await page.getByTestId('pm-row-1').locator('select').selectOption('1');
  await page.getByTestId('pm-row-2').locator('select').selectOption('1');
  await expect(page.getByTestId('pm-note-repeated')).toBeVisible();
  await expect(page.getByTestId('pm-row-1')).toContainText('Repetida');
  await page.getByTestId('pm-cancel').click();
  await expect(page.getByTestId('page-map-dialog')).toHaveCount(0);
  await expect(page.getByTestId('pages-link')).toContainText('Páginas enlazadas');
});

test('page table: it survives a reload and the notice says the pages are matched', async ({
  page,
}) => {
  await openWithCover(page);
  await page.getByTestId('notice-pages-map').click();
  await page.getByTestId('pm-shift-back').click();
  await page.getByTestId('pm-apply').click();
  await expect(page.getByTestId('pages-link')).toContainText('Páginas emparejadas');

  // The notice now says the pages are matched with the table.
  await expect(page.getByTestId('pages-differ')).toContainText('emparejadas con la tabla');

  await page.reload();
  await openLote(page);
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('pages-link')).toContainText('Páginas emparejadas');
  await page.getByTestId('pages-menu').click();
  await page.getByTestId('pages-menu-map').click();
  await expect(page.getByTestId('pm-row-1').locator('select')).toHaveValue('');
  await expect(page.getByTestId('pm-row-2').locator('select')).toHaveValue('1');
});
