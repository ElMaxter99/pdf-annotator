import { expect, test } from '@playwright/test';
import { applyJsonText, jsonContent, jsonEditor, jsonValue, openWorkspace } from './helpers';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWorkspace(page);
  await applyJsonText(
    page,
    JSON.stringify(
      {
        pages: [
          {
            num: 1,
            fields: [
              { x: 50, y: 700, mapField: 'nombre', type: 'text' },
              { x: 150, y: 700, mapField: 'dni', type: 'text' },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
});

test('the margin arrows fold and unfold «pages»', async ({ page }) => {
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
  await page.locator('app-json-code-editor .cm-foldMarker').nth(1).click();
  await expect(jsonContent(page)).not.toContainText('"mapField": "dni"');
  await expect(page.locator('app-json-code-editor .cm-foldPlaceholder')).toHaveCount(1);
  await page.locator('app-json-code-editor .cm-foldPlaceholder').click();
  await expect(jsonContent(page)).toContainText('"mapField": "dni"');
});

test('every level folds and unfolds from its arrow, like VS Code', async ({ page }) => {
  // El margen lleva un elemento oculto que solo mide el ancho: se cuentan los visibles.
  const markers = page.locator('app-json-code-editor .cm-foldMarker').filter({ visible: true });
  // raíz, pages, página 1, fields, campo 1, campo 2
  await expect(markers).toHaveCount(6);
  for (const [index, hidden] of [
    [5, '"x": 150'],
    [4, '"x": 50'],
    [3, '"mapField": "nombre"'],
    [2, '"num": 1'],
  ] as const) {
    await markers.nth(index).click();
    await expect(jsonContent(page)).not.toContainText(hidden);
    await expect(
      page.locator('app-json-code-editor .cm-foldMarker--folded').filter({ visible: true }),
    ).toHaveCount(1);
    await expect(page.locator('app-json-code-editor .cm-foldedLine')).toHaveCount(1);
    await markers.nth(index).click();
    await expect(jsonContent(page)).toContainText(hidden);
    await expect(
      page.locator('app-json-code-editor .cm-foldMarker--folded').filter({ visible: true }),
    ).toHaveCount(0);
  }
});

test('copying flashes what was copied for a moment', async ({ page }) => {
  await jsonContent(page).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c');
  await expect(page.locator('app-json-code-editor .cm-copyFlash').first()).toBeVisible();
  await expect(page.locator('app-json-code-editor .cm-copyFlash')).toHaveCount(0, {
    timeout: 3000,
  });
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe('{\n  "pages": [\n');
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
