import { expect, test, type Page } from '@playwright/test';
import { addAnnotation, openSidebarTab, openWorkspace, readJson } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

async function xs(page: Page) {
  const json = await readJson(page);
  return (json.pages[0].fields as { mapField: string; x: number; y: number }[]).map((f) => f);
}

/** Drags the second annotation so its left edge ends `offset` px away from the first one's. */
async function dragSecondNear(page: Page, offset: number, alt = false) {
  const first = await page.locator('.annotation').nth(0).boundingBox();
  const second = await page.locator('.annotation').nth(1).boundingBox();
  if (!first || !second) throw new Error('annotations not found');
  const sx = second.x + 4;
  const sy = second.y + second.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(sx + (first.x + offset - second.x) / 2, sy + 10, { steps: 4 });
  await page.mouse.move(sx + (first.x + offset - second.x), sy + 20, { steps: 4 });
  return {
    async release() {
      await page.mouse.up();
      if (alt) await page.keyboard.up('Alt');
    },
  };
}

async function setup(page: Page) {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await addAnnotation(page, 0.6, 0.6, 'dos');
}

test('arrastrar cerca de otra anotación la deja en su misma X y lo dice en el pie', async ({ page }) => {
  await setup(page);
  const drag = await dragSecondNear(page, 3);
  await expect(page.getByTestId('snap-note')).toContainText('Alineada en X con «uno»');
  await drag.release();
  await expect(page.getByTestId('snap-note')).toHaveCount(0);
  const [a, b] = await xs(page);
  expect(b.x).toBe(a.x);
  expect(b.y).not.toBe(a.y);
});

test('con Alt pulsado no hay imán', async ({ page }) => {
  await setup(page);
  const drag = await dragSecondNear(page, 3, true);
  await expect(page.getByTestId('snap-note')).toHaveCount(0);
  await drag.release();
  const [a, b] = await xs(page);
  expect(b.x).not.toBe(a.x);
});

test('se apaga desde Avanzado, el mismo ajuste que en Opciones', async ({ page }) => {
  await setup(page);
  await openSidebarTab(page, 'Ajustes');
  await page.locator('.advanced-toggle').click();
  const box = page.getByTestId('advanced-snap-annotations');
  await expect(box).toBeChecked();
  await box.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.editorSettings'))).toContain(
    '"snapToAnnotations":false',
  );
  await page.getByTestId('more-options').click();
  await page.getByTestId('options-open').click();
  await expect(page.getByTestId('options-snap')).not.toBeChecked();
  await page.keyboard.press('Escape');
  await openSidebarTab(page, 'Anotaciones');
  const drag = await dragSecondNear(page, 3);
  await drag.release();
  const [a, b] = await xs(page);
  expect(b.x).not.toBe(a.x);
});
