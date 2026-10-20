import { expect, test } from '@playwright/test';
import { addAnnotation, clickPage, fieldCount, openWorkspace, readJson } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

test('creating an annotation opens a focused editor and stores the field', async ({ page }) => {
  await clickPage(page, 0.5, 0.5);
  const editor = page.locator('.annotation-editor');
  await expect(editor).toBeVisible();
  await expect(page.locator('.editor-badge')).toHaveCount(0);
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
  await expect(inputs.nth(1)).toHaveValue('rgb(255, 0, 0)');

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
  await editor.locator('select').first().selectOption('number');
  await expect(editor.locator('.field-small')).toHaveCount(4);
});

test('editing shows coordinates, duplicate and delete; locking disables fields', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await page.locator('.annotation').first().click();
  const editor = page.locator('.annotation-editor.editing');
  await expect(editor).toBeVisible();
  await expect(page.locator('.editor-badge')).toHaveCount(1);
  await expect(editor.locator('input[readonly]')).toHaveValue(/^X: /);
  await expect(editor.locator('.editor-actions button')).toHaveCount(4);

  const lock = editor.locator('.toggle-control input').first();
  await lock.check();
  await expect(editor.locator('input[type=text][disabled]')).toHaveCount(4);
  await expect(editor.locator('.toggle-control input').nth(1)).toBeDisabled();
  await lock.uncheck();

  await editor.locator('.editor-actions button').first().click(); // duplicate
  await expect.poll(() => fieldCount(page)).toBe(2);

  await page.locator('.annotation').first().click();
  await page.locator('.btn-delete').click();
  await expect.poll(() => fieldCount(page)).toBe(1);
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
  expect(await fieldCount(page)).toBe(0);
});

test('keyboard shortcuts: zoom, fit width, sidebar and help dialog', async ({ page }) => {
  const zoom = page.locator('.toolbar__badge').nth(1);
  await expect(zoom).toHaveText('0.5×'); // 1.5× minus four zoom-out steps
  await page.keyboard.press('+');
  await expect(zoom).toHaveText('0.75×');
  await page.keyboard.press('0'); // fit to width
  await expect(zoom).not.toHaveText('0.75×');

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
  await page.locator('textarea.json-editor').click();
  await page.keyboard.type('b');
  await expect(page.locator('.sidebar--minimized')).toHaveCount(0);
});
