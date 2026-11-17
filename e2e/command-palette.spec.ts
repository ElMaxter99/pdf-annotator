import { expect, test } from '@playwright/test';
import { addAnnotation, fieldCount, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

const input = (page: import('@playwright/test').Page) => page.getByTestId('palette-input');

test('Ctrl+K opens the palette, Esc closes it', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await expect(page.getByTestId('command-palette')).toBeVisible();
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveAttribute('role', 'combobox');
  await expect(page.locator('[role=option][aria-selected=true]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
});

test('the ⋯ menu has a button that opens it', async ({ page }) => {
  await page.getByTestId('more-options').click();
  await page.getByTestId('palette-open').click();
  await expect(page.getByTestId('command-palette')).toBeVisible();
});

test('searching and pressing Enter runs the action, with arrows to move', async ({ page }) => {
  await addAnnotation(page, 0.3, 0.3, 'uno');
  await addAnnotation(page, 0.3, 0.5, 'dos');
  expect(await fieldCount(page)).toBe(2);
  await page.keyboard.press('Control+k');
  await input(page).fill('deshacer');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-palette')).toHaveCount(0);
  await expect.poll(() => fieldCount(page)).toBe(1);

  await page.keyboard.press('Control+k');
  await input(page).fill('zoom');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('footer-zoom')).not.toHaveText('50 %');
});

test('without results it offers the shortcuts dialog', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await input(page).fill('xyzxyz');
  await expect(page.getByTestId('palette-empty')).toContainText('xyzxyz');
  await page.getByRole('button', { name: 'Ver atajos de teclado' }).click();
  await expect(page.getByRole('dialog', { name: /Atajos de teclado/ })).toBeVisible();
});

test('unavailable actions stay visible, dimmed, with the reason, and do nothing', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await input(page).fill('descargar');
  const row = page.getByTestId('palette-row-download');
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row).toContainText('Sin anotaciones todavía');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('command-palette')).toBeVisible();
});

test('changes the theme from the palette', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await input(page).fill('tema claro');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveClass(/theme-light/);
});
