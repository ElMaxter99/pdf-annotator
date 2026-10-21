import { expect, test } from '@playwright/test';
import { addAnnotation, EXAMPLE_JSON, jsonEditor, openSidebarTab, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page, { tab: 'Documento' }));

const tab = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('tab', { name: new RegExp(`^\\s*${name}`) });

test('the sidebar is organised in tabs and shows one section at a time', async ({ page }) => {
  await expect(page.getByRole('tab')).toHaveCount(4);
  await expect(tab(page, 'Documento')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sidebar-upload')).toBeVisible();
  await expect(page.locator('.sidebar-thumbnails')).toBeVisible();
  await expect(jsonEditor(page)).toBeHidden();
  await expect(page.locator('.templates')).toBeHidden();

  await openSidebarTab(page, 'Anotaciones');
  await expect(jsonEditor(page)).toBeVisible();
  await expect(page.locator('.sidebar-upload')).toBeHidden();

  await openSidebarTab(page, 'Plantillas');
  await expect(page.locator('.templates')).toBeVisible();

  await openSidebarTab(page, 'Avanzado');
  await expect(page.locator('.advanced-panel')).toBeVisible();
});

test('the cursor coordinates stay visible in every tab', async ({ page }) => {
  for (const name of ['Documento', 'Anotaciones', 'Plantillas', 'Avanzado'] as const) {
    await openSidebarTab(page, name);
    await expect(page.locator('.json-coords')).toBeVisible();
  }
});

test('the Anotaciones tab shows how many annotations there are', async ({ page }) => {
  await expect(tab(page, 'Anotaciones').locator('.sidebar-tab__badge')).toHaveCount(0);
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await expect(tab(page, 'Anotaciones').locator('.sidebar-tab__badge')).toHaveText('1');

  await page.locator('input[type=file][accept="application/json"]').setInputFiles(EXAMPLE_JSON);
  await expect(tab(page, 'Anotaciones').locator('.sidebar-tab__badge')).toHaveText('10');
});

test('tabs can be changed with the arrow keys, Home and End', async ({ page }) => {
  await tab(page, 'Documento').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Anotaciones')).toHaveAttribute('aria-selected', 'true');
  await expect(tab(page, 'Anotaciones')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab(page, 'Avanzado')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(tab(page, 'Documento')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'Avanzado')).toHaveAttribute('aria-selected', 'true');
});

test('the tab choice is kept when the sidebar is minimized and expanded again', async ({ page }) => {
  await openSidebarTab(page, 'Plantillas');
  await page.locator('.sidebar-minimize-toggle').click();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.locator('.sidebar-minimize-toggle').click();
  await expect(tab(page, 'Plantillas')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.templates')).toBeVisible();
});
