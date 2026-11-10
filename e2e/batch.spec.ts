import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, openSidebarTab, stubAnalytics } from './helpers';

const pdfBytes = readFileSync(EXAMPLE_PDF);
const pdfFile = (name: string) => ({ name, mimeType: 'application/pdf', buffer: pdfBytes });
const jsonFile = (name: string) => ({
  name,
  mimeType: 'application/json',
  buffer: readFileSync(EXAMPLE_JSON),
});

async function startBatch(page: import('@playwright/test').Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([pdfFile('uno.pdf'), pdfFile('dos.pdf'), pdfFile('tres.pdf'), jsonFile('uno.json')]);
  await page.waitForURL('**/batch/load');
  await page.locator('#step-next').click();
  await page.locator('#step-skip').click();
  await page.getByRole('button', { name: /^Ir al panel con 3 PDF/ }).click();
  await page.waitForURL('**/batch');
}

/** A real PDF with other content than the example, so it counts as a different file. */
async function otherPdf(name: string, label = name) {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]).drawText(label, { x: 50, y: 700, size: 18 });
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
}

const card = (page: import('@playwright/test').Page, name: string) =>
  page.locator('.pcard', { hasText: name });

const template = (name: string, x = 10) =>
  JSON.stringify({
    _id: { $oid: '6650a1f3c2b4e8a1d4f00031' },
    pdfName: name,
    pages: [{ num: 1, fields: [{ x, y: 20, mapField: 'k', fontSize: 12 }] }],
  });

/** Loads three PDFs on the landing and pastes the given template text in the load step. */
async function loadAndPaste(page: import('@playwright/test').Page, text: string) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles([pdfFile('uno.pdf'), pdfFile('dos.pdf'), pdfFile('tres.pdf')]);
  await page.waitForURL('**/batch/load');
  await expect(page.locator('[aria-current=step]')).toContainText('Subir PDF');
  await page.locator('#step-next').click();
  await page.locator('#batch-paste').fill(text);
}

/** Waits until IndexedDB holds `count` re-laid-out items, so a reload cannot lose a pending write. */
async function waitForSavedLayouts(page: import('@playwright/test').Page, count: number) {
  await page.waitForFunction(
    (expected) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('pdf-annotator-batch');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const db = open.result;
          try {
            const all = db.transaction('items', 'readonly').objectStore('items').getAll();
            all.onsuccess = () => {
              db.close();
              resolve(all.result.filter((item: { relaid?: boolean }) => item.relaid).length >= expected);
            };
            all.onerror = () => {
              db.close();
              resolve(false);
            };
          } catch {
            db.close();
            resolve(false);
          }
        };
      }),
    count
  );
}

test('several files open the load step and a lone JSON still pairs by file name', async ({ page }) => {
  await startBatch(page);
  await expect(page.getByText('0 de 3 validados')).toBeVisible();
  const cards = page.locator('.pcard[data-status]');
  await expect(cards).toHaveCount(3);
  await expect(card(page, 'uno.pdf')).toHaveAttribute('data-status', 'missingNew');
  await expect(card(page, 'dos.pdf')).toHaveAttribute('data-status', 'noTemplate');
  // The first page of each PDF is drawn as a thumbnail.
  await expect(page.locator('.pcard img')).toHaveCount(3, { timeout: 15_000 });
});

test('the panel also shows a table with the same PDFs', async ({ page }) => {
  await startBatch(page);
  await page.getByRole('button', { name: /Tabla/ }).click();
  await expect(page.locator('.table [role=row][data-status]')).toHaveCount(3);
  await page.getByRole('button', { name: /Cuadrícula/ }).click();
  await expect(page.locator('.pcard')).toHaveCount(3);
});

test('the landing offers Lotes discreetly and the link opens the load step', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Modo Lotes' }).click();
  await page.waitForURL('**/batch/load');
  await expect(page.getByRole('navigation', { name: 'Modo de trabajo' })).toBeVisible();
  await page.getByRole('link', { name: 'Editor · 1 PDF' }).click();
  await page.waitForURL('**/landing');
});

test('pasting a mongoexport pairs each template with its PDF by pdfName', async ({ page }) => {
  const text = [template('uno.pdf'), template('dos.pdf', 30), template('TRES'), template('sobra.pdf', 50)].join('\n');
  await loadAndPaste(page, text);
  await expect(page.locator('.pill--ok')).toContainText('4 plantillas');
  await page.getByRole('button', { name: 'Añadir 4 plantillas' }).click();
  await page.locator('#step-next').click();
  await expect(page.getByText('Todo listo para entrar al panel')).toBeVisible();
  await page.getByRole('button', { name: /^Ir al panel con 3 PDF/ }).click();
  await page.waitForURL('**/batch');
  for (const name of ['uno.pdf', 'dos.pdf', 'tres.pdf']) {
    await expect(card(page, name)).toHaveAttribute('data-status', 'missingNew');
  }
});

test('templates are imported from the panel and broken pasted ones stay in the box', async ({ page }) => {
  await startBatch(page);
  const broken = '{"pdfName":"tres.pdf","pages":[ {"num":1, fields: ';
  await page.locator('#open-templates').click();
  await page.locator('#tpl-paste').fill([template('dos.pdf', 30), broken].join('\n'));
  await page.getByRole('button', { name: 'Añadir 1 plantillas' }).click();
  await expect(page.locator('#tpl-paste')).toHaveValue(broken);
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(card(page, 'dos.pdf')).toHaveAttribute('data-status', 'missingNew');
  await expect(card(page, 'tres.pdf')).toHaveAttribute('data-status', 'noTemplate');
});

test('a single PDF still opens the editor', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(pdfFile('solo.pdf'));
  await page.waitForURL('**/workspace');
});

test('duplicates and non-PDF files are reported without blocking the batch', async ({ page }) => {
  await startBatch(page);
  await page.locator('input[type=file]').first().setInputFiles([pdfFile('uno.pdf'), { name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  const notice = page.locator('.note--warn[role=alert]');
  await expect(notice).toContainText('uno.pdf');
  await expect(notice).toContainText('notas.txt');
});

test('version B: the same content is only a notice, a different file pairs by name', async ({ page }) => {
  await startBatch(page);
  await page.locator('#open-version-b').click();
  const drawer = page.getByRole('dialog', { name: 'Subir versión B' });
  await drawer.locator('input[type=file]').setInputFiles([pdfFile('uno.pdf'), await otherPdf('dos.pdf')]);
  await expect(drawer.getByText('Es el mismo PDF').first()).toBeVisible();
  await expect(drawer.locator('.note--info')).toContainText('uno.pdf es el mismo PDF');
  await expect(drawer.getByRole('button', { name: 'Añadir 1 versiones B' })).toBeEnabled();
  await drawer.getByRole('button', { name: 'Añadir 1 versiones B' }).click();
  await expect(page.getByRole('dialog', { name: 'Subir versión B' })).toHaveCount(0);
  await expect(card(page, 'dos.pdf')).toContainText('Versión B');
  await expect(card(page, 'uno.pdf')).toContainText('Solo versión A');
});

test('a broken template is flagged with its line and does not block the others', async ({ page }) => {
  await startBatch(page);
  await card(page, 'tres.pdf').getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.locator('#template-text').fill('var t = {\n  pages: [ { num: 1, fields: [ { x: 1, y: , mapField: "a" } ] } ]\n};');
  await expect(page.locator('#template-status')).toContainText('línea 2');
  await expect(page.getByRole('button', { name: 'Usar plantilla' })).toBeDisabled();
});

test('the batch survives a reload and nothing is downloadable until it is validated', async ({ page }) => {
  await startBatch(page);
  await page.reload();
  await expect(page.locator('.pcard[data-status]')).toHaveCount(3);
  await expect(page.locator('#download-validated')).toBeDisabled();
});

test('the editor can add its PDF to the batch and opens the panel', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(pdfFile('solo.pdf'));
  await page.waitForURL('**/workspace');
  await expect(page.getByRole('navigation', { name: 'Modo de trabajo' })).toBeVisible();
  await page.getByRole('button', { name: 'Añadir al lote' }).click();
  await page.waitForURL('**/batch');
  await expect(card(page, 'solo.pdf')).toHaveAttribute('data-status', 'noTemplate');
});

test('the load step is a three-step stepper and templates can be skipped', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles([pdfFile('uno.pdf'), pdfFile('dos.pdf')]);
  await page.waitForURL('**/batch/load');
  await expect(page.getByText('Paso previo · aún no hay panel')).toBeVisible();
  const current = page.locator('[aria-current=step]');
  await expect(current).toContainText('Subir PDF');
  await page.locator('#step-next').click();
  await expect(current).toContainText('Plantillas');
  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(current).toContainText('Subir PDF');
  await page.locator('#step-next').click();
  await page.locator('#step-skip').click();
  await expect(current).toContainText('Empezar');
  await expect(page.getByText('PDF sin plantilla (podrás añadirla desde el panel)')).toBeVisible();
  await page.getByRole('button', { name: /^Ir al panel con 2 PDF/ }).click();
  await page.waitForURL('**/batch');
});

test('opened PDFs become tabs of the session and can be closed', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/editor/);
  await openBatchMenu(page, '#batch-setup');
  await page.waitForURL(/setup=1/);
  const tabs = page.getByRole('tablist', { name: 'PDF abiertos' });
  await expect(tabs.getByRole('link', { name: 'uno.pdf' })).toBeVisible();
  await tabs.getByRole('link', { name: /Panel del lote/ }).click();
  await page.waitForURL('**/batch');
  await expect(tabs.getByRole('link', { name: 'uno.pdf' })).toBeVisible();
  await tabs.getByRole('button', { name: 'Cerrar uno.pdf' }).click();
  await expect(tabs.getByRole('link', { name: 'uno.pdf' })).toHaveCount(0);
});

test('the card menu removes version B and the validation', async ({ page }) => {
  await startBatch(page);
  await page.locator('#open-version-b').click();
  const drawer = page.getByRole('dialog', { name: 'Subir versión B' });
  await drawer.locator('input[type=file]').setInputFiles([await otherPdf('dos.pdf')]);
  await drawer.getByRole('button', { name: /^Añadir 1 versiones B/ }).click();
  await expect(card(page, 'dos.pdf')).toContainText('Versión B');
  await card(page, 'dos.pdf').getByRole('button', { name: /Más acciones de dos.pdf/ }).click();
  await page.getByRole('menuitem', { name: 'Quitar la versión B' }).click();
  await expect(card(page, 'dos.pdf')).toContainText('Solo versión A');
  await card(page, 'dos.pdf').getByRole('button', { name: /Más acciones de dos.pdf/ }).click();
  await page.getByRole('menuitem', { name: 'Quitar del lote' }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);
});

test('optional test data are pasted in a drawer and last only the session', async ({ page }) => {
  await startBatch(page);
  await page.locator('#open-test-data').click();
  const drawer = page.getByRole('dialog', { name: 'Datos de prueba' });
  await drawer.locator('#test-data-text').fill('{"cliente":{"nombre":"Lucía"}}');
  await expect(drawer.getByText('Datos de prueba activos')).toBeVisible();
  await drawer.locator('#test-data-text').fill('{"cliente": ');
  await expect(drawer.getByRole('alert')).toBeVisible();
});

const twoPagePdf = async (name: string) => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(await doc.save()) };
};

/** Opens uno.pdf, adds the given version B from the setup and enters the A/B editor. */
async function openBatchMenu(page: import('@playwright/test').Page, item: string) {
  await page.locator('#batch-menu').click();
  await page.locator(item).click();
}

async function openEditorWithB(page: import('@playwright/test').Page, b = otherPdf('uno-b.pdf')) {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/editor/);
  await openBatchMenu(page, '#batch-setup');
  await page.waitForURL(/setup=1/);
  await page.locator('#change-template').click();
  await page.locator('#template-text').fill(
    '{"pages":[{"num":1,"fields":[{"x":150,"y":722,"mapField":"cliente.nombre","fontSize":12},{"x":150,"y":700,"mapField":"cliente.nif","fontSize":12}]}]}'
  );
  await page.getByRole('button', { name: 'Usar plantilla' }).click();
  await page.locator('#setup-b-file').setInputFiles(await b);
  await expect(page.locator('.row--sel')).toBeVisible();
  // A version B with another page size asks how to adapt the coordinates first.
  if (await page.locator('#size-title').isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.locator('.dialog .btn:not(.btn--ghost)').click();
  } else {
    await page.locator('#continue-item').click();
  }
  await page.waitForURL(/\/editor/);
  await expect(page.locator('#batch-bar')).toBeVisible();
  await openSidebarTab(page, 'Anotaciones');
}

test('a PDF with a template opens the single-PDF editor; validate it from there and download it', async ({ page }) => {
  await startBatch(page);
  await card(page, 'dos.pdf').getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.waitForURL(/\/batch\/.+/);
  await page.locator('#template-text').fill('db.t.drop();\nvar pdfTemplate = { _id: ObjectId("abc"), pages: [ { num: 1, fields: [ { x: 150, y: 722, mapField: "cliente.nombre", fontSize: 12 } ] } ] };');
  await expect(page.locator('#template-status')).toContainText('1 páginas · 1 campos');
  await page.getByRole('button', { name: 'Usar plantilla' }).click();
  await page.locator('#continue-item').click();
  await page.waitForURL(/\/editor/);
  // Without B the editor works on template A and there is no A pane yet.
  await expect(page.locator('app-batch-reference')).toHaveCount(0);
  await openSidebarTab(page, 'Anotaciones');
  await expect(page.locator('#rel-no-b')).toBeVisible();
  await expect(page.locator('#batch-validate-open')).toBeDisabled();
});

test('with a version B the editor shows A next to B and can validate from the editor', async ({ page }) => {
  await openEditorWithB(page);
  await expect(page.locator('app-batch-reference')).toBeVisible();
  await expect(page.locator('#rel-b li')).toHaveCount(2);
  await page.locator('#batch-validate-open').click();
  await page.locator('#batch-validate-confirm').click();
  await page.waitForURL('**/batch');
  await expect(card(page, 'uno.pdf')).toHaveAttribute('data-status', 'validated');
});

test('selecting a field in B lights its pair in A and clicking A selects B', async ({ page }) => {
  await openEditorWithB(page);
  await page.locator('#rel-b li button').first().click();
  await expect(page.locator('.ref__fld.is-focus')).toHaveCount(1);
  await page.locator('#rel-b li button').first().click();
  await page.locator('.ref__fld').first().click();
  await expect(page.locator('#rel-b .is-focus')).toHaveCount(1);
});

test('A fields not used in B are listed and can be added; B-only fields are flagged', async ({ page }) => {
  await openEditorWithB(page);
  await expect(page.locator('#rel-a-unused li')).toHaveCount(0);
  await page.locator('#rel-b li button').first().click();
  await page.locator('.selection-bar__btn--danger').click();
  await expect(page.locator('#rel-a-unused li')).toHaveCount(1);
  await page.locator('#rel-a-unused li button').first().click();
  await expect(page.locator('#rel-a-unused li')).toHaveCount(0);
  await expect(page.locator('#rel-b li')).toHaveCount(2);
});

test('the A to B report counts what stayed, moved or is new', async ({ page }) => {
  await openEditorWithB(page);
  await openBatchMenu(page, '#batch-diff-open');
  await expect(page.locator('#batch-diff')).toContainText('Igual');
  await expect(page.locator('#batch-diff tr[data-kind=same]')).not.toHaveCount(0);
  await page.locator('#batch-diff-close').click();
  await expect(page.locator('#batch-diff')).toHaveCount(0);
});

test('a field can move to another page of B and the A and B pages navigate on their own', async ({ page }) => {
  await openEditorWithB(page, twoPagePdf('uno-b.pdf'));
  await page.locator('#rel-b li button').first().click();
  await page.locator('#rel-move-sel').selectOption('2');
  await expect(page.locator('#rel-b li button').last()).toContainText('B p.2');
  // A has one page and B two: the pages cannot be linked, each navigates on its own.
  await expect(page.locator('#ref-link')).toHaveCount(0);
  await expect(page.locator('#ref-page')).toContainText('1 / 1');
});

test('A and B are shown side by side at the same size even when their pages differ in scale', async ({ page }) => {
  const big = await PDFDocument.create();
  big.addPage([1190, 1684]); // twice the size of an A4
  await openEditorWithB(page, Promise.resolve({ name: 'uno-b.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await big.save()) }));
  await page.getByRole('button', { name: 'Ajustar' }).click();
  const box = async () => ({
    a: (await page.locator('.ref__page').boundingBox())!,
    b: (await page.locator('.canvas-container').boundingBox())!,
  });
  await expect.poll(async () => Math.abs((await box()).a.width - (await box()).b.width)).toBeLessThan(3);
  const { a, b } = await box();
  expect(Math.abs(a.y - b.y)).toBeLessThan(3);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
});

test('the guide band is open the first time, can be folded and stays folded afterwards', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/editor/);
  await expect(page.locator('#batch-guide .guide__main')).toBeVisible();
  await expect(page.locator('#batch-state')).toContainText('Falta el PDF B');
  await page.locator('#batch-guide-fold').click();
  await expect(page.locator('#batch-guide-show')).toBeVisible();
  await page.locator('#batch-back').click();
  await page.waitForURL('**/batch');
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/editor/);
  await expect(page.locator('#batch-guide-show')).toBeVisible();
  await page.locator('#batch-guide-show').click();
  await expect(page.locator('#batch-guide .guide__main')).toBeVisible();
});

test('with B empty the viewer offers how to start it and copying A fills it', async ({ page }) => {
  await openEditorWithB(page);
  await page.locator('#rel-b li button').first().click();
  await page.locator('.selection-bar__btn--danger').click();
  await page.locator('#rel-b li button').first().click();
  await page.locator('.selection-bar__btn--danger').click();
  await expect(page.locator('#batch-start')).toBeVisible();
  await page.locator('#rel-copy').click();
  await expect(page.locator('#batch-start')).toHaveCount(0);
  await expect(page.locator('#rel-b li')).toHaveCount(2);
});

test('with A empty the start offers no copy, only starting from scratch or uploading B', async ({ page }) => {
  await startBatch(page);
  await card(page, 'dos.pdf').getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.waitForURL(/\/batch\/.+/);
  await page.locator('#template-text').fill('{"pages":[{"num":1,"fields":[]}]}');
  await page.getByRole('button', { name: 'Usar plantilla' }).click();
  await page.locator('#setup-b-file').setInputFiles(await otherPdf('uno-b.pdf'));
  await expect(page.locator('.row--sel')).toBeVisible();
  if (await page.locator('#size-title').isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.locator('.dialog .btn:not(.btn--ghost)').click();
  } else {
    await page.locator('#continue-item').click();
  }
  await page.waitForURL(/\/editor/);
  await expect(page.locator('#batch-start')).toBeVisible();
  await expect(page.locator('#rel-copy')).toHaveCount(0);
  await expect(page.locator('#rel-empty')).toBeVisible();
  await expect(page.locator('#rel-upload')).toBeVisible();
  await expect(page.locator('#batch-guide .lab')).toBeVisible();
  await expect(page.locator('#batch-guide')).toHaveCount(1);
  await page.locator('#rel-empty').click();
  await expect(page.locator('#batch-start')).toHaveCount(0);
});

test('the card is vertical, asks before continuing without a template and the editor can set A later', async ({ page }) => {
  await startBatch(page);
  await card(page, 'dos.pdf').getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.waitForURL(/\/batch\/.+/);
  await expect(page.locator('#setup-step-a')).toBeVisible();
  await expect(page.locator('#setup-step-b')).toBeVisible();
  await page.locator('#compare-without-template').click();
  await expect(page.locator('#none-title')).toBeVisible();
  await page.getByRole('button', { name: 'Volver y pegar la plantilla' }).click();
  await expect(page.locator('#none-title')).toHaveCount(0);
  await page.locator('#compare-without-template').click();
  await page.locator('#confirm-no-template').click();
  await expect(page.locator('#change-template')).toBeVisible();
  await expect(page.locator('#setup-step-a')).toContainText('Sin plantilla de A');
  await page.locator('#setup-b-file').setInputFiles(await otherPdf('uno-b.pdf'));
  await expect(page.locator('.row--sel')).toBeVisible();
  if (await page.locator('#size-title').isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.locator('.dialog .btn:not(.btn--ghost)').click();
  } else {
    await page.locator('#continue-item').click();
  }
  await page.waitForURL(/\/editor/);
  await expect(page.locator('#batch-edits')).toContainText('Editas B');
  await expect(page.locator('#ref-empty')).toBeVisible();
  await page.locator('#ref-put-a').click();
  await page.locator('#batch-template-text').fill(
    '{"pages":[{"num":1,"fields":[{"x":150,"y":722,"mapField":"cliente.nombre","fontSize":12}]}]}'
  );
  await page.locator('#batch-template-apply').click();
  await expect(page.locator('#ref-empty')).toHaveCount(0);
  await openSidebarTab(page, 'Anotaciones');
  await expect(page.locator('#rel-a-unused li')).toHaveCount(1);
  await openBatchMenu(page, '#batch-setup');
  await page.waitForURL(/setup=1/);
  await expect(page.locator('#setup-step-a')).toContainText('1 páginas · 1 campos');
});
