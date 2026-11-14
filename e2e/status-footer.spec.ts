import { expect, test } from '@playwright/test';
import { addAnnotation, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

test('the footer shows zoom, a fit button and when the session was saved', async ({ page }) => {
  await expect(page.getByTestId('footer-zoom')).toHaveText('50 %');
  await expect(page.getByTestId('saved-ago')).toHaveCount(0);
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await expect(page.getByTestId('saved-ago')).toContainText('Guardado hace', { timeout: 5000 });
  await page.keyboard.press('+');
  await expect(page.getByTestId('footer-zoom')).toHaveText('75 %');
  await page.locator('.footer__fit').click();
  await expect(page.getByTestId('footer-zoom')).not.toHaveText('75 %');
});

test('credits live in «Acerca de» instead of the footer', async ({ page }) => {
  await expect(page.locator('.footer')).not.toContainText('Desarrollado por');
  await page.getByTestId('more-options').click();
  await page.getByTestId('about-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Desarrollado por');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
