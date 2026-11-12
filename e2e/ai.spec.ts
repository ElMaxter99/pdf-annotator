import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

// Needs the local helper with the simulated provider (playwright.config.ts starts it with AI_HELPER_FAKE=1).
const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const FIELDS = JSON.parse(json.toString()).pages[0].fields.length as number;
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

async function shiftedPdf(dx: number, dy: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(source, [0]);
  const sheet = out.addPage([embedded.width, embedded.height]);
  sheet.drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await out.save());
}

/** Batch with one template and a shifted B, opened in the editor. */
async function openBatchWithB(page: Page, provider: string | null = 'fake') {
  await stubAnalytics(page);
  if (provider) {
    await page.addInitScript((p) => localStorage.setItem('pdf-annotator.ai.provider', p), provider);
  }
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([file('factura-0331.pdf', pdf, 'application/pdf'), file('factura-0332.pdf', pdf, 'application/pdf')]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('input-templates').setInputFiles(file('factura-0331.json', json, 'application/json'));
  await expect(page.getByTestId('template-rows')).toContainText(`${FIELDS} campos`);
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', await shiftedPdf(20, -30), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
}

test('«Copiar y adaptar con IA» asks once, proposes, is reviewed and applied in one undo step', async ({ page }) => {
  await openBatchWithB(page);
  await expect(page.getByTestId('ai-chip')).toContainText('Simulado');

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  // first time: privacy notice, nothing is sent before accepting
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await page.getByTestId('ai-consent-ok').click();

  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
  await expect(page.locator('.annotation')).toHaveCount(0); // B untouched until apply
  await page.getByTestId('ai-toggle-list').click();
  await expect(page.getByTestId('ai-fields').locator('li')).toHaveCount(FIELDS);

  // cancel leaves B as it was
  await page.getByTestId('ai-cancel').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(0);

  // second time: no notice (remembered), apply
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
  await page.getByTestId('ai-apply').click({ timeout: 30000 });
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('without the helper the chip says so and the AI option explains how to start it', async ({ page }) => {
  await page.route('**/127.0.0.1:4310/**', (route) => route.abort());
  await openBatchWithB(page, null);
  await expect(page.getByTestId('ai-chip')).toContainText('sin conectar');
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await expect(page.getByTestId('ai-panel')).toContainText('npm run start:ia');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('the model is chosen per provider, cheap by default, and remembered', async ({ page }) => {
  await openBatchWithB(page);
  await page.getByTestId('ai-chip').click();
  await expect(page.getByTestId('ai-model-claude')).toHaveValue('sonnet');
  await expect(page.getByTestId('ai-panel')).toContainText('Económico por defecto');
  await page.getByTestId('ai-model-claude').selectOption('haiku');
  await page.getByTestId('ai-model-copilot').fill('gpt-5-mini');
  await page.getByTestId('ai-model-copilot').blur();
  const stored = await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.models'));
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ claude: 'haiku', copilot: 'gpt-5-mini' });
  await expect(page.getByTestId('ai-panel')).not.toContainText('Económico por defecto');
});
