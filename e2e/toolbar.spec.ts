import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

async function open(page: import('@playwright/test').Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
}

for (const width of [1650, 1280, 1100]) {
  test(`the toolbar is a single row without overflow at ${width}px`, async ({ page }) => {
    await open(page, width);
    const boxes = await page
      .locator('.toolbar > *, .toolbar__cluster > *')
      .evaluateAll((nodes) =>
        nodes
          .filter((n) => (n as HTMLElement).offsetParent !== null)
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { top: (r.top + r.bottom) / 2, bottom: r.bottom, right: r.right };
          }),
      );
    const tops = boxes.map((b) => Math.round(b.top));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(6);
    expect(Math.max(...boxes.map((b) => b.right))).toBeLessThanOrEqual(width);
    const height = await page.locator('.toolbar').evaluate((n) => n.getBoundingClientRect().height);
    expect(height).toBeLessThan(60);
  });
}

test('at 1100px shortcuts, theme and language move into the ⋯ menu', async ({ page }) => {
  await open(page, 1100);
  await expect(page.getByRole('button', { name: 'Atajos de teclado' })).toBeHidden();
  await page.getByTestId('more-options').click();
  await expect(page.getByRole('button', { name: 'Atajos de teclado' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Atajos de teclado' })).toBeHidden();
});

test('«Limpiar» asks before removing the annotations', async ({ page }) => {
  await open(page, 1280);
  await page.locator('input[type=file][accept="application/json"]').setInputFiles('examples/anotaciones-ejemplo.json');
  await expect(page.locator('.annotation')).toHaveCount(10);
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('.annotation')).toHaveCount(10);
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await page.getByTestId('clear-confirm').click();
  await expect(page.locator('.annotation')).toHaveCount(0);
});
