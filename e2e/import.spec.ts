import { expect, test } from '@playwright/test';
import { applyJsonText, jsonEditor, openWorkspace, renderedAnnotations } from './helpers';

test.beforeEach(async ({ page }) => {
  await openWorkspace(page);
});

test('normalizes messy JSON: coerces values, skips invalid fields and pages', async ({ page }) => {
  await applyJsonText(page, {
    pages: [
      { num: '2', fields: [{ x: '10.456', y: '20', mapField: '  Hola \n  mundo ', fontSize: '18.555', color: '#F00', type: 'TEXT' }] },
      {
        num: 1,
        fields: [
          { x: 50, y: 700, mapField: ['a.b [0]', 'z'], fontSize: -3, type: 'number', decimals: '2', appender: ' €', opacity: '0.5', backgroundColor: '#ffee00' },
          { x: 60, y: 650, type: 'check', value: ' X ' },
          { x: 70, y: 600, type: 'radio' },
          { x: 'bad', y: 10, mapField: 'skip' },
          { x: 80, y: 550 },
          { x: 90, y: 500, mapField: 42, type: 'weird', color: '  ', fontFamily: 'times new roman' },
          null,
          'str',
          { x: 100, y: 450, mapField: true, typography: { fontFamily: 'Verdana' } },
        ],
      },
      { num: 0, fields: [{ x: 1, y: 1, mapField: 'no' }] },
      { num: 3.5, fields: [{ x: 1, y: 1, mapField: 'no' }] },
      { num: 4, fields: [] },
      { num: 5 },
    ],
  });

  // Page 1 is visible: 5 valid fields, rendered with their resolved text.
  const rendered = await renderedAnnotations(page);
  expect(rendered.map((r) => r.text)).toEqual(['a.b[0]', 'X', 'X', '42', 'true']);
  expect(rendered[3].fontFamily).toContain('Times New Roman');
  expect(rendered[4].fontFamily).toContain('Verdana');
});

test('accepts a bare array, loose JSON syntax and ignores unusable documents', async ({ page }) => {
  await applyJsonText(page, [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'directo' }] }]);
  expect((await renderedAnnotations(page)).map((r) => r.text)).toEqual(['directo']);

  await applyJsonText(page, "{ pages: [ { num: 1, fields: [ { x: 10, y: 10, mapField: 'suelto', }, ], }, ], }");
  expect((await renderedAnnotations(page)).map((r) => r.text)).toEqual(['suelto']);

  await applyJsonText(page, { foo: 1 });
  expect((await renderedAnnotations(page)).map((r) => r.text)).toEqual(['suelto']);
});

test('pasted code is never executed', async ({ page }) => {
  await page.evaluate(() => ((window as unknown as { __pwned?: boolean }).__pwned = false));
  await applyJsonText(page, '{ pages: [ { num: 1, fields: [ { x: (window.__pwned = true), y: 1, mapField: "x" } ] } ] }');
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBe(false);
});

test('an invalid JSON file leaves the annotations untouched', async ({ page }) => {
  await applyJsonText(page, [{ num: 1, fields: [{ x: 1, y: 2, mapField: 'a' }] }]);
  await page.locator('input[type=file][accept="application/json"]').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not json'),
  });
  await expect(page.locator('.toast--error')).toContainText('JSON');
  expect((await renderedAnnotations(page)).map((r) => r.text)).toEqual(['a']);
  await expect(jsonEditor(page)).toBeVisible();
});

test('importing a file refreshes the JSON editor', async ({ page }) => {
  await page.locator('input[type=file][accept="application/json"]').setInputFiles({
    name: 'a.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ pages: [{ num: 1, fields: [{ x: 5, y: 6, mapField: 'desdeArchivo' }] }] })),
  });
  await expect(jsonEditor(page)).toHaveValue(/desdeArchivo/);
});

test('shows whether the JSON is valid, with the error position', async ({ page }) => {
  const status = page.locator('.json-status');
  await jsonEditor(page).fill('{ "pages": [ { "num": 1, "fields": [ { "x": 1, "y": 2, "mapField": "a" }, { "x": 3, "y": 4, "mapField": "b" } ] } ] }');
  await expect(status).toContainText('JSON válido');
  await expect(status).toContainText('2');

  await jsonEditor(page).fill('{ "pages": [\n  { "num": 1 "fields": [] }\n] }');
  await expect(status).toContainText('línea 2');

  await jsonEditor(page).fill('{ "foo": 1 }');
  await expect(status).toContainText('«pages»');
});

test('applying invalid JSON explains where the problem is', async ({ page }) => {
  await jsonEditor(page).fill('{ "pages": [\n  { "num": 1 "fields": [] }\n] }');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.toast--error')).toContainText('línea 2');

  await page.locator('.toast__close').click();
  await jsonEditor(page).fill('{ "foo": 1 }');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.toast--error')).toContainText('pages');
});
