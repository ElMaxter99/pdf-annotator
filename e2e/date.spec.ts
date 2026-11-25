import { expect, test } from '@playwright/test';
import {
  applyJsonText,
  chooseView,
  clickPage,
  openSidebarTab,
  openWorkspace,
  readJson,
  renderedAnnotations,
} from './helpers';

const texts = async (page: import('@playwright/test').Page) =>
  (await renderedAnnotations(page)).map((a) => a.text);

test('the date type has a format with presets, a custom one and an example', async ({ page }) => {
  await openWorkspace(page, { view: 'Muestra' });
  await clickPage(page, 0.5, 0.5);
  const editor = page.locator('.annotation-editor');
  await expect(editor).toBeVisible();
  await page.keyboard.type('factura.fecha');
  await expect(editor.locator('.date-format')).toHaveCount(0);

  await editor.locator('.type-seg__opt', { hasText: 'Fecha' }).click();
  const format = editor.getByRole('combobox', { name: 'Formato' });
  await expect(format).toHaveValue('DD/MM/YYYY');
  await expect(editor.locator('.date-format__example')).toHaveText('Se verá así: 05/03/2026');

  await format.selectOption('YYYY-MM-DD');
  await expect(editor.locator('.date-format__example')).toHaveText('Se verá así: 2026-03-05');

  await format.selectOption({ label: 'Personalizado…' });
  const custom = editor.getByRole('textbox', { name: 'Formato personalizado' });
  await custom.fill('D.M.YY');
  await expect(editor.locator('.date-format__example')).toHaveText('Se verá así: 5.3.26');
  await custom.press('Enter');
  await expect(editor).toHaveCount(0);

  // La muestra de fecha (31/12/2026) se pinta con el formato del campo.
  await expect.poll(() => texts(page)).toEqual(['31.12.26']);
  const json = await readJson(page);
  expect(json.pages[0].fields[0]).toEqual(
    expect.objectContaining({ type: 'date', mapField: 'factura.fecha' }),
  );

  // Al volver a abrirla, el formato propio sigue en «Personalizado…».
  await page.locator('.annotation').first().click();
  const edit = page.locator('.annotation-editor.editing');
  await expect(edit.getByRole('combobox', { name: 'Formato' })).toHaveValue('custom');
  await expect(edit.getByRole('textbox', { name: 'Formato personalizado' })).toHaveValue('D.M.YY');
});

test('dates from the JSON and the test data are painted with their format', async ({ page }) => {
  await openWorkspace(page, { view: 'Muestra' });
  await applyJsonText(page, {
    pages: [
      {
        num: 1,
        fields: [
          { x: 100, y: 700, mapField: 'factura.fecha', type: 'date', dateFormat: 'YYYY-MM-DD' },
          { x: 100, y: 650, mapField: 'factura.vence', type: 'date' },
          { x: 100, y: 600, mapField: 'factura.nota', type: 'date', dateFormat: 'DD/MM/YYYY' },
        ],
      },
    ],
  });
  await expect.poll(() => texts(page)).toEqual(['2026-12-31', '31/12/2026', '31/12/2026']);

  await openSidebarTab(page, 'Avanzado');
  await page.locator('#sample-date').fill('2027-01-09');
  await expect.poll(() => texts(page)).toEqual(['2027-01-09', '09/01/2027', '09/01/2027']);

  await page
    .getByRole('textbox', { name: 'Datos de prueba' })
    .fill(
      JSON.stringify({
        factura: { fecha: '2026-03-05T10:00:00Z', vence: '5/4/2026', nota: 'pendiente' },
      }),
    );
  await chooseView(page, 'Datos');
  await expect.poll(() => texts(page)).toEqual(['2026-03-05', '05/04/2026', 'pendiente']);
});

test('an unusable date format is reported on import and the default is used', async ({ page }) => {
  await openWorkspace(page, { view: 'Muestra' });
  await applyJsonText(page, {
    pages: [
      {
        num: 1,
        fields: [{ x: 100, y: 700, mapField: 'f', type: 'date', dateFormat: 'dd/mm/yyyy' }],
      },
    ],
  });
  await expect(page.locator('.toast')).toContainText('1 formato(s) de fecha no válido(s)');
  await expect.poll(() => texts(page)).toEqual(['31/12/2026']);
});
