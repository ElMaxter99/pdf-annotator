import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

test('landing shows the drop zone, links to the repository and loads a PDF', async ({ page }) => {
  await page.goto('/landing');
  await expect(page.getByText('Carga tu PDF')).toBeVisible();
  await expect(page.locator('a[href="https://github.com/ElMaxter99/pdf-annotator"]').first()).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await expect(page.locator('.toolbar__badge').first()).toContainText('1 / 1');
});

test('"try with a sample document" opens the editor', async ({ page }) => {
  await page.goto('/landing');
  await page.getByText(/documento de ejemplo/i).click();
  await page.waitForURL('**/workspace');
  await expect(page.locator('.toolbar__badge').first()).toContainText('1 / 1');
});

test('rejects non-PDF files', async ({ page }) => {
  await page.goto('/landing');
  let message = '';
  page.once('dialog', async (dialog) => {
    message = dialog.message();
    await dialog.accept();
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'nope.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect.poll(() => message).toContain('PDF');
  await expect(page).toHaveURL(/landing/);
});

test('language can be switched', async ({ page }) => {
  await page.goto('/landing');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByText('Load your PDF')).toBeVisible();
});
