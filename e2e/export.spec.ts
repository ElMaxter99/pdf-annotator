import { expect, test } from '@playwright/test';
import { EXAMPLE_JSON, openWorkspace } from './helpers';
import { readFileSync } from 'node:fs';

test('downloads an annotated PDF and the JSON', async ({ page }) => {
  await openWorkspace(page);
  const download = page.getByRole('button', { name: /Descargar PDF/ });
  await expect(download).toBeDisabled();

  await page.locator('input[type=file][accept="application/json"]').setInputFiles(EXAMPLE_JSON);
  await expect(download).toBeEnabled();

  const [pdf] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(pdf.suggestedFilename()).toBe('annotated.pdf');
  const bytes = readFileSync((await pdf.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(readFileSync(EXAMPLE_JSON.replace('anotaciones-ejemplo.json', 'factura-ejemplo.pdf')).length);

  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar JSON/ }).click()]);
  expect(json.suggestedFilename()).toBe('coords.json');
});
