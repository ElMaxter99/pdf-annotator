import { expect, test, type Download } from '@playwright/test';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const bufferChunk =
      typeof chunk === 'string' ? Buffer.from(chunk, 'utf-8') : Buffer.from(chunk);
    chunks.push(bufferChunk);
  }
  return Buffer.concat(chunks);
}

async function downloadToBuffer(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  if (stream) {
    return streamToBuffer(stream);
  }
  const filePath = await download.path();
  if (!filePath) {
    throw new Error('Unable to read download contents');
  }
  return fs.readFile(filePath);
}

test.describe('PDF annotation end-to-end', () => {
  test('creates, duplicates and exports annotations', async ({ page }) => {
    await page.goto('/');

    const fileInput = page.locator('input.input-file[type="file"]');
    await expect(fileInput).toBeVisible();

    const samplePdfPath = join(
      process.cwd(),
      'public',
      'assets',
      'test-documents',
      'sample.pdf'
    );

    await fileInput.setInputFiles(samplePdfPath);

    const viewer = page.locator('main.viewer');
    await expect(viewer).toBeVisible();
    await expect(page.locator('.hitbox')).toBeVisible();

    const hitbox = page.locator('.hitbox');
    await hitbox.click({ position: { x: 200, y: 250 } });

    const previewEditor = page.locator('.annotation-editor:not(.editing)');
    await expect(previewEditor).toBeVisible();

    const previewFields = previewEditor.locator('label.field');
    await previewFields.nth(0).locator('input').fill('Test map field');
    await previewFields.nth(1).locator('select').selectOption('text');
    await previewFields.nth(2).locator('input').fill('Test annotation');
    await previewEditor.locator('button', { hasText: '✅' }).click();

    const annotations = page.locator('.annotations-layer .annotation');
    await expect(annotations).toHaveCount(1);
    await expect(annotations.first()).toContainText('Test annotation');

    await annotations.first().click();

    const editingPanel = page.locator('.annotation-editor.editing');
    await expect(editingPanel).toBeVisible();

    await editingPanel.locator('button', { hasText: '⧉' }).click();

    const duplicateEditor = page.locator('.annotation-editor.editing');
    await expect(duplicateEditor).toBeVisible();
    await duplicateEditor.locator('button', { hasText: '✅' }).click();
    await expect(duplicateEditor).toHaveCount(0);

    await expect(annotations).toHaveCount(2);
    await expect(annotations).toContainText(['Test annotation', 'Test annotation']);

    const downloadJsonPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar JSON/i }).click();
    const jsonDownload = await downloadJsonPromise;
    const jsonBuffer = await downloadToBuffer(jsonDownload);
    const jsonData = JSON.parse(jsonBuffer.toString('utf-8'));
    const pages = Array.isArray(jsonData.pages) ? jsonData.pages : [];
    expect(pages.length).toBeGreaterThan(0);
    const firstPage = pages[0] ?? { fields: [] };
    const fields = Array.isArray(firstPage.fields) ? firstPage.fields : [];
    expect(fields.length).toBeGreaterThanOrEqual(2);

    const downloadPdfPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Descargar PDF/i }).click();
    const pdfDownload = await downloadPdfPromise;
    const pdfBuffer = await downloadToBuffer(pdfDownload);
    expect(pdfBuffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
