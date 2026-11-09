import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

test('landing shows the drop zone, links to the repository and loads a PDF', async ({ page }) => {
  await page.goto('/landing');
  await expect(page.getByRole('heading', { name: /Maqueta coordenadas/ })).toBeVisible();
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
  await page.locator('input[type=file]').setInputFiles({
    name: 'nope.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.locator('.toast--error')).toContainText('PDF');
  await expect(page).toHaveURL(/landing/);
  await expect(page.locator('.landing__dropzone--error')).toContainText('Ese archivo no es un PDF');

  await page.getByRole('button', { name: 'Cerrar aviso' }).click();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('language can be switched', async ({ page }) => {
  await page.goto('/landing');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', { name: /Lay out coordinates/ })).toBeVisible();
});

test('the footer keeps the links to Batch mode, the guide and GitHub', async ({ page }) => {
  await page.goto('/landing');
  await expect(page.locator('.landing__mode')).toHaveCount(0);
  await page.getByRole('contentinfo').getByRole('link', { name: 'Modo Lotes' }).click();
  await page.waitForURL('**/batch/load');

  await page.goto('/landing');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Guía' }).click();
  await page.waitForURL('**/guide');
  await expect(page.getByRole('heading', { name: 'Todo lo que puede hacer PDF Annotator' })).toBeVisible();
});
