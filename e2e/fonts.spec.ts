import { expect, test } from '@playwright/test';
import { applyJsonText, openSidebarTab, openWorkspace, renderedAnnotations } from './helpers';

const DEJAVU = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf';

test.beforeEach(async ({ page }) => {
  await openWorkspace(page);
});

test('imported font names are matched to the available families', async ({ page }) => {
  const names = ['Arial', 'times new roman', 'Courier', 'standard:courier', 'Georgia, serif', 'Verdana', { name: 'Times New Roman' }];
  await applyJsonText(page, {
    pages: [{ num: 1, fields: names.map((fontFamily, i) => ({ x: 50, y: 700 - i * 30, mapField: `t${i}`, fontSize: 12, type: 'text', fontFamily })) }],
  });
  const families = (await renderedAnnotations(page)).map((r) => r.fontFamily);
  expect(families[0]).toContain('Helvetica');
  expect(families[1]).toContain('Times New Roman');
  expect(families[2]).toContain('Courier');
  expect(families[3]).toContain('Courier');
  expect(families[4]).toContain('Georgia');
  expect(families[5]).toContain('Verdana');
  expect(families[6]).toContain('Times New Roman');
});

test('custom fonts can be added, used, removed and fall back to Helvetica', async ({ page }) => {
  test.skip(!require('node:fs').existsSync(DEJAVU), 'DejaVu Serif Bold is not installed');
  await openSidebarTab(page, 'Avanzado');
  await page.locator('.advanced-toggle').click();
  await page.locator('.advanced-checkbox input').first().check();
  await page.locator('input[type=file][accept=".ttf,.otf,.woff,.woff2"]').setInputFiles(DEJAVU);
  await expect(page.locator('.custom-fonts-panel__item')).toHaveCount(1);
  await expect(page.locator('.custom-fonts-panel__name')).toHaveText('DejaVuSerif-Bold');

  await openSidebarTab(page, 'Anotaciones');
  await applyJsonText(page, { pages: [{ num: 1, fields: [{ x: 50, y: 700, mapField: 'c', fontSize: 12, type: 'text', fontFamily: 'DejaVuSerif-Bold' }, { x: 50, y: 660, mapField: 'd', fontSize: 12, type: 'text', fontFamily: 'custom:unknown' }] }] });
  let families = (await renderedAnnotations(page)).map((r) => r.fontFamily);
  expect(families[0]).toContain('DejaVuSerif-Bold');
  expect(families[1]).toContain('Helvetica');

  await openSidebarTab(page, 'Avanzado');
  await page.locator('.custom-fonts-panel__item button').first().click();
  await expect(page.locator('.custom-fonts-panel__item')).toHaveCount(0);
  families = (await renderedAnnotations(page)).map((r) => r.fontFamily);
  expect(families.every((f) => f.includes('Helvetica'))).toBe(true);

  await page.locator('.advanced-checkbox input').first().uncheck();
  await expect(page.locator('.custom-fonts-panel')).toHaveCount(0);
});
