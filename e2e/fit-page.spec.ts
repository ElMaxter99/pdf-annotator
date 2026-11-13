import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test('a freshly opened PDF is fitted to the viewer without scrolling', async ({ page }) => {
  await stubAnalytics(page, { fit: true });
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  const canvas = page.locator('.canvas--pdf');
  await expect(canvas).toBeVisible();
  await expect(page.locator('.toolbar__badge').nth(1)).not.toHaveText('150 %');
  await page.waitForTimeout(500);
  const fit = await canvas.evaluate((el) => {
    const viewer = el.closest('.viewer') as HTMLElement;
    return { scrollH: viewer.scrollHeight, clientH: viewer.clientHeight, scrollW: viewer.scrollWidth, clientW: viewer.clientWidth };
  });
  expect(fit.scrollH).toBeLessThanOrEqual(fit.clientH + 2);
  expect(fit.scrollW).toBeLessThanOrEqual(fit.clientW + 2);
});
