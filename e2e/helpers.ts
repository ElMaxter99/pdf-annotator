import { expect, Page } from '@playwright/test';
import { join } from 'node:path';

export const EXAMPLE_PDF = join(__dirname, '..', 'examples', 'factura-ejemplo.pdf');
export const EXAMPLE_JSON = join(__dirname, '..', 'examples', 'anotaciones-ejemplo.json');

/** Blocks Vercel analytics scripts, which do not exist outside Vercel. */
export async function stubAnalytics(page: Page, options: { fit?: boolean } = {}) {
  if (!options.fit) {
    // Los tests parten del zoom histórico (150 %); el ajuste a la página se prueba aparte.
    await page.addInitScript(() => ((window as unknown as { __PDFA_NO_FIT__: boolean }).__PDFA_NO_FIT__ = true));
  }
  await page.route('**/_vercel/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
  );
}

/** Opens the workspace with the example invoice loaded and zoomed out to see the whole page. */
export type SidebarTab = 'Documento' | 'Anotaciones' | 'Ajustes' | 'Plantillas' | 'Avanzado';

export async function openSidebarTab(page: Page, name: SidebarTab) {
  // Plantillas y Avanzado viven ahora en la pestaña «Ajustes».
  const tab = name === 'Plantillas' || name === 'Avanzado' ? 'Ajustes' : name;
  await page.getByRole('tab', { name: new RegExp(`^\\s*${tab}`) }).click();
}

/** La vista (Muestra / Mapeo / Datos) se elige en el desplegable de la píldora. */
export async function chooseView(page: Page, name: 'Muestra' | 'Mapeo' | 'Datos') {
  await page.getByTestId('view-menu').click();
  await page.getByRole('menu', { name: 'Qué se pinta en las anotaciones' }).getByRole('menuitemradio', { name }).click();
}

export async function openWorkspace(
  page: Page,
  options: { zoomOut?: number; tab?: SidebarTab; view?: 'Muestra' | 'Mapeo' | 'Datos' } = {}
) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await page.waitForTimeout(800);
  for (let i = 0; i < (options.zoomOut ?? 4); i += 1) {
    await page.keyboard.press('-');
    await page.waitForTimeout(120);
  }
  // Most tests assert the mapField text, so they open the "Mapeo" view (the app default is "Muestra").
  await chooseView(page, options.view ?? 'Mapeo');
  // Most flows work with the JSON editor, which lives in the "Anotaciones" tab.
  await openSidebarTab(page, options.tab ?? 'Anotaciones');
  // Single-key shortcuts are ignored while a button has focus, so leave the tab button.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

export const jsonEditor = (page: Page) => page.locator('app-json-code-editor');
export const jsonContent = (page: Page) => page.locator('app-json-code-editor .cm-content');

/** Texto completo del editor de código (el DOM de CodeMirror solo pinta las líneas visibles). */
export async function jsonValue(page: Page): Promise<string> {
  return jsonEditor(page).evaluate((el) => (el as unknown as { value: string }).value);
}

export async function fillJson(page: Page, text: string) {
  await jsonContent(page).fill(text);
}

export async function expectJsonValue(page: Page, expected: RegExp | string) {
  await expect
    .poll(() => jsonValue(page))
    [typeof expected === 'string' ? 'toBe' : 'toMatch'](expected as never);
}


export async function readJson(page: Page) {
  return JSON.parse(await jsonValue(page));
}

export async function fieldCount(page: Page) {
  const json = await readJson(page);
  return json.pages[0]?.fields.length ?? 0;
}

/** Clicks on the page at a relative position and returns once the create-editor is open. */
export async function clickPage(page: Page, fx: number, fy: number) {
  const box = await page.locator('.hitbox').boundingBox();
  if (!box) throw new Error('hitbox not found');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

export async function addAnnotation(page: Page, fx: number, fy: number, text: string) {
  await clickPage(page, fx, fy);
  await expect(page.locator('.annotation-editor')).toBeVisible();
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
  await expect(page.locator('.annotation-editor')).toHaveCount(0);
}

export async function applyJsonText(page: Page, value: unknown) {
  await fillJson(page, typeof value === 'string' ? value : JSON.stringify(value));
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(500);
}

export async function renderedAnnotations(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.annotation')].map((el) => ({
      text: el.textContent,
      fontFamily: el.style.fontFamily,
      fontSize: el.style.fontSize,
    }))
  );
}

/** Opens the «Lote» menu of the single batch bar (P-143) unless it is already open. */
export async function openLote(page: Page) {
  const menu = page.getByTestId('lote-menu');
  if (!(await menu.isVisible())) await page.getByTestId('lote-open').click();
  await expect(menu).toBeVisible();
}
