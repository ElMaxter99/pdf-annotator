import { expect, test } from '@playwright/test';
import { applyJsonText, openWorkspace } from './helpers';

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openWorkspace(page);
  await applyJsonText(page, {
    pages: [
      { num: 1, fields: [{ x: 50, y: 700, mapField: "O'Brien", fontSize: 12, type: 'text' }] },
    ],
  });
});

const clipboard = (page: import('@playwright/test').Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test('copy keeps plain JSON by default', async ({ page }) => {
  await page.getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  const text = await clipboard(page);
  expect(JSON.parse(text)).toEqual(JSON.parse(await page.locator('.json-editor').inputValue()));
  expect(JSON.parse(text).pages[0].fields[0].mapField).toBe("O'Brien");
});

test('the JS/TS preset copies unquoted keys and single quotes, and remembers the choice', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Formato al copiar' }).click();
  await page.getByRole('button', { name: 'Objeto JS/TS' }).click();
  await expect(page.getByTestId('json-copy-preview')).toContainText("mapField: 'nombre',");
  await page.getByTestId('json-copy-with').click();
  const text = await clipboard(page);
  expect(text).toContain("mapField: 'O\\'Brien',");
  expect(text).toContain('pages: [');
  expect(text).not.toContain('"pages"');
  await expect(page.locator('.toast')).toContainText('Objeto JS/TS');

  // The plain button now uses the saved format, also after a reload of the stored value.
  await page.getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  expect(await clipboard(page)).toContain('pages: [');
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.jsonCopyFormat'));
  expect(JSON.parse(stored!)).toEqual({
    keys: 'bare',
    quote: 'single',
    indent: '2',
    trailingComma: true,
  });

  // The editor itself stays valid JSON.
  await expect(page.locator('.json-editor')).toHaveValue(/"pages"/);
});

test('Escape closes the format panel', async ({ page }) => {
  await page.getByRole('button', { name: 'Formato al copiar' }).click();
  await expect(page.getByRole('dialog', { name: 'Formato al copiar' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Formato al copiar' })).toHaveCount(0);
});

test('plain copy turns loose editor text (bare keys, single quotes) into valid JSON', async ({
  page,
}) => {
  await page
    .locator('.json-editor')
    .fill("{ pages: [ { num: 1, fields: [ { x: 50, y: 700, mapField: 'nombre', type: 'text' } ] } ] }");
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  const text = await clipboard(page);
  expect(text).toContain('"pages"');
  expect(JSON.parse(text).pages[0].fields[0].mapField).toBe('nombre');
});

test('copy still works without the async clipboard API', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await page.getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  await expect(page.locator('.toast--error')).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('JSON');
});
