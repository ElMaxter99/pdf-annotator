import { expect, Page, test } from '@playwright/test';
import { applyJsonText, fieldCount, openWorkspace, readJson } from './helpers';

const FIELDS = [
  { x: 50, y: 700, mapField: 'a', fontSize: 12, type: 'text' },
  { x: 150, y: 600, mapField: 'b', fontSize: 12, type: 'text' },
  { x: 100, y: 500, mapField: 'cc', fontSize: 12, type: 'text' },
  { x: 200, y: 400, mapField: 'd', fontSize: 12, type: 'text' },
];

const ann = (page: Page, i: number) => page.locator('.annotation').nth(i);
const bar = (page: Page) => page.locator('.selection-bar');
/** The JSON editor keeps focus after applying text; leave it so page shortcuts apply. */
const leaveTextFields = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
const positions = async (page: Page) =>
  (await readJson(page)).pages[0].fields.map((f: { x: number; y: number }) => [f.x, f.y]);

test.beforeEach(async ({ page }) => {
  await openWorkspace(page, { zoomOut: 2 });
  await applyJsonText(page, { pages: [{ num: 1, fields: FIELDS }] });
  await expect(page.locator('.annotation')).toHaveCount(4);
});

test('Shift+click adds and removes annotations from the selection', async ({ page }) => {
  await expect(bar(page)).toHaveCount(0);
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await expect(bar(page)).toContainText('1 seleccionada');
  await ann(page, 2).click({ modifiers: ['Shift'] });
  await expect(bar(page)).toContainText('2 seleccionada');
  await expect(page.locator('.annotation--selected')).toHaveCount(2);

  await ann(page, 0).click({ modifiers: ['Shift'] });
  await expect(page.locator('.annotation--selected')).toHaveCount(1);
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
});

test('Ctrl+A selects everything on the page except locked annotations', async ({ page }) => {
  await applyJsonText(page, { pages: [{ num: 1, fields: [...FIELDS.slice(0, 3), { ...FIELDS[3], locked: true }] }] });
  await leaveTextFields(page);
  await page.keyboard.press('Control+a');
  await expect(bar(page)).toContainText('3 seleccionada');
  await page.keyboard.press('Escape');
  await expect(bar(page)).toHaveCount(0);
  await expect(page.locator('.annotation--selected')).toHaveCount(0);
});

test('clicking a blank area of the page clears the selection', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await expect(bar(page)).toBeVisible();
  const box = (await page.locator('.hitbox').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.3);
  await expect(bar(page)).toHaveCount(0);
});

test('a plain click on a selected annotation opens its editor and drops the selection', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await ann(page, 1).click({ modifiers: ['Shift'] });
  await ann(page, 0).click();
  await expect(page.locator('.annotation-editor.editing')).toBeVisible();
  await expect(bar(page)).toHaveCount(0);
});

test('align actions need two annotations and are a single undo step', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('button', { name: 'Alinear a la izquierda' })).toBeDisabled();

  await ann(page, 1).click({ modifiers: ['Shift'] });
  await ann(page, 3).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Alinear a la izquierda' }).click();
  await expect.poll(async () => (await positions(page)).map((p: number[]) => p[0])).toEqual([50, 50, 100, 50]);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await positions(page)).map((p: number[]) => p[0])).toEqual([50, 150, 100, 200]);
});

test('align top and bottom change only y', async ({ page }) => {
  await leaveTextFields(page);
  await page.keyboard.press('Control+a');
  await expect(bar(page)).toContainText('4 seleccionada');
  await page.getByRole('button', { name: 'Alinear abajo' }).click();
  await expect.poll(async () => (await positions(page)).map((p: number[]) => p[1])).toEqual([400, 400, 400, 400]);
  expect((await positions(page)).map((p: number[]) => p[0])).toEqual([50, 150, 100, 200]);
});

test('dragging one member moves the whole group and undo restores it in one step', async ({ page }) => {
  await ann(page, 1).click({ modifiers: ['Shift'] });
  await ann(page, 2).click({ modifiers: ['Shift'] });
  const before = await positions(page);

  const box = (await ann(page, 1).boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 64, box.y + 44, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await positions(page))[1][0]).toBeGreaterThan(before[1][0]);
  const after = await positions(page);
  const dx = after[1][0] - before[1][0];
  const dy = after[1][1] - before[1][1];
  expect(dy).toBeLessThan(0);
  expect(after[2][0] - before[2][0]).toBeCloseTo(dx, 1);
  expect(after[2][1] - before[2][1]).toBeCloseTo(dy, 1);
  expect(after[0]).toEqual(before[0]);
  expect(after[3]).toEqual(before[3]);
  await expect(page.locator('.annotation--selected')).toHaveCount(2);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => await positions(page)).toEqual(before);
});

test('arrow keys nudge the selection and count as one undo step', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await ann(page, 1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await positions(page))[0]).toEqual([53, 710]);
  expect((await positions(page))[1]).toEqual([153, 610]);
  expect((await positions(page))[2]).toEqual([100, 500]);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => await positions(page)).toEqual(FIELDS.map((f) => [f.x, f.y]));
});

test('page navigation keys still work when nothing is selected', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.toolbar__badge').first()).toContainText('1 / 1');
  expect(await positions(page)).toEqual(FIELDS.map((f) => [f.x, f.y]));
});

test('Delete removes the selection and undo brings it back', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await ann(page, 3).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect(page.locator('.annotation')).toHaveCount(2);
  await expect(bar(page)).toHaveCount(0);
  await expect.poll(() => fieldCount(page)).toBe(2);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(4);
});

test('copy, paste and duplicate create offset copies of the whole selection', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await ann(page, 1).click({ modifiers: ['Shift'] });
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.annotation')).toHaveCount(6);
  await expect(bar(page)).toContainText('2 seleccionada');
  await expect.poll(() => fieldCount(page)).toBe(6);
  const pasted = (await positions(page)).slice(4);
  expect(pasted[0][0]).toBeGreaterThan(50);
  expect(pasted[0][1]).toBeLessThan(700);

  await page.keyboard.press('Control+d');
  await expect(page.locator('.annotation')).toHaveCount(8);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(6);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(4);
});

test('the toolbar buttons duplicate, delete and clear the selection', async ({ page }) => {
  await ann(page, 0).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Duplicar selección' }).click();
  await expect(page.locator('.annotation')).toHaveCount(5);
  await page.getByRole('button', { name: 'Eliminar selección' }).click();
  await expect(page.locator('.annotation')).toHaveCount(4);

  await ann(page, 0).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Quitar selección' }).click();
  await expect(bar(page)).toHaveCount(0);
});

test('typing in the JSON editor does not trigger selection shortcuts', async ({ page }) => {
  await page.locator('textarea.json-editor').click();
  await page.keyboard.press('Control+a');
  await expect(bar(page)).toHaveCount(0);
});
