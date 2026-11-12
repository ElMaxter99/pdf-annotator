import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addAnnotation, EXAMPLE_JSON, EXAMPLE_PDF, fieldCount, openWorkspace, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

const homeLink = (page: Page) => page.getByRole('link', { name: /Ir al inicio/ });

test('the logo of the editor goes back to the start', async ({ page }) => {
  await openWorkspace(page);
  await expect(homeLink(page)).toHaveAttribute('title', 'Ir al inicio');
  await homeLink(page).click();
  await expect(page).toHaveURL(/\/landing$/);
  await expect(page.getByText('Carga tu PDF')).toBeVisible();
});

test('Back and Forward move between the start and the PDF being edited', async ({ page }) => {
  await openWorkspace(page);
  await addAnnotation(page, 0.3, 0.3, 'ida y vuelta');
  await expect.poll(() => fieldCount(page)).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/\/landing$/);
  await expect(page.locator('.landing__resume')).toContainText('anotaciones: 1');

  await page.goForward();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await expect.poll(() => fieldCount(page)).toBe(1);
});

test('Forward reopens a PDF without annotations left in this visit', async ({ page }) => {
  await openWorkspace(page);
  await homeLink(page).click();
  await expect(page).toHaveURL(/\/landing$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.locator('.canvas--pdf')).toBeVisible();
});

test('a batch PDF keeps its place in the URL: reload and Forward reopen the same PDF', async ({
  page,
}) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('factura-0331.pdf', pdf, 'application/pdf'),
      file('factura-0332.pdf', pdf, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('factura-0331.json', json, 'application/json'));
  await page.getByTestId('open-panel').click();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace?lote=*');
  const fields = JSON.parse(json.toString()).pages[0].fields.length as number;
  await expect(page.locator('.annotation')).toHaveCount(fields);
  const url = page.url();

  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.migration-bar')).toContainText('factura-0331');
  await expect(page.locator('.annotation')).toHaveCount(fields);

  await page.getByTestId('back-to-batch').click();
  await page.waitForURL('**/lote');
  await page.goBack();
  await expect(page).toHaveURL(url);
  await expect(page.locator('.migration-bar')).toContainText('factura-0331');
});
