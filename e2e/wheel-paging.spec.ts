import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { stubAnalytics } from './helpers';

async function openThreePages(page: Page) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i += 1) doc.addPage([400, 500]);
  const buffer = Buffer.from(await doc.save());
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles({ name: 'tres.pdf', mimeType: 'application/pdf', buffer });
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await page.waitForTimeout(800);
}

/** Touch the edge, pause, then push: the same gesture a person makes with a mouse wheel. */
async function pushPastEdge(page: Page, deltaY: number) {
  const box = await page.locator('.viewer').boundingBox();
  if (!box) throw new Error('no viewer');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  for (let i = 0; i < 5; i += 1) {
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, deltaY);
  }
}

const pageLabel = (page: Page) => page.locator('.toolbar__badge').first();

test('the wheel past the bottom of the sheet goes to the next page and back', async ({ page }) => {
  await openThreePages(page);
  await page.keyboard.press('Shift+1');
  await expect(pageLabel(page)).toHaveText(/1 \/ 3/);
  await pushPastEdge(page, 100);
  await expect(pageLabel(page)).toHaveText(/2 \/ 3/);
  await page.waitForTimeout(900);
  await pushPastEdge(page, -100);
  await expect(pageLabel(page)).toHaveText(/1 \/ 3/);
});

test('a continuous burst (trackpad inertia) does not change page', async ({ page }) => {
  await openThreePages(page);
  await page.keyboard.press('Shift+1');
  const box = await page.locator('.viewer').boundingBox();
  if (!box) throw new Error('no viewer');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 30; i += 1) {
    await page.mouse.wheel(0, 40);
    await page.waitForTimeout(16);
  }
  await expect(pageLabel(page)).toHaveText(/1 \/ 3/);
});

test('the setting in ⋯ turns it off', async ({ page }) => {
  await openThreePages(page);
  await page.keyboard.press('Shift+1');
  await page.getByTestId('more-options').click();
  const toggle = page.getByTestId('wheel-paging');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  await pushPastEdge(page, 100);
  await expect(pageLabel(page)).toHaveText(/1 \/ 3/);
  await expect(page.getByTestId('wheel-edge')).toHaveCount(0);
});
