import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { openSidebarTab, stubAnalytics } from './helpers';

async function manyPages(count: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i += 1) {
    doc.addPage([595, 842]).drawText(`Página ${i + 1}`, { x: 60, y: 780 });
  }
  return Buffer.from(await doc.save());
}

test('thumbnails are drawn on demand: only the visible ones, the rest as they scroll into view', async ({
  page,
}) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles({
    name: 'muchas-paginas.pdf',
    mimeType: 'application/pdf',
    buffer: await manyPages(60),
  });
  await page.waitForURL('**/workspace');
  await openSidebarTab(page, 'Documento');

  const items = page.locator('.thumbnails__item');
  const drawn = page.locator('img.thumbnails__image[src]');
  await expect(items).toHaveCount(60);
  await expect(drawn.first()).toBeVisible();
  const initiallyDrawn = await drawn.count();
  expect(initiallyDrawn).toBeGreaterThan(0);
  expect(initiallyDrawn).toBeLessThan(40);

  await items.last().scrollIntoViewIfNeeded();
  await expect(items.last().locator('img.thumbnails__image[src]')).toBeVisible();
  await expect(items.first()).toHaveAttribute('aria-label', /1/);
});

test('thumbnails not drawn yet show an animated skeleton, still with reduced motion', async ({
  browser,
}) => {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    const context = await browser.newContext({ reducedMotion });
    const page = await context.newPage();
    await stubAnalytics(page);
    await page.goto('/landing');
    await page.locator('input[type=file]').setInputFiles({
      name: 'muchas-paginas.pdf',
      mimeType: 'application/pdf',
      buffer: await manyPages(60),
    });
    await page.waitForURL('**/workspace');
    await openSidebarTab(page, 'Documento');
    const pending = page.locator('.thumbnails__image--pending').last();
    await expect(pending).toHaveCount(1);
    const animation = await pending.evaluate((el) => getComputedStyle(el).animationName);
    if (reducedMotion === 'reduce') {
      expect(animation).toBe('none');
    } else {
      expect(animation).toContain('thumbnails-shimmer');
    }
    await expect(pending).toHaveAttribute('aria-hidden', 'true');
    await context.close();
  }
});
