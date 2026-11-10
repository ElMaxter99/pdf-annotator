import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

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

test('version B with another name is associated by hand from the PDF page', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/batch\/.+/);
  await expect(page.locator('app-batch-compare')).toBeVisible();
  // Same content, other name: not a new version.
  await page.locator('#replace-b').setInputFiles(pdfFile('uno final.pdf'));
  await expect(page.locator('.compare-head .note--ok')).toContainText('uno final.pdf es el mismo PDF');
  await expect(page.locator('.pane:visible')).toHaveCount(1);
  // Different content: it becomes version B whatever its name.
  await page.locator('#replace-b').setInputFiles(await otherPdf('uno final.pdf'));
  await expect(page.locator('.pane:visible')).toHaveCount(2);
  await expect(page.locator('.tag--accent')).toContainText('uno final.pdf');
});

test('review the original, validate it with OK and a confirmation, then download it', async ({ page }) => {
  await startBatch(page);
  await card(page, 'dos.pdf').getByRole('button', { name: 'Pegar plantilla' }).click();
  await page.waitForURL(/\/batch\/.+/);
  await page.locator('#template-text').fill('db.t.drop();\nvar pdfTemplate = { _id: ObjectId("abc"), pages: [ { num: 1, fields: [ { x: 150, y: 722, mapField: "cliente.nombre", fontSize: 12 } ] } ] };');
  await expect(page.locator('#template-status')).toContainText('1 páginas · 1 campos');
  await page.getByRole('button', { name: 'Usar plantilla' }).click();
  // Without a version B the original is reviewed with its coordinates.
  await expect(page.locator('app-batch-compare')).toBeVisible();
  await expect(page.locator('.fld--orig')).toHaveCount(1);
  await page.locator('#validate-ok').click();
  await expect(page.getByRole('dialog', { name: /¿Validar dos\.pdf\?/ })).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.locator('#validate-ok')).toBeVisible();
  await page.locator('#validate-ok').click();
  await page.locator('#confirm-validate').click();
  await expect(page.getByText('Validado').first()).toBeVisible();

  await page.getByRole('link', { name: /Panel del lote/ }).click();
  await expect(card(page, 'dos.pdf')).toHaveAttribute('data-status', 'validated');
  await expect(page.getByText('1 de 3 validados')).toBeVisible();
  await page.locator('#download-validated').click();
  const names: string[] = [];
  page.on('download', (download) => names.push(download.suggestedFilename()));
  await page.getByRole('button', { name: /Descargar 2 archivos/ }).click();
  await expect(page.getByRole('heading', { name: 'Lote descargado' })).toBeVisible({ timeout: 30_000 });
  expect(names.sort()).toEqual(['dos.json', 'dos.pdf']);
});

test('add a version B, compare, adjust the coordinates and save', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/batch\/.+/);
  await page.locator('#replace-b').setInputFiles(await otherPdf('uno-b.pdf'));
  await expect(page.locator('.pane')).toHaveCount(2);
  await expect(page.locator('.fld--new')).not.toHaveCount(0);

  await page.getByRole('button', { name: 'Superpuesto' }).click();
  await expect(page.locator('.cmp__panes--overlay')).toBeVisible();
  await page.getByRole('button', { name: 'Lado a lado' }).click();

  const field = page.locator('.fld--new').first();
  const before = await field.boundingBox();
  await page.mouse.move(before!.x + 4, before!.y + 4);
  await page.mouse.down();
  await page.mouse.move(before!.x + 54, before!.y + 44, { steps: 4 });
  await page.mouse.up();
  const after = await field.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 30);
  await expect(page.getByRole('button', { name: /Deshacer/ })).toBeEnabled();

  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await waitForSavedLayouts(page, 1);
  await page.goto('/batch');
  await expect(card(page, 'uno.pdf')).toHaveAttribute('data-status', 'relaid');
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
  await page.waitForURL(/\/batch\/.+/);
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

test('coordinates A can be adjusted and version B can start from a copy of A', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/batch\/.+/);
  // Without a version B only A moves.
  const a = page.locator('.fld--orig').first();
  await expect(a).toBeVisible();
  const before = await a.boundingBox();
  await page.mouse.move(before!.x + 4, before!.y + 4);
  await page.mouse.down();
  await page.mouse.move(before!.x + 44, before!.y + 34, { steps: 4 });
  await page.mouse.up();
  const after = await a.boundingBox();
  expect(after!.x).toBeGreaterThan(before!.x + 25);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.locator('#replace-b').setInputFiles(await otherPdf('uno-b.pdf'));
  await expect(page.locator('.pane:visible')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ajustar B' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Copiar A a B' }).click();
  await page.getByRole('button', { name: 'Ajustar A' }).click();
  await expect(page.getByRole('button', { name: 'Ajustar A' })).toHaveAttribute('aria-pressed', 'true');
});

test('the work view drops the name list, shows a mini preview and moves a field to another page', async ({ page }) => {
  await startBatch(page);
  await card(page, 'uno.pdf').locator('.pcard__thumb').click();
  await page.waitForURL(/\/batch\/.+/);
  await expect(page.locator('.rail')).toHaveCount(0);
  const twoPages = await PDFDocument.create();
  twoPages.addPage([595, 842]);
  twoPages.addPage([595, 842]);
  await page.locator('#replace-b').setInputFiles({
    name: 'uno-b.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await twoPages.save()),
  });
  await expect(page.locator('.pane:visible')).toHaveCount(2);
  await expect(page.locator('.mini')).toContainText('páginas');
  await page.getByRole('button', { name: 'Ajustar B' }).click();
  await page.locator('.fieldrow').first().click();
  await page.locator('#move-page').selectOption('2');
  await expect(page.getByText(/Página 2 de 2|2 \/ 2/).first()).toBeVisible();
  await expect(page.locator('.fieldrow__moved')).toContainText('p.1 → p.2');
});
