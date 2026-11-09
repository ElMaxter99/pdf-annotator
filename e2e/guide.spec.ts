import { expect, test } from '@playwright/test';
import { stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

test('the guide lists every topic and opens one with its steps', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByRole('heading', { name: 'Todo lo que puede hacer PDF Annotator' })).toBeVisible();
  await expect(page.locator('.guide__card')).toHaveCount(11);

  await page.locator('.guide__card', { hasText: 'Editar una anotación' }).click();
  await page.waitForURL('**/guide/edit');
  await expect(page.getByRole('heading', { name: 'Editar una anotación', level: 1 })).toBeFocused();
  await expect(page.locator('.guide__steps li')).toHaveCount(3);
  await expect(page.locator('.guide__shot img')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Editar una anotación' }).first()).toHaveAttribute('aria-current', 'page');

  await page.locator('.guide__pn-next').click();
  await page.waitForURL('**/guide/selection');
  await expect(page.locator('.guide__shot--diagram')).toBeVisible();
});

test('search filters topics, and shows a way out when nothing matches', async ({ page }) => {
  await page.goto('/guide');
  await page.getByRole('searchbox').fill('rejilla');
  await expect(page.locator('.guide__card')).toHaveCount(1);
  await expect(page.locator('.guide__card')).toContainText('Guías y precisión');

  await page.getByRole('searchbox').fill('cuchillo');
  await expect(page.getByRole('status')).toContainText('Nada para «cuchillo»');
  await page.getByRole('button', { name: 'Ver todos los temas' }).click();
  await expect(page.locator('.guide__card')).toHaveCount(11);
});

test('"Probar en la app" opens the sample document in the editor', async ({ page }) => {
  await page.goto('/guide/start');
  await page.getByRole('button', { name: 'Probar en la app' }).click();
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
});

test('the guide follows the language', async ({ page }) => {
  await page.goto('/guide/start');
  await page.locator('app-language-selector select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Getting started', level: 1 })).toBeVisible();
});
