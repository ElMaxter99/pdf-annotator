import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics, openLote } from './helpers';

// Parejas A↔B del editor del lote: navegar desde las tarjetas, resaltar la pareja y unirla con una línea.
// Usa el ayudante con el proveedor simulado (playwright.config.ts lo arranca con AI_HELPER_FAKE=1).
const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

async function shiftedPdf(dx: number, dy: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(source, [0]);
  const sheet = out.addPage([embedded.width, embedded.height]);
  sheet.drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await out.save());
}

async function openBatchWithB(page: Page) {
  await stubAnalytics(page);
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.provider', 'fake'));
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

async function proposeWithAi(page: Page) {
  await openLote(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-ai').click();
  await page.getByTestId('ai-consent-ok').click();
  await expect(page.getByTestId('ai-apply')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
}

/** Clic en el primer campo de A sin pareja hasta que salga el acceso rápido (la capa de A se redibuja sola). */
async function clickMissingA(page: Page) {
  const fieldA = page.getByTestId('split-a').locator('.reference-field--missing').first();
  await expect(fieldA).toBeVisible();
  let box: { x: number; y: number; width: number; height: number } | null = null;
  await expect(async () => {
    box = await fieldA.boundingBox();
    if (!box) throw new Error('sin campo de A');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('manual-place')).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15000 });
  return box!;
}

test('la tarjeta de la propuesta lleva a la pareja: A y B resaltados y unidos por una línea; Esc la quita', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  await page.getByTestId('ai-review-fields').click();
  await expect(page.getByTestId('ai-proposal')).toBeVisible();

  // pulsar el nombre no marca ni desmarca la casilla
  const row = page
    .locator('.ai-proposal__row')
    .filter({ has: page.locator('input[type=checkbox]') })
    .first();
  const box = row.locator('input[type=checkbox]');
  const before = await box.isChecked();
  await row.getByTestId('ai-row-go').click();
  expect(await box.isChecked()).toBe(before);

  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await expect(page.locator('.annotation.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('pair-line')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pair-line')).toHaveCount(0);
  await expect(page.locator('.pair-focus')).toHaveCount(0);
});

test('clic en un campo de A dibuja la línea hasta su pareja en B; clic en vacío la quita', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const fieldA = page.getByTestId('split-a').locator('.reference-field').first();
  // `boundingBox()` no espera: el campo de A se dibuja tras el render del panel.
  await expect(fieldA).toBeVisible();
  const r = await fieldA.boundingBox();
  if (!r) throw new Error('sin campo de A');
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.getByTestId('pair-line')).toBeVisible();
  await expect(page.locator('.annotation.pair-focus')).toHaveCount(1);

  // la línea va del campo de A al de B
  const line = page.getByTestId('pair-line').locator('line');
  const x1 = Number(await line.getAttribute('x1'));
  const x2 = Number(await line.getAttribute('x2'));
  expect(x2).toBeGreaterThan(x1);

  const pane = await page.getByTestId('split-a').boundingBox();
  if (!pane) throw new Error('sin panel A');
  await page.mouse.click(pane.x + 12, pane.y + 140);
  await expect(page.getByTestId('pair-line')).toHaveCount(0);
});

test('con la propuesta aplicada, la fila de un campo de B lleva a la pareja en «Dividida»', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  await page.getByTestId('ai-apply').click();
  await expect(page.getByTestId('ai-review')).toHaveCount(0);
  await openLote(page);
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a')).toBeVisible();
  await page.getByTestId('migration-summary-toggle').click();
  await page.getByTestId('migration-list').locator('.migration-row__name').first().click();
  await expect(page.locator('.annotation.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await expect(page.getByTestId('pair-line')).toBeVisible();
});

test('con la propuesta escrita en B: pasar el ratón por un campo de B dibuja la línea a A y el clic sigue abriendo el editor', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const written = page.locator('.annotation').first();
  await expect(written).toBeVisible();
  const r = await written.boundingBox();
  if (!r) throw new Error('sin campo escrito');
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(600);
  await expect(page.getByTestId('pair-line')).toBeVisible();
  await expect(page.getByTestId('split-a').locator('.reference-field.pair-focus')).toHaveCount(1);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await expect(page.locator('.annotation-editor, app-annotation-editor').first()).toBeVisible();
});

test('con una pareja activa, arrastrar sobre cajas solapadas de B mueve la emparejada y no la de encima', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const fieldA = page.getByTestId('split-a').locator('.reference-field').first();
  await expect(fieldA).toBeVisible();
  const a = await fieldA.boundingBox();
  if (!a) throw new Error('sin campo de A');
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  const paired = page.locator('.annotation.pair-focus');
  await expect(paired).toHaveCount(1);
  const pairedIndex = await paired.getAttribute('data-field-index');
  // Otra anotación de B se pone justo sobre la emparejada y encima de ella.
  const { topIndex, topOriginalLeft } = await page.evaluate((index) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('.annotation'));
    const base = els.find((el) => el.dataset['fieldIndex'] === index)!;
    const top = els
      .filter(
        (el) =>
          el.dataset['pageIndex'] === base.dataset['pageIndex'] &&
          el.dataset['fieldIndex'] !== index,
      )
      .shift()!;
    const original = top.style.left;
    top.style.left = base.style.left;
    top.style.top = base.style.top;
    top.style.zIndex = '10';
    return { topIndex: top.dataset['fieldIndex']!, topOriginalLeft: original };
  }, pairedIndex);
  await page.waitForTimeout(600); // las anotaciones se mueven con una transición
  const box = (index: string) => page.locator(`.annotation[data-field-index="${index}"]`);
  const pairedBefore = await box(pairedIndex!).evaluate((el) => (el as HTMLElement).style.left);
  // Un punto de la zona donde se solapan las dos cajas.
  const overlap = await page.evaluate(
    ([a, b]) => {
      const ra = document
        .querySelector(`.annotation[data-field-index="${a}"]`)!
        .getBoundingClientRect();
      const rb = document
        .querySelector(`.annotation[data-field-index="${b}"]`)!
        .getBoundingClientRect();
      const left = Math.max(ra.left, rb.left);
      const right = Math.min(ra.right, rb.right);
      const top = Math.max(ra.top, rb.top);
      const bottom = Math.min(ra.bottom, rb.bottom);
      return right - left > 2 && bottom - top > 2
        ? { x: (left + right) / 2, y: (top + bottom) / 2 }
        : null;
    },
    [pairedIndex!, topIndex],
  );
  if (!overlap) throw new Error('las cajas no se solapan');
  const { x, y } = overlap;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 10, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(() => box(pairedIndex!).evaluate((el) => (el as HTMLElement).style.left))
    .not.toBe(pairedBefore);
  // Tras el redibujado, la de encima sigue donde estaba: no se arrastró.
  expect(await box(topIndex).evaluate((el) => (el as HTMLElement).style.left)).toBe(
    topOriginalLeft,
  );
});

test('clic en un campo de A sin pareja ofrece «Colocar aquí» en B: lo pone en las mismas coordenadas de la página de B', async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('mode-split').click();
  await expect(page.locator('.annotation')).toHaveCount(0);
  const r = await clickMissingA(page);

  await expect(page.getByTestId('pair-tip')).toContainText('Sin pareja en B');
  const ghost = page.getByTestId('manual-place');
  await expect(ghost).toBeVisible();
  // el fantasma cae a la misma altura que el campo en A (mismas coordenadas, mismo zoom)
  const g = await ghost.locator('.manual-place__field').boundingBox();
  expect(Math.abs(g!.y - r.y)).toBeLessThan(6);

  await page.getByTestId('manual-place-btn').click();
  await expect(ghost).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(1);
  await expect(page.getByTestId('pair-line')).toBeVisible();
  await expect(page.getByTestId('split-a').locator('.reference-field--missing')).toHaveCount(
    (await page.getByTestId('split-a').locator('.reference-field').count()) - 1,
  );

  // un solo paso de deshacer
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('«Colocar a mano»: ✕ y Esc quitan el fantasma sin tocar B', async ({ page }) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('mode-split').click();
  // Los campos de A no reciben el puntero: el clic llega al panel y la app busca el campo por posición.
  await clickMissingA(page);
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('manual-place')).toHaveCount(0);
  await clickMissingA(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('manual-place')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('«No existe en B» desde el acceso rápido de A da el campo por resuelto, como «Descartar» de la lista', async ({
  page,
}) => {
  await openBatchWithB(page);
  await openLote(page);
  await page.getByTestId('mode-split').click();
  const missing = page.getByTestId('split-a').locator('.reference-field--missing');
  await expect(missing.first()).toBeVisible();
  const before = await missing.count();
  const pending = page.getByTestId('migration-pending').locator('.migration-row');
  const pendingBefore = await pending.count();
  await clickMissingA(page);

  await page.getByTestId('manual-place-dismiss').click();
  await expect(page.getByTestId('manual-place')).toHaveCount(0);
  await expect(pending).toHaveCount(pendingBefore - 1);
  await expect(missing).toHaveCount(before - 1);
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('borrar en B un campo de la propuesta de la IA lo descarta: no queda su fantasma gris y marcarlo lo recupera', async ({
  page,
}) => {
  await openBatchWithB(page);
  await proposeWithAi(page);
  const annotations = page.locator('.annotation');
  const ghosts = page.getByTestId('ai-proposal-field');
  const before = await annotations.count();
  const ghostsBefore = await ghosts.count();

  const target = annotations.first();
  const name = (await target.textContent())?.trim() ?? '';
  await target.click();
  const editor = page.locator('.annotation-editor.editing');
  await expect(editor).toBeVisible();
  await editor.locator('.btn-delete').click();
  await expect(annotations).toHaveCount(before - 1);
  // antes quedaba en su sitio en gris («fuera de B») y parecía que no se había borrado
  await expect(ghosts).toHaveCount(ghostsBefore);

  // la fila sigue en la lista, desmarcada; marcarla vuelve a escribirla en B
  await page.getByTestId('ai-review-fields').click();
  const row = page.locator('.ai-proposal__row').filter({ hasText: name }).first();
  const box = row.locator('input[type=checkbox]');
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(annotations).toHaveCount(before);
  // y desmarcarla otra vez la deja en gris, como siempre
  await box.uncheck();
  await expect(annotations).toHaveCount(before - 1);
  await expect(ghosts).toHaveCount(ghostsBefore + 1);
});
