import { expect, Page, test } from '@playwright/test';
import { addAnnotation, applyJsonText, EXAMPLE_JSON, fieldCount, jsonEditor, openWorkspace, readJson } from './helpers';

const undoBtn = (page: Page) => page.getByRole('button', { name: /Deshacer/ });
const redoBtn = (page: Page) => page.getByRole('button', { name: /Rehacer/ });
const clearBtn = (page: Page) => page.getByRole('button', { name: /Limpiar/ });

test.beforeEach(async ({ page }) => openWorkspace(page));

test('undo and redo walk through the history and keep JSON and buttons in sync', async ({ page }) => {
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn(page)).toBeDisabled();
  await expect(clearBtn(page)).toBeDisabled();

  await addAnnotation(page, 0.3, 0.3, 'uno');
  await addAnnotation(page, 0.5, 0.5, 'dos');
  await expect.poll(() => fieldCount(page)).toBe(2);
  await expect(redoBtn(page)).toBeDisabled();

  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(1);
  await expect.poll(() => fieldCount(page)).toBe(1);
  await expect(redoBtn(page)).toBeEnabled();

  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(redoBtn(page)).toBeEnabled();
  await page.keyboard.press('Control+z'); // no-op
  await expect(page.locator('.annotation')).toHaveCount(0);

  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.locator('.annotation')).toHaveCount(2);
});

test('a new change discards the redo history', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await page.keyboard.press('Control+z');
  await expect(redoBtn(page)).toBeEnabled();
  await addAnnotation(page, 0.5, 0.5, 'dos');
  await page.keyboard.press('Control+y');
  await expect(page.locator('.annotation')).toHaveCount(1);
});

test('edits can be undone and redone', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await page.locator('.annotation').first().click();
  await page.locator('.annotation-editor input[type=text]').nth(1).fill('editado');
  await page.locator('.annotation-editor .action-primary').click();
  await expect(page.locator('.annotation').first()).toHaveText('editado');

  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation').first()).toHaveText('uno');
  await page.keyboard.press('Control+y');
  await expect(page.locator('.annotation').first()).toHaveText('editado');
});

test('dragging moves an annotation and can be undone', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  const before = (await readJson(page)).pages[0].fields[0];
  const box = (await page.locator('.annotation').first().boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await readJson(page)).pages[0].fields[0].x).toBeGreaterThan(before.x);
  const moved = (await readJson(page)).pages[0].fields[0];
  expect(moved.y).toBeLessThan(before.y);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const restored = (await readJson(page)).pages[0].fields[0];
      return [Math.round(restored.x), Math.round(restored.y)];
    })
    .toEqual([Math.round(before.x), Math.round(before.y)]);
});

test('clear, JSON apply and file import are undoable steps', async ({ page }) => {
  await page.locator('input[type=file][accept="application/json"]').setInputFiles(EXAMPLE_JSON);
  await expect(page.locator('.annotation')).toHaveCount(10);

  await clearBtn(page).click();
  await expect(page.locator('.annotation')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(10);

  await applyJsonText(page, { pages: [{ num: 1, fields: [{ x: 10, y: 10, mapField: 'j', fontSize: 12, type: 'text' }] }] });
  await expect(page.locator('.annotation')).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(10);
});

test('loading another PDF resets annotations and history', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await page.locator('section.sidebar-upload input[type=file]').setInputFiles(EXAMPLE_JSON.replace('anotaciones-ejemplo.json', 'factura-ejemplo.pdf'));
  await expect(page.locator('.annotation')).toHaveCount(0);
  await expect(undoBtn(page)).toBeDisabled();
  await expect(jsonEditor(page)).toHaveValue(/"pages": \[\]/);
});
