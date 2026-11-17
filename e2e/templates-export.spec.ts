import { expect, test } from '@playwright/test';
import { EXAMPLE_JSON, jsonEditor, openSidebarTab, openWorkspace } from './helpers';
import { readFileSync } from 'node:fs';

test('exporta varias plantillas en un ZIP con progreso y confirmación', async ({ page }) => {
  await openWorkspace(page);
  await jsonEditor(page).fill(readFileSync(EXAMPLE_JSON, 'utf8'));
  await jsonEditor(page).blur();
  await openSidebarTab(page, 'Plantillas');
  await expect(page.getByTestId('templates-export-open')).toBeDisabled();

  for (const name of ['Factura A4', 'Albarán']) {
    await page.locator('.templates__save input').fill(name);
    await page.locator('.templates__save button').click();
  }
  await expect(page.getByTestId('templates-export-open')).toBeEnabled();
  await page.getByTestId('templates-export-open').click();

  const dialog = page.getByTestId('templates-export');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('templates-export-go')).toContainText('2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('templates-export-go').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('plantillas.zip');
  await expect(page.getByTestId('templates-export-done')).toContainText('2');
  await dialog.getByRole('button', { name: 'Listo' }).click();
  await expect(dialog).toBeHidden();
});
