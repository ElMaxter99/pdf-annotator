import { expect, test } from '@playwright/test';
import { applyJsonText, jsonContent, openWorkspace } from './helpers';

// Ctrl+F en el editor del JSON: cuadro de búsqueda como el de VS Code.
test.beforeEach(async ({ page }) => {
  await openWorkspace(page);
  await applyJsonText(
    page,
    JSON.stringify(
      {
        pages: [
          {
            num: 1,
            fields: [
              { x: 50, y: 700, mapField: 'cliente.nombre', type: 'text' },
              { x: 150, y: 700, mapField: 'cliente.nif', type: 'text' },
              { x: 250, y: 700, mapField: 'factura.total', type: 'number' },
            ],
          },
        ],
      },
      null,
      2,
    ),
  );
});

test('Ctrl+F busca en el JSON: cuenta, recorre con Intro y Mayús+Intro, y Esc cierra', async ({
  page,
}) => {
  await jsonContent(page).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+f');
  const input = page.getByTestId('json-find-input');
  await expect(input).toBeFocused();
  await input.pressSequentially('cliente');
  await expect(input).toHaveValue('cliente');
  const count = page.getByTestId('json-find-count');
  await expect(count).toHaveText('1 de 2');
  await expect(page.locator('app-json-code-editor .cm-searchMatch')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await expect(count).toHaveText('2 de 2');
  await page.keyboard.press('Shift+Enter');
  await expect(count).toHaveText('1 de 2');
  await page.getByTestId('json-find-next').click();
  await expect(count).toHaveText('2 de 2');

  await input.fill('no-existe');
  await expect(count).toHaveText('Sin resultados');

  await page.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.locator('app-json-code-editor .cm-searchMatch')).toHaveCount(0);
});

test('Aa, palabra completa y expresión regular, como en VS Code', async ({ page }) => {
  await jsonContent(page).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.press('Control+f');
  const input = page.getByTestId('json-find-input');
  const count = page.getByTestId('json-find-count');
  await input.fill('CLIENTE');
  await expect(count).toHaveText('1 de 2');
  await page.getByTestId('json-find-case').click();
  await expect(page.getByTestId('json-find-case')).toHaveAttribute('aria-pressed', 'true');
  await expect(count).toHaveText('Sin resultados');
  await page.getByTestId('json-find-case').click();

  await input.fill('total');
  await page.getByTestId('json-find-word').click();
  await expect(count).toHaveText('1 de 1');

  await page.getByTestId('json-find-word').click();
  await page.getByTestId('json-find-regexp').click();
  await input.fill('"x": \\d+0');
  await expect(count).toHaveText('1 de 3');
});
