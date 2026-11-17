import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer) => ({ name, mimeType: 'application/pdf', buffer });

/** The invoice repeated: A has `pages` pages, B (the new version) has one. */
async function openWithPages(page: Page, pagesA: number, pagesB = 1) {
  const manyPages = async (count: number) => {
    const out = await PDFDocument.create();
    const source = await PDFDocument.load(pdf);
    const [copy] = await out.copyPages(source, [0]);
    out.addPage(copy);
    for (let i = 1; i < count; i += 1) out.addPage([595, 842]);
    return Buffer.from(await out.save());
  };
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('factura-0331.pdf', await manyPages(pagesA)),
      file('factura-0332.pdf', pdf),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles({ name: 'factura-0331.json', mimeType: 'application/json', buffer: json });
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', await manyPages(pagesB)));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a')).toBeVisible();
  // The page count of A is read asynchronously: wait for the header to know the linked range.
  await expect(page.locator('.toolbar__badge[aria-live="polite"]').first()).toContainText(
    `/ ${Math.max(pagesA, pagesB)}`,
  );
  // Single-key shortcuts are ignored while a button has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

const badge = (page: Page) => page.locator('.toolbar__badge[aria-live="polite"]').first();

test('A with 2 pages and B with 1: the linked range reaches page 2 and B shows it is empty', async ({
  page,
}) => {
  await openWithPages(page, 2);
  await expect(badge(page)).toContainText('1 / 2');
  await expect(page.getByTestId('pages-differ')).toContainText('A 2 págs · B 1 págs');
  await expect(page.getByTestId('ghost-b')).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(badge(page)).toContainText('2 / 2');
  await expect(page.getByTestId('ghost-b')).toContainText('B no tiene la página 2');
  await expect(page.getByTestId('ghost-a')).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expect(badge(page)).toContainText('2 / 2');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('ghost-b')).toHaveCount(0);
  await expect(badge(page)).toContainText('1 / 2');
});

test('B longer than A: A shows an empty pane on the pages it does not have', async ({ page }) => {
  await openWithPages(page, 1, 2);
  await page.keyboard.press('ArrowRight');
  await expect(badge(page)).toContainText('2 / 2');
  await expect(page.getByTestId('ghost-a')).toContainText('A no tiene la página 2');
  await expect(page.getByTestId('ghost-b')).toHaveCount(0);
});

test('free pages: A moves on its own and the chip links them again with undo', async ({ page }) => {
  await openWithPages(page, 2);
  const chip = page.getByTestId('pages-link');
  await expect(chip).toContainText('Páginas enlazadas');
  await expect(chip).toHaveAttribute('aria-pressed', 'false');

  await chip.click();
  await expect(chip).toContainText('Páginas libres');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pager-a')).toContainText('1 / 2');
  await page.getByTestId('pager-a').getByRole('button', { name: 'Página siguiente de A' }).click();
  await expect(page.getByTestId('pager-a')).toContainText('2 / 2');
  await expect(page.getByTestId('pager-b')).toContainText('1 / 1');
  await expect(page.getByTestId('page-offset')).toContainText('A 2 · B 1');
  await expect(page.getByTestId('ghost-a')).toHaveCount(0);
  await expect(page.getByTestId('ghost-b')).toHaveCount(0);

  await chip.click();
  await expect(chip).toContainText('Páginas enlazadas');
  await expect(page.getByTestId('pager-a')).toHaveCount(0);
  await expect(page.getByTestId('page-offset')).toHaveCount(0);
  await page.getByTestId('toast-action').click();
  await expect(chip).toContainText('Páginas libres');
  await expect(page.getByTestId('pager-a')).toContainText('2 / 2');
});

test('Shift + arrows move only A and free the pages', async ({ page }) => {
  await openWithPages(page, 2);
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('pages-link')).toContainText('Páginas libres');
  await expect(page.getByTestId('pager-a')).toContainText('2 / 2');
  await expect(badge(page)).toContainText('1 / 1');
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(page.getByTestId('pager-a')).toContainText('1 / 2');
});

test('«Poner plantilla A» with free pages asks before copying A page 1 into B', async ({
  page,
}) => {
  await openWithPages(page, 2);
  await page.getByTestId('pages-link').click();
  await page.getByTestId('pager-a').getByRole('button', { name: 'Página siguiente de A' }).click();
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-missing').click();
  await expect(page.getByText('Se copiará la página 2 de A en la página 1 de B')).toBeVisible();
});

test('in «A» and «Superpuesta» a free page of A gets its own label', async ({ page }) => {
  await openWithPages(page, 2);
  await page.keyboard.press('Shift+ArrowRight');
  await page.getByTestId('mode-overlay').click();
  await expect(page.getByTestId('page-tag')).toContainText('A p. 2');
});
