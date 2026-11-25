import { expect, test } from '@playwright/test';
import { applyJsonText, jsonContent, jsonEditor, jsonValue, openWorkspace } from './helpers';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWorkspace(page);
  await applyJsonText(page, JSON.stringify({
    pages: [
      {
        num: 1,
        fields: [
          { x: 50, y: 700, mapField: 'nombre', type: 'text' },
          { x: 150, y: 700, mapField: 'dni', type: 'text' },
        ],
      },
    ],
  }, null, 2));
});

test('the margin arrows fold and unfold «pages»', async ({ page }) => {
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
  await page.locator('app-json-code-editor .cm-foldMarker').nth(1).click();
  await expect(jsonContent(page)).not.toContainText('"mapField": "dni"');
  await expect(page.locator('app-json-code-editor .cm-foldPlaceholder')).toHaveCount(1);
  await page.locator('app-json-code-editor .cm-foldPlaceholder').click();
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
});

test('«Plegar todo» and «Desplegar todo» keep the text intact', async ({ page }) => {
  const before = await jsonValue(page);
  await page.getByTestId('json-fold-all').click();
  await expect(jsonContent(page)).not.toContainText('"mapField": "dni"');
  expect(await jsonValue(page)).toBe(before);
  await page.getByTestId('json-unfold-all').click();
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
});

test('copying a selection that covers a folded block copies all of it', async ({ page }) => {
  await page.locator('app-json-code-editor .cm-foldMarker').nth(1).click();
  await expect(jsonContent(page)).not.toContainText('"mapField": "dni"');
  await jsonContent(page).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('"mapField": "dni"');
  expect(JSON.parse(copied)).toEqual(JSON.parse(await jsonValue(page)));
});

test('the fold shortcut works from the keyboard', async ({ page }) => {
  await jsonContent(page).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(jsonContent(page)).not.toContainText('"mapField": "dni"');
  await page.keyboard.press('Control+Shift+BracketRight');
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
});

test('the error line is marked', async ({ page }) => {
  await jsonContent(page).fill('{ "pages": [\n  { "num": 1 "fields": [] }\n] }');
  await expect(page.locator('app-json-code-editor .cm-errorLine')).toHaveCount(1);
  await expect(jsonEditor(page)).toBeVisible();
});
