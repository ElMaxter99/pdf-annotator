import { expect, test } from '@playwright/test';
import { applyJsonText, chooseView, openSidebarTab, openWorkspace } from './helpers';

const PREFIX = 'contrato.intervinientes[0].condicion.';
const FIELDS = {
  pages: [
    {
      num: 1,
      fields: [
        { x: 100, y: 700, mapField: `${PREFIX}esTitular`, type: 'check' },
        { x: 130, y: 700, mapField: `${PREFIX}esCotitular`, type: 'check' },
        { x: 160, y: 700, mapField: `${PREFIX}esAutorizado`, type: 'check' },
        { x: 100, y: 600, mapField: 'holder[0].fullname', type: 'text' },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await openWorkspace(page, { view: 'Muestra' });
  await applyJsonText(page, FIELDS);
});

test('apagado por defecto: sin rótulos ni paradas de Tab', async ({ page }) => {
  await expect(page.locator('.map-label')).toHaveCount(0);
  await expect(page.locator('.annotation[tabindex]')).toHaveCount(0);
});

test('el interruptor del visor pinta el final del nombre solo en casillas y no cambia el JSON', async ({ page }) => {
  const before = await page.locator('textarea.json-editor').inputValue();
  await page.getByTestId('maplabel-toggle').check();
  const labels = page.locator('.map-label');
  await expect(labels.filter({ hasText: '[0]…esTitular' })).toHaveCount(1);
  await expect(labels.filter({ hasText: '[0]…esCotitular' })).toHaveCount(1);
  await expect(page.locator('.map-label', { hasText: 'holder' })).toHaveCount(0);
  expect(await page.locator('textarea.json-editor').inputValue()).toBe(before);
});

test('«Todas» añade el texto, salvo en la vista Mapeo, que ya pinta su nombre', async ({ page }) => {
  await page.getByTestId('maplabel-toggle').check();
  await openSidebarTab(page, 'Avanzado');
  await page.getByTestId('maplabel-scope-all').click();
  await expect(page.locator('.map-label', { hasText: 'holder[0].fullname' })).toHaveCount(1);
  await chooseView(page, 'Mapeo');
  await expect(page.locator('.map-label', { hasText: 'holder[0].fullname' })).toHaveCount(0);
  await expect(page.locator('.map-label', { hasText: '[0]…esTitular' })).toHaveCount(1);
});

test('el cuadro sale al pasar el cursor con el nombre completo y Esc lo cierra', async ({ page }) => {
  await page.getByTestId('maplabel-toggle').check();
  const first = page.locator('.annotation').filter({ hasText: 'X' }).first();
  await first.hover();
  const tip = page.getByTestId('maplabel-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(`${PREFIX}esTitular`);
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
});

test('Tab recorre las anotaciones, enseña el cuadro y lo anuncia', async ({ page }) => {
  await page.getByTestId('maplabel-toggle').check();
  const first = page.locator('.annotation[tabindex="0"]').first();
  await expect(first).toHaveAttribute('aria-label', new RegExp(`${PREFIX.replace(/[.[\]]/g, '\\$&')}`));
  await first.focus();
  await expect(page.getByTestId('maplabel-tip')).toBeVisible();
});

test('el máximo se valida y la preferencia sobrevive a la recarga', async ({ page }) => {
  await page.getByTestId('maplabel-toggle').check();
  await openSidebarTab(page, 'Avanzado');
  await page.getByTestId('maplabel-max').fill('3');
  await expect(page.getByRole('alert').filter({ hasText: 'Entre 8 y 40' })).toBeVisible();
  await page.getByTestId('maplabel-max').fill('12');
  await expect(page.locator('.map-label', { hasText: '…esCotitular' }).first()).toBeVisible();
  const saved = await page.evaluate(() => localStorage.getItem('pdf-annotator.mapLabel'));
  expect(JSON.parse(saved ?? '{}')).toMatchObject({ show: true, max: 12 });
});
