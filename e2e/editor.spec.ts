import { expect, test } from '@playwright/test';
import { addAnnotation, clickPage, fieldCount, openWorkspace, readJson } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

test('creating an annotation opens a focused editor and stores the field', async ({ page }) => {
  await clickPage(page, 0.5, 0.5);
  const editor = page.locator('.annotation-editor');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.editor-title')).toBeVisible();
  await expect(editor.locator('.editor-actions button')).toHaveCount(2);
  expect(await page.evaluate(() => !!document.activeElement?.closest('.annotation-editor'))).toBe(true);

  await page.keyboard.type('Hola');
  await editor.locator('.action-primary').click();

  await expect(page.locator('.annotation')).toHaveCount(1);
  await expect.poll(() => fieldCount(page)).toBe(1);
  const json = await readJson(page);
  expect(json.pages[0].fields[0]).toMatchObject({ mapField: 'Hola', type: 'text' });
});

test('colour inputs stay in sync and the font dropdown is searchable', async ({ page }) => {
  await clickPage(page, 0.5, 0.5);
  const inputs = page.locator('.annotation-editor .color-inputs input');
  await inputs.first().fill('#ff0000');
  await page.getByTestId('editor-more').click();
  await expect(page.locator('.annotation-editor .editor-extra input[placeholder^="rgb"]')).toHaveValue('rgb(255, 0, 0)');

  await page.locator('.font-dropdown__trigger').click();
  await expect(page.locator('.font-dropdown__panel')).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.classList.contains('font-dropdown__search'))).toBe(true);
  await page.locator('.font-dropdown__option').nth(2).click();
  await expect(page.locator('.font-dropdown__panel')).toHaveCount(0);
});

test('number type exposes decimals and appender', async ({ page }) => {
  await clickPage(page, 0.5, 0.5);
  const editor = page.locator('.annotation-editor');
  await expect(editor.locator('.field-small')).toHaveCount(2);
  await editor.locator('.type-seg__opt', { hasText: 'Número' }).click();
  await expect(editor.locator('.field-small')).toHaveCount(4);
});

test('editing shows coordinates, duplicate and delete; locking disables fields', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await page.locator('.annotation').first().click();
  const editor = page.locator('.annotation-editor.editing');
  await expect(editor).toBeVisible();
  await expect(editor.locator('.editor-title')).toBeVisible();
  await page.getByTestId('editor-more').click();
  await expect(editor.locator('input[readonly]')).toHaveValue(/^X: /);
  await expect(editor.locator('.editor-actions button')).toHaveCount(4);

  const lock = editor.locator('.editor-extra .toggle-control input').first();
  await lock.check();
  await expect(editor.locator('input[type=text][disabled]')).toHaveCount(4);
  await expect(editor.locator('.editor-extra .toggle-control input').nth(1)).toBeDisabled();
  await lock.uncheck();

  await editor.locator('.editor-actions button').first().click(); // duplicate
  await expect.poll(() => fieldCount(page)).toBe(2);

  await page.locator('.annotation').first().click();
  await page.locator('.btn-delete').click();
  await expect.poll(() => fieldCount(page)).toBe(1);
});

async function expectEditorInsideViewer(page: import('@playwright/test').Page) {
  const editor = page.locator('.annotation-editor');
  await expect(editor).toBeVisible();
  const box = await editor.boundingBox();
  const viewer = await page.locator('.viewer').boundingBox();
  expect(box && viewer).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(viewer!.x - 1);
  expect(box!.y).toBeGreaterThanOrEqual(viewer!.y - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewer!.x + viewer!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewer!.y + viewer!.height + 1);
}

test('the editor box never leaves the viewer, even clicking at the bottom or right edge', async ({ page }) => {
  await clickPage(page, 0.5, 0.97);
  await expectEditorInsideViewer(page);
  await page.keyboard.press('Escape');
  await clickPage(page, 0.97, 0.5);
  await expectEditorInsideViewer(page);
  await page.keyboard.press('Escape');
  await clickPage(page, 0.97, 0.97);
  await expectEditorInsideViewer(page);
});

test('a short window turns the editor into a bottom sheet and "more options" stays inside', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 560 });
  await clickPage(page, 0.4, 0.3);
  const editor = page.locator('.annotation-editor');
  await expect(editor).toHaveAttribute('data-placement', 'sheet');
  await page.getByTestId('editor-more').click();
  await expectEditorInsideViewer(page);
  await expect(editor.locator('.editor-actions .action-primary')).toBeInViewport();
});

test('accepting an empty new annotation shows an error instead of closing', async ({ page }) => {
  await clickPage(page, 0.4, 0.4);
  await page.locator('.annotation-editor .action-primary').click();
  await expect(page.locator('.annotation-editor .field-error')).toBeVisible();
  await expect.poll(() => fieldCount(page)).toBe(0);
});

test('Escape and outside clicks cancel the editor', async ({ page }) => {
  await clickPage(page, 0.4, 0.4);
  await expect(page.locator('.annotation-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.annotation-editor')).toHaveCount(0);

  await clickPage(page, 0.4, 0.4);
  await expect(page.locator('.annotation-editor')).toBeVisible();
  await page.locator('header.header').click({ position: { x: 5, y: 5 } });
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
  await expect.poll(() => fieldCount(page)).toBe(0);
});

test('keyboard shortcuts: zoom, fit width, sidebar and help dialog', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await expect(zoom).toHaveText('50 %'); // 1.5× minus four zoom-out steps
  await page.keyboard.press('+');
  await expect(zoom).toHaveText('75 %');
  await page.keyboard.press('0'); // fit to width
  await expect(zoom).not.toHaveText('75 %');

  await page.keyboard.press('b');
  await expect(page.locator('.sidebar--minimized')).toHaveCount(1);
  await page.keyboard.press('b');
  await expect(page.locator('.sidebar--minimized')).toHaveCount(0);

  await page.keyboard.press('Shift+?');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('single-key shortcuts are ignored while typing', async ({ page }) => {
  await page.locator('app-json-code-editor .cm-content').click();
  await page.keyboard.type('b');
  await expect(page.locator('.sidebar--minimized')).toHaveCount(0);
});

test('rapid zoom changes leave the page rendered at the final scale', async ({ page }) => {
  const zoom = page.getByTestId('footer-zoom');
  await expect(zoom).toHaveText('50 %');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(zoom).toHaveText('125 %');
  await expect
    .poll(() => page.locator('.canvas--pdf').evaluate((c) => (c as HTMLCanvasElement).width))
    .toBe(Math.floor(595 * 1.25));
  await expect(page.locator('.canvas--pdf')).toBeVisible();
});

test('dialogs trap focus and give it back on close', async ({ page }) => {
  await page.keyboard.press('Shift+?');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
