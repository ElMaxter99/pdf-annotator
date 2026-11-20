import { expect, test } from '@playwright/test';
import { clickPage, fieldCount, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

async function centerOfCanvas(page: import('@playwright/test').Page) {
  const box = await page.locator('.canvas--pdf').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width / 2, y: box.y + box.height / 3 };
}

test('Ctrl + wheel zooms the PDF towards the cursor and shows the indicator', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await expect(zoom).toHaveText('50 %');
  const at = await centerOfCanvas(page);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(zoom).not.toHaveText('50 %');
  await expect(page.getByTestId('zoom-hud')).toBeVisible();
  await page.keyboard.down('Control');
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(zoom).toHaveText('400 %', { timeout: 10000 });
  await expect(page.getByTestId('zoom-hud')).toContainText('máximo');
});

test('Ctrl + 0 gives 100 % and Ctrl + minus zooms out without changing the browser zoom', async ({ page }) => {
  await page.keyboard.press('Control+0');
  await expect(page.getByTestId('footer-zoom')).toHaveText('100 %');
  await page.keyboard.press('Control+-');
  await expect(page.getByTestId('footer-zoom')).toHaveText('75 %');
  await page.keyboard.press('Shift+1');
  await expect(page.getByTestId('footer-zoom')).not.toHaveText('75 %');
});

test('holding Space and dragging moves the canvas without creating an annotation', async ({ page }) => {
  await page.keyboard.press('Control+0');
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect(page.getByTestId('footer-zoom')).toHaveText('150 %');
  const viewer = page.locator('.viewer');
  const before = await viewer.evaluate((el) => el.scrollTop);
  const at = await centerOfCanvas(page);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down(' ');
  await expect(page.getByTestId('pan-hud')).toBeVisible();
  await page.mouse.down();
  await page.mouse.move(at.x, at.y - 120, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up(' ');
  expect(await viewer.evaluate((el) => el.scrollTop)).toBeGreaterThan(before);
  await expect(page.locator('app-annotation-editor')).toHaveCount(0);
  await expect(page.getByTestId('pan-hud')).toHaveCount(0);
});

test('the footer zoom is a menu with presets', async ({ page }) => {
  await page.getByTestId('footer-zoom').click();
  const menu = page.getByTestId('zoom-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitemradio', { name: /^125 %/ }).click();
  await expect(page.getByTestId('footer-zoom')).toHaveText('125 %');
  await expect(menu).toHaveCount(0);
  await page.getByTestId('footer-zoom').click();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('the point under the cursor stays put while zooming with the wheel', async ({ page }) => {
  await page.keyboard.press('Control+0');
  await page.keyboard.press('Control+=');
  await page.keyboard.press('Control+=');
  await expect(page.getByTestId('footer-zoom')).toHaveText('150 %');
  const canvas = page.locator('.canvas--pdf');
  const box = (await canvas.boundingBox())!;
  const view = (await page.locator('.viewer').boundingBox())!;
  const at = { x: view.x + view.width * 0.5, y: view.y + view.height * 0.4 };
  const fx = (at.x - box.x) / box.width;
  const fy = (at.y - box.y) / box.height;
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(page.getByTestId('footer-zoom')).toHaveText('166 %');
  await page.waitForTimeout(400);
  const after = (await canvas.boundingBox())!;
  expect(Math.abs((at.x - after.x) / after.width - fx)).toBeLessThan(0.02);
  expect(Math.abs((at.y - after.y) / after.height - fy)).toBeLessThan(0.02);
});

async function middleDoubleClick(page: import('@playwright/test').Page, x: number, y: number) {
  await page.mouse.move(x, y);
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.down({ button: 'middle' });
    await page.mouse.up({ button: 'middle' });
  }
}

async function pointOnPage(page: import('@playwright/test').Page, fx: number, fy: number) {
  const box = (await page.locator('.hitbox').boundingBox())!;
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test('a middle-button double click toggles 100 % and fit to width', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await page.keyboard.press('0');
  await page.waitForTimeout(600);
  const fitText = (await zoom.innerText()).trim();
  await page.keyboard.press('Control+0');
  await expect(zoom).toHaveText('100 %');
  const at = await pointOnPage(page, 0.5, 0.3);
  await middleDoubleClick(page, at.x, at.y);
  await expect(zoom).toHaveText(fitText);
  await expect(page.getByTestId('zoom-hud')).toBeVisible();
  const again = await pointOnPage(page, 0.5, 0.3);
  await middleDoubleClick(page, again.x, again.y);
  await expect(zoom).toHaveText('100 %');
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
});

test('from any other zoom the double click goes to 100 %', async ({ page }) => {
  await expect(page.getByTestId('footer-zoom')).toHaveText('50 %');
  const at = await pointOnPage(page, 0.5, 0.3);
  await middleDoubleClick(page, at.x, at.y);
  await expect(page.getByTestId('footer-zoom')).toHaveText('100 %');
});

test('Ctrl + double click on an empty area toggles the zoom without creating an annotation', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await expect(zoom).toHaveText('50 %');
  const at = await pointOnPage(page, 0.5, 0.5);
  await page.mouse.move(at.x, at.y);
  await page.keyboard.down('Control');
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Control');
  await expect(zoom).toHaveText('100 %');
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
  expect(await fieldCount(page)).toBe(0);
});

test('a plain click still creates an annotation', async ({ page }) => {
  await clickPage(page, 0.5, 0.5);
  await expect(page.locator('.annotation-editor')).toBeVisible();
});

test('the double click is ignored while an annotation editor is open', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await clickPage(page, 0.5, 0.5);
  await expect(page.locator('.annotation-editor')).toBeVisible();
  const at = await pointOnPage(page, 0.1, 0.9);
  await middleDoubleClick(page, at.x, at.y);
  await page.waitForTimeout(500);
  await expect(zoom).toHaveText('50 %');
});

test('two middle clicks far apart or too slow are not a double click', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  const a = await pointOnPage(page, 0.2, 0.2);
  const b = await pointOnPage(page, 0.8, 0.8);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await page.mouse.move(b.x, b.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.up({ button: 'middle' });
  await page.waitForTimeout(500);
  await expect(zoom).toHaveText('50 %');
});
