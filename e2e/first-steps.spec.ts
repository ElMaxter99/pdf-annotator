import { expect, test } from '@playwright/test';
import { addAnnotation, openSidebarTab, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

test('el editor vacío enseña tres pasos; al colocar el primer campo se van y sale una pista única', async ({ page }) => {
  await expect(page.getByTestId('first-steps')).toBeVisible();
  await expect(page.getByTestId('annotations-empty')).toBeVisible();
  await addAnnotation(page, 0.4, 0.3, 'Hola');
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
  await expect(page.getByTestId('first-hint')).toBeVisible();
  await expect(page.getByTestId('annotations-empty')).toHaveCount(0);
  // The hint is shown once: a fresh visit with annotations already placed brings nothing back.
  await page.reload();
  await expect(page.getByTestId('first-hint')).toHaveCount(0);
});

test('✕ cierra los tres pasos y no vuelven', async ({ page }) => {
  await page.getByTestId('first-steps-close').click();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.guide.steps'))).toBe('1');
});

test('«Pegar JSON» del estado vacío abre el editor de texto', async ({ page }) => {
  await openSidebarTab(page, 'Anotaciones');
  await page.getByTestId('empty-paste').click();
  await expect(page.locator('textarea.json-editor')).toBeFocused();
});
