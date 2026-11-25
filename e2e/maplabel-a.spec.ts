import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { EXAMPLE_PDF, chooseView, stubAnalytics } from './helpers';

// La vista A pinta lo mismo que B: valores de muestra, rótulo mini y cuadro del mapField (P-210 a P-212).
const pdf = readFileSync(EXAMPLE_PDF);
const PREFIX = 'contrato.intervinientes[0].condicion.';
const template = Buffer.from(
  JSON.stringify({
    pages: [
      {
        num: 1,
        fields: [
          { x: 100, y: 700, mapField: `${PREFIX}esTitular`, type: 'check', fontSize: 12 },
          { x: 130, y: 700, mapField: `${PREFIX}esCotitular`, type: 'check', fontSize: 12 },
          { x: 100, y: 640, mapField: 'cliente.nombre', type: 'text', fontSize: 12 },
          { x: 300, y: 640, mapField: 'factura.importe', type: 'number', fontSize: 12 },
        ],
      },
    ],
  }),
);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

async function openSplit(page: Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf', pdf, 'application/pdf'), file('factura-0332.pdf', pdf, 'application/pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('input-templates').setInputFiles(file('factura-0331.json', template, 'application/json'));
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page.getByTestId('input-b').setInputFiles(file('factura-0331-nuevo.pdf', pdf, 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page.getByTestId('panel-item').filter({ hasText: 'factura-0331' }).getByRole('button', { name: 'Revisar' }).click();
  await page.waitForURL('**/workspace?lote=*');
  const menu = page.getByTestId('lote-menu');
  if (!(await menu.isVisible())) await page.getByTestId('lote-open').click();
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a').locator('.reference-field')).toHaveCount(4);
}

test('A pinta valores de muestra como B, no el nombre entero', async ({ page }) => {
  await openSplit(page);
  await chooseView(page, 'Muestra');
  const a = page.getByTestId('split-a').locator('.reference-field');
  await expect(a.filter({ hasText: /^X$/ })).toHaveCount(2);
  await expect(a.filter({ hasText: 'XXXXX' })).toHaveCount(1);
  await expect(a.filter({ hasText: '00000' })).toHaveCount(1);
  await expect(page.getByTestId('split-a').getByText('cliente.nombre', { exact: true })).toHaveCount(0);
  await chooseView(page, 'Mapeo');
  await expect(a.filter({ hasText: 'cliente.nombre' })).toHaveCount(1);
});

test('con «Mostrar mapField» A lleva su rótulo, su cuadro con «Versión A» y entra en Tab', async ({ page }) => {
  await openSplit(page);
  await chooseView(page, 'Muestra');
  await expect(page.getByTestId('split-a').locator('.map-label')).toHaveCount(0);
  await page.getByTestId('maplabel-toggle').check();
  const labels = page.getByTestId('split-a').locator('.map-label--ref');
  await expect(labels.filter({ hasText: '[0]…esTitular' })).toHaveCount(0);
  await expect(labels.filter({ hasText: '…esTitular' })).toHaveCount(1);
  await expect(page.getByTestId('split-a').locator('.reference-field[tabindex]')).toHaveCount(4);

  const first = page.getByTestId('split-a').locator('.reference-field').filter({ hasText: /^X$/ }).first();
  await first.focus();
  const tip = page.getByTestId('maplabel-tip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(`${PREFIX}esTitular`);
  await expect(tip).toContainText('Versión A');
  await expect(first).toHaveAttribute('aria-label', /Versión A/);
  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);

  // con el cursor también se abre el cuadro, y la capa ya no está oculta a los lectores de pantalla
  await expect(page.getByTestId('split-a').locator('.reference-layer')).not.toHaveAttribute('aria-hidden', 'true');
  await page.mouse.move(0, 0);
  await first.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('Versión A');
  await page.keyboard.press('Escape');

  // Enter no selecciona nada en A (solo lectura)
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.selection-bar')).toHaveCount(0);
});
