import { expect, test } from '@playwright/test';
import { addAnnotation, openSidebarTab, openWorkspace } from './helpers';

test.beforeEach(async ({ page }) => openWorkspace(page));

test('el editor vacío enseña tres pasos; al colocar el primer campo se van y sale una pista única', async ({ page }) => {
  await expect(page.getByTestId('first-steps')).toBeVisible();
  await expect(page.getByTestId('annotations-empty')).toBeVisible();
  await addAnnotation(page, 0.4, 0.3, 'Hola');
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
  await expect(page.getByTestId('first-hint')).toBeVisible();
  await expect(page.getByTestId('annotations-empty')).toHaveCount(0);
  // The hint is shown once: a fresh visit with annotations already placed brings nothing back.
  await page.reload();
  await expect(page.getByTestId('first-hint')).toHaveCount(0);
});

test('✕ cierra los tres pasos y no vuelven', async ({ page }) => {
  await page.getByTestId('first-steps-close').click();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.guide.steps'))).toBe('1');
});

test('«Pegar JSON» del estado vacío abre el editor de texto', async ({ page }) => {
  await openSidebarTab(page, 'Anotaciones');
  await page.getByTestId('empty-paste').click();
  await expect(page.locator('app-json-code-editor .cm-content')).toBeFocused();
});

test('los botones de los tres pasos reciben el clic (no lo recoge la zona de clic del PDF)', async ({ page }) => {
  for (const id of ['first-steps-import', 'first-steps-never', 'first-steps-close']) {
    const hit = await page.getByTestId(id).evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!top && (top === el || el.contains(top));
    });
    expect(hit, id).toBe(true);
  }
  // «No volver a mostrar» cierra el aviso y no se pone ningún campo detrás.
  await page.getByTestId('first-steps-never').click();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);
  await expect(page.getByTestId('annotation-editor')).toHaveCount(0);
});
