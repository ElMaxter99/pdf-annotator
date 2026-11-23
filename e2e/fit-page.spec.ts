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
    const v = viewer.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return {
      // El margen vertical (P-120) añade media altura del visor arriba y abajo a propósito.
      scrollH: viewer.scrollHeight - 2 * Math.round(viewer.clientHeight / 2),
      clientH: viewer.clientHeight,
      // The work margin (P-109) makes the viewer scroll sideways on purpose; what matters is that
      // the PDF itself sits fully inside the visible area, centred.
      insideLeft: r.left - v.left,
      insideRight: v.right - r.right,
    };
  });
  expect(fit.scrollH).toBeLessThanOrEqual(fit.clientH + 2);
  expect(fit.insideLeft).toBeGreaterThanOrEqual(-1);
  expect(fit.insideRight).toBeGreaterThanOrEqual(-1);
  expect(Math.abs(fit.insideLeft - fit.insideRight)).toBeLessThanOrEqual(4);
});
