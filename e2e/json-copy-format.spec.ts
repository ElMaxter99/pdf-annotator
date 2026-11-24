import { readFileSync } from 'node:fs';
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

test('«Personalizar» rewrites the editor and drives copy and download with one format', async ({
  page,
}) => {
  const editor = page.locator('.json-editor');
  await expect(editor).toHaveValue(/"pages"/);
  await page.getByTestId('json-format-open').click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByRole('button', { name: "Simples '…'" }).click();
  await expect(page.getByTestId('json-format-preview')).toContainText("mapField: 'nombre',");
  await expect(editor).toHaveValue(/"pages"/); // nothing changes until «Aplicar»
  await page.getByTestId('json-format-apply').click();

  // The editor itself now shows the chosen format, and the panel says it is not strict JSON.
  await expect(editor).toHaveValue(/^\{\s*pages: \[/);
  await expect(editor).toHaveValue(/mapField: 'O\\'Brien'/);
  await expect(page.getByTestId('json-format-keys')).toContainText('Sin comillas');
  await expect(page.getByTestId('json-format-values')).toContainText('Simples');
  await expect(page.getByTestId('json-keys-notstrict')).toBeVisible();

  await page.getByRole('button', { name: 'Copiar JSON', exact: true }).click();
  expect(await clipboard(page)).toContain("mapField: 'O\\'Brien'");
  await expect(page.locator('.toast')).toContainText('JSON copiado');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar JSON', exact: true }).click(),
  ]);
  const downloaded = readFileSync((await download.path()) as string, 'utf8');
  expect(downloaded).toMatch(/^\{\s*pages: \[/);
  await expect(page.locator('.toast')).toContainText('formato no estricto');

  // The choice is remembered.
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.jsonCopyFormat'));
  expect(JSON.parse(stored!)).toMatchObject({ keys: 'bare', quote: 'single' });
});

test('«Personalizar» is a modal: Esc, ✕ and Cancelar close it without saving', async ({ page }) => {
  const editor = page.locator('.json-editor');
  const modal = page.getByRole('dialog', { name: 'Personalizar el JSON' });
  const open = page.getByTestId('json-format-open');
  await open.click();
  await expect(modal).toBeVisible();
  await page.getByTestId('json-format-keys-bare').click();
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(page.getByTestId('json-format-keys-quoted')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByTestId('json-format-close').click();
  await open.click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByTestId('json-format-cancel').click();
  await expect(modal).toHaveCount(0);
  await expect(editor).toHaveValue(/"pages"/);
  // «Restablecer» goes back to strict JSON, and «Aplicar» saves it.
  await open.click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByTestId('json-format-reset').click();
  await expect(page.getByTestId('json-format-chip')).toHaveClass(/jfm__chip--ok/);
});

test('plain copy turns loose editor text (bare keys, single quotes) into valid JSON', async ({
  page,
}) => {
  await page
    .locator('.json-editor')
    .fill(
      "{ pages: [ { num: 1, fields: [ { x: 50, y: 700, mapField: 'nombre', type: 'text' } ] } ] }",
    );
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

test('the format syncs with Options › Editor and a syntax error disables «Personalizar»', async ({
  page,
}) => {
  const editor = page.locator('.json-editor');
  await page.getByTestId('json-format-open').click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByTestId('json-format-apply').click();
  await expect(editor).toHaveValue(/^\{\s*pages: \[/);
  // Options › Editor shows the same value and changes it back.
  await page.getByTestId('more-options').click();
  await page.getByTestId('options-open').click();
  await expect(page.getByTestId('options-json-keys-bare')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('options-json-keys-quoted').click();
  await page.getByTestId('options-close').click();
  await expect(editor).toHaveValue(/"pages"/);
  await expect(page.getByTestId('json-keys-notstrict')).toHaveCount(0);
  // A syntax error disables the button.
  await editor.fill('{ pages: [');
  await expect(page.getByTestId('json-format-open')).toBeDisabled();
});

test('changing the format keeps an edit that has not been applied yet', async ({ page }) => {
  const editor = page.locator('.json-editor');
  await editor.fill(
    '{"pages":[{"num":1,"fields":[{"x":50,"y":700,"mapField":"editado","fontSize":12,"type":"text"}]}]}',
  );
  await page.getByTestId('json-format-open').click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByTestId('json-format-apply').click();
  await page.waitForTimeout(800);
  await expect(editor).toHaveValue(/mapField: "editado"/);
});

test('clicking an annotation still selects its block with a custom format', async ({ page }) => {
  await page.getByTestId('json-format-open').click();
  await page.getByTestId('json-format-keys-bare').click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByTestId('json-format-apply').click();
  const editor = page.locator('.json-editor');
  await expect(editor).toHaveValue(/ {4}pages: \[/);
  await page.locator('.annotation').first().click();
  await expect
    .poll(() =>
      editor.evaluate((el: HTMLTextAreaElement) =>
        el.value.slice(el.selectionStart, el.selectionEnd),
      ),
    )
    .toContain('mapField: "O\'Brien"');
});
