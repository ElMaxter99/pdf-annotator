import { expect, test } from '@playwright/test';
import { addAnnotation, EXAMPLE_PDF, fieldCount, openWorkspace, stubAnalytics } from './helpers';

test('a first visit offers no saved session', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await expect(page.getByText('Continuar donde lo dejaste')).toHaveCount(0);
});

test('annotations, page and zoom survive a reload and can be resumed from the landing', async ({ page }) => {
  await openWorkspace(page);
  await addAnnotation(page, 0.3, 0.3, 'recuperame');
  await expect.poll(() => fieldCount(page)).toBe(1);
  await page.keyboard.press('+'); // 0.5 → 0.75
  const zoom = page.locator('.toolbar__badge').nth(1);
  await expect(zoom).toHaveText('0.75×');
  await page.waitForTimeout(1200); // autosave debounce

  await page.goto('/landing');
  const banner = page.locator('.landing__resume');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('factura-ejemplo.pdf');
  await expect(banner).toContainText('anotaciones: 1');

  await banner.getByRole('button', { name: 'Continuar' }).click();
  await page.waitForURL('**/workspace');
  await expect(page.locator('.annotation')).toHaveText(['recuperame']);
  await expect(zoom).toHaveText('0.75×');
  await expect.poll(() => fieldCount(page)).toBe(1);
  await expect(page.getByRole('button', { name: /Deshacer/ })).toBeDisabled();
});

test('a saved session can be discarded', async ({ page }) => {
  await openWorkspace(page);
  await addAnnotation(page, 0.3, 0.3, 'adios');
  await page.waitForTimeout(1200);

  await page.goto('/landing');
  await page.locator('.landing__resume').getByRole('button', { name: 'Descartar' }).click();
  await expect(page.locator('.landing__resume')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('descartada');

  await page.reload();
  await expect(page.locator('.landing__resume')).toHaveCount(0);
});

test('opening a PDF and leaving without annotating keeps the previous session', async ({ page }) => {
  await openWorkspace(page);
  await addAnnotation(page, 0.3, 0.3, 'previa');
  await page.waitForTimeout(1200);

  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await page.waitForTimeout(1200);

  await page.goto('/landing');
  await expect(page.locator('.landing__resume')).toContainText('anotaciones: 1');
});

test('clearing every annotation removes the saved session', async ({ page }) => {
  await openWorkspace(page);
  await addAnnotation(page, 0.3, 0.3, 'temporal');
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Limpiar/ }).click();
  await page.waitForTimeout(1200);

  await page.goto('/landing');
  await expect(page.locator('.landing__resume')).toHaveCount(0);
});
