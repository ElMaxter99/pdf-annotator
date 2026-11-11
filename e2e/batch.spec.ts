import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { EXAMPLE_JSON, EXAMPLE_PDF, stubAnalytics } from './helpers';

const pdf = readFileSync(EXAMPLE_PDF);
const json = readFileSync(EXAMPLE_JSON);
const FIELDS = JSON.parse(json.toString()).pages[0].fields.length as number;

const file = (name: string, buffer: Buffer, mimeType: string) => ({ name, mimeType, buffer });

/** Drops two PDFs on the landing: several documents start the batch steps. */
async function startSteps(page: Page) {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('factura-0331.pdf', pdf, 'application/pdf'),
      file('factura-0332.pdf', pdf, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await expect(page.getByRole('heading', { name: '1 · Subir los PDF' })).toBeVisible();
}

/** Goes through the two steps with one template and opens the panel. */
async function openPanel(page: Page) {
  await startSteps(page);
  await page.getByTestId('next-templates').click();
  await page
    .getByTestId('input-templates')
    .setInputFiles(file('factura-0331.json', json, 'application/json'));
  await expect(page.getByTestId('template-rows')).toContainText(`${FIELDS} campos`);
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
}

/** Waits until the batch is really written to IndexedDB (the write is asynchronous). */
async function waitForSavedBatch(page: Page, count: number) {
  await expect
    .poll(() =>
      page.evaluate(
        (name) =>
          new Promise<number>((resolve) => {
            const request = indexedDB.open(name);
            request.onerror = () => resolve(-1);
            request.onsuccess = () => {
              const db = request.result;
              if (!db.objectStoreNames.contains('items')) {
                db.close();
                resolve(0);
                return;
              }
              const query = db.transaction('items').objectStore('items').count();
              query.onsuccess = () => {
                db.close();
                resolve(query.result);
              };
              query.onerror = () => {
                db.close();
                resolve(-1);
              };
            };
          }),
        'pdf-annotator-batch',
      ),
    )
    .toBe(count);
}

/** Opens the first PDF of the panel (the one with a template) in the editor. */
async function openFirst(page: Page, expectB = false) {
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('panel-item')
    .filter({ hasText: 'factura-0331' })
    .getByRole('button', { name: 'Revisar' })
    .click();
  await page.waitForURL('**/workspace');
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  if (expectB) {
    await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
  }
}

async function attachVersion2(page: Page) {
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', pdf, 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
}

async function openRow(page: Page) {
  await openFirst(page, true);
}

test('one PDF on the landing opens the traditional editor', async ({ page }) => {
  await stubAnalytics(page);
  await page.goto('/landing');
  await page
    .locator('input[type=file]')
    .setInputFiles(file('factura-0331.pdf', pdf, 'application/pdf'));
  await page.waitForURL('**/workspace');
  await expect(page.locator('.migration-bar')).toHaveCount(0);
});

test('the real first page is shown as a thumbnail in the steps and in the panel', async ({
  page,
}) => {
  await startSteps(page);
  await expect(page.locator('[data-testid="draft-pdfs"] app-pdf-thumb img')).toHaveCount(2);
  await page.getByTestId('next-templates').click();
  await page.getByTestId('open-panel').click();
  await expect(page.locator('[data-testid="panel-item"] app-pdf-thumb img')).toHaveCount(2);
});

test('several PDFs go through the steps and end in the panel (grid and list)', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('panel-grid')).toBeVisible();
  await page.getByTestId('view-list').click();
  await expect(page.getByTestId('panel-list')).toBeVisible();
  await expect(page.locator('.batch-bar__count')).toHaveText('0 de 2 listos');
  await page.getByRole('button', { name: /Sin plantilla/ }).click();
  await expect(page.getByTestId('panel-item')).toHaveCount(1);
});

test('a PDF without a new version is edited with its own template and marked ready', async ({
  page,
}) => {
  await openPanel(page);
  await openFirst(page);
  await expect(page.locator('.migration-bar')).toContainText('Editando con su plantilla');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await expect(page.getByTestId('batch-position')).toHaveText('1 de 2');

  await page.getByTestId('batch-next').click();
  await expect(page.getByTestId('batch-position')).toHaveText('2 de 2');
  await expect(page.locator('.annotation')).toHaveCount(0);
  await page.getByTestId('batch-prev').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page.getByTestId('mark-ready').click();
  await page.waitForURL('**/lote');
  await expect(page.locator('.batch-bar__count')).toHaveText('1 de 2 listos');
});

test('a saved batch is offered on the landing', async ({ page }) => {
  await openPanel(page);
  await waitForSavedBatch(page, 2);
  await page.goto('/landing');
  await expect(page.getByTestId('resume-batch')).toBeVisible();
  await page.getByTestId('resume-batch').getByRole('button', { name: 'Continuar el lote' }).click();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
});

test('new versions (B) are paired by name and shown in the list', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('versions-drop')).toBeVisible();
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', pdf, 'application/pdf'));
  await expect(
    page.getByTestId('panel-item').filter({ hasText: 'factura-0331' }).first(),
  ).toContainText('factura-0331-nuevo.pdf');
});

test('B starts empty, A can be put in and the PDF is marked ready and downloaded', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await attachVersion2(page);
  await openRow(page);

  await expect(page.getByTestId('mark-ready')).toContainText(`faltan ${FIELDS}`);
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(FIELDS);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await expect(page.getByTestId('mark-ready')).toBeEnabled();

  // A single undo step takes the template back out.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(FIELDS);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page.getByTestId('mark-ready').click();
  await expect(page.getByRole('dialog')).toContainText('factura-0331-nuevo.pdf');
  await page.getByTestId('confirm-ready').click();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('panel-list')).toContainText('Listo');
  await expect(page.locator('.batch-bar__count')).toHaveText('1 de 2 listos');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('download-ready').click(),
  ]);
  expect(download.suggestedFilename()).toBe('factura-0331-nuevo.json');
  const content = JSON.parse(readFileSync((await download.path()) as string, 'utf8'));
  expect(content.pages[0].fields).toHaveLength(FIELDS);
});

test('missing fields are counted on «Listo» until each one is placed or dismissed', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await attachVersion2(page);
  await openRow(page);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  // Remove one annotation from B: it reappears as «Falta en B».
  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(1);
  await expect(page.getByTestId('mark-ready')).toContainText('faltan 1');
  await expect(page.locator('.reference-field--missing')).toHaveCount(1);

  await page.getByTestId('place-missing').click();
  await expect(page.locator('.migration-row[data-status="missing"]')).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('Delete');
  await page.getByTestId('dismiss-missing').click();
  await expect(page.getByTestId('mark-ready')).toBeEnabled();
  await expect(page.locator('.migration-dismissed')).toContainText('Descartados de A (1)');
});

test('a moved field is reported and A can be seen alone by holding the A key', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await attachVersion2(page);
  await openRow(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();

  await page
    .locator('.annotation')
    .first()
    .click({ modifiers: ['Shift'] });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.migration-row[data-status="moved"]')).toHaveCount(1);
  await expect(page.locator('.reference-field')).toHaveCount(1);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.down('a');
  await expect(page.locator('.canvas-container--reference-only')).toHaveCount(1);
  await expect(page.locator('.reference-field--solo')).toHaveCount(FIELDS);
  await page.keyboard.up('a');
  await expect(page.locator('.canvas-container--reference-only')).toHaveCount(0);
});

test('the batch and B survive a reload of the tray', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await attachVersion2(page);
  await openRow(page);
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await page.waitForTimeout(600); // autosave debounce
  await page.getByTestId('back-to-batch').click();
  await page.waitForURL('**/lote');

  await page.reload();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
  await openRow(page);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
});

test('an unpaired new version waits in the strip and is assigned by hand or discarded', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles([
      file('otro-documento.pdf', pdf, 'application/pdf'),
      file('copia.pdf', pdf, 'application/pdf'),
    ]);
  await expect(page.getByTestId('versions-drop')).toContainText('Archivos sin pareja: 2');
  await page
    .getByTestId('unpaired-b')
    .locator('li')
    .first()
    .getByTestId('assign-unpaired')
    .selectOption({ index: 1 });
  await expect(page.getByTestId('panel-list')).toContainText('otro-documento.pdf');
  await expect(page.getByTestId('versions-drop')).toContainText('Archivos sin pareja: 1');
  await page.getByTestId('unpaired-b').getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByTestId('unpaired-b')).toHaveCount(0);
  await expect(page.getByTestId('versions-drop')).toContainText('Versiones B añadidas: 1');
  // A B can still be assigned from its row, whatever its name.
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('row-upload-b').first().click();
  await (await chooser).setFiles(file('cualquier-nombre.pdf', pdf, 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('cualquier-nombre.pdf');
});

test('there is no third step: the panel opens from step 2 with the B strip always there', async ({
  page,
}) => {
  await startSteps(page);
  await expect(page.locator('.batch-steps li')).toHaveCount(2);
  await page.getByTestId('next-templates').click();
  await expect(page.getByTestId('draft-summary')).toContainText('2');
  await expect(page.getByText('Tengo nuevas versiones (B)')).toHaveCount(0);
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
  await expect(page.getByTestId('versions-drop')).toContainText('Versiones nuevas (B)');
});

test('templates pasted from Mongo are matched to the PDFs by pdfName', async ({ page }) => {
  await startSteps(page);
  await page.getByTestId('next-templates').click();
  await page.getByTestId('tab-paste').click();
  const pages = JSON.stringify(JSON.parse(json.toString()).pages);
  const text = `[
    { _id: ObjectId("65f1c0aa"), pdfName: 'factura-0331.pdf', type: 'T_A', fontSize: 10, pages: ${pages} },
    { _id: { $oid: "65f1c0ab" }, pdfName: 'otro.pdf', pages: ${pages} }
  ]`;
  await page.getByTestId('paste-text').fill(text);
  await page.getByTestId('paste-match').click();
  await expect(page.getByTestId('paste-found')).toContainText('2 plantillas');
  await expect(page.getByTestId('template-rows')).toContainText(`${FIELDS} campos`);

  // The leftover template is assigned by hand to the other PDF.
  await page.getByTestId('assign-pasted').selectOption({ label: 'otro.pdf' });
  await expect(page.getByTestId('template-rows')).toContainText('otro.pdf');

  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
  await expect(page.getByRole('button', { name: /Sin plantilla/ })).toContainText('0');
});

test('pasted JSON with a syntax error points to the line and does not block', async ({ page }) => {
  await startSteps(page);
  await page.getByTestId('next-templates').click();
  await page.getByTestId('tab-paste').click();
  await page.getByTestId('paste-text').fill('[\n  { "pdfName": "a.pdf" "pages": [] }\n]');
  await page.getByTestId('paste-match').click();
  await expect(page.getByTestId('paste-error')).toContainText('línea 2');
  await expect(page.getByTestId('open-panel')).toBeEnabled();
});

test('in a batch «Documento» has no «empezar de cero» and completes the PDF with layers', async ({
  page,
}) => {
  await openPanel(page);
  await openFirst(page);
  await page.getByTestId('batch-next').click(); // factura-0332: no template, no new version
  await expect(page.locator('.annotation')).toHaveCount(0);

  // «Anotaciones» points to «Documento» while there is no template
  await expect(page.getByTestId('no-template-note')).toBeVisible();
  await page.getByTestId('no-template-note').getByRole('button').click();

  await expect(page.getByTestId('batch-document')).toBeVisible();
  await expect(page.getByText('¿Quieres empezar de cero?')).toHaveCount(0);
  await expect(page.getByTestId('doc-layer-a')).toContainText('Sin plantilla');
  await expect(page.getByTestId('doc-layer-b')).toContainText('Sin versión nueva');

  // Template A pasted from text: loaded into the editor
  await page.getByTestId('doc-a-paste').click();
  await page
    .getByTestId('doc-a-text')
    .fill(
      '{ "pages": [ { "num": 1, "fields": [ { "type": "text", "x": 100, "y": 700, "mapField": "a.b" } ] } ] }',
    );
  await page.getByTestId('doc-a-apply').click();
  await expect(page.getByTestId('doc-layer-a')).toContainText('1 campos');
  await expect(page.locator('.annotation')).toHaveCount(1);

  // Wrong JSON shows an error and keeps the template
  await page.getByTestId('doc-a-paste').click();
  await page.getByTestId('doc-a-text').fill('{ no es json');
  await page.getByTestId('doc-a-apply').click();
  await expect(page.getByTestId('doc-a-error')).toBeVisible();
  await page.getByTestId('doc-a-paste').click();

  // New version B: annotations stay as template A, B starts empty
  await page
    .getByTestId('doc-b-input')
    .setInputFiles(file('factura-0332-nuevo.pdf', pdf, 'application/pdf'));
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
  await expect(page.getByTestId('doc-layer-b')).toContainText('factura-0332-nuevo.pdf');
  await expect(page.locator('.annotation')).toHaveCount(0);

  // Removing B asks first and goes back to the original with its template
  await page.getByTestId('doc-b-remove').click();
  await expect(page.getByTestId('doc-b-remove-confirm')).toBeVisible();
  await page.getByTestId('doc-b-remove-yes').click();
  await expect(page.locator('.migration-bar')).toContainText('Editando con su plantilla');
  await expect(page.locator('.annotation')).toHaveCount(1);

  // Replacing the PDF asks first and keeps the annotations
  await page
    .getByTestId('doc-replace-input')
    .setInputFiles(file('otro.pdf', pdf, 'application/pdf'));
  await expect(page.getByTestId('doc-replace-confirm')).toBeVisible();
  await page.getByTestId('doc-replace-yes').click();
  await expect(page.getByTestId('batch-document')).toContainText('otro.pdf');
  await expect(page.locator('.annotation')).toHaveCount(1);
});

test('without template A the modes still compare the PDFs; JSON without fields is refused', async ({
  page,
}) => {
  await openPanel(page);
  await openFirst(page);
  await page.getByTestId('batch-next').click();
  await expect(page.getByTestId('batch-position')).toHaveText('2 de 2');
  await expect(page.locator('.annotation')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Documento' }).click();
  await page.getByTestId('doc-b-input').setInputFiles(file('x-nuevo.pdf', pdf, 'application/pdf'));
  await expect(page.locator('.migration-bar')).toContainText('Editando versión B');
  await expect(page.getByTestId('no-template-a')).toBeVisible();
  await expect(page.getByTestId('mode-split')).toBeEnabled();
  await expect(page.getByTestId('put-template-a')).toBeDisabled();
  // A has no fields, but its PDF is still shown on the left of «Dividida».
  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a')).toBeVisible();
  await expect(page.getByTestId('split-a').locator('.reference-field')).toHaveCount(0);
  await expect(page.getByTestId('split-a').locator('canvas')).toHaveJSProperty(
    'width',
    await page.locator('.canvas--pdf').evaluate((el: HTMLCanvasElement) => el.width),
  );
  await page.getByTestId('mode-overlay').click();
  // «Alternar» switches the page between the PDF of B and the PDF of A.
  await page.getByTestId('mode-toggle').click();
  await expect(page.locator('.reference-pdf')).toHaveCount(0);
  await page.getByTestId('toggle-a').click();
  await expect(page.locator('.reference-pdf')).toHaveCount(1);
  await page.getByTestId('toggle-b').click();
  await expect(page.locator('.reference-pdf')).toHaveCount(0);
  await page.getByTestId('mode-overlay').click();
  // Holding «A» swaps the page for A's PDF.
  await page.keyboard.down('a');
  await expect(page.locator('.reference-pdf')).toHaveCount(1);
  await page.keyboard.up('a');
  await expect(page.locator('.reference-pdf')).toHaveCount(0);

  await page.getByTestId('doc-a-paste').click();
  await page.getByTestId('doc-a-text').fill('{ "pages": [ { "num": 1, "fields": [] } ] }');
  await page.getByTestId('doc-a-apply').click();
  await expect(page.getByTestId('doc-a-error')).toBeVisible();
  await expect(page.getByTestId('doc-layer-a')).toContainText('Sin plantilla');
});

test('«Dividida» shows A with its fields on the left and B on the right', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await attachVersion2(page);
  await openRow(page);

  await page.getByTestId('mode-split').click();
  await expect(page.getByTestId('split-a')).toBeVisible();
  await expect(page.locator('.canvas--pdf')).toBeVisible();
  await expect(page.getByTestId('split-a').locator('.reference-field')).toHaveCount(FIELDS);
  await expect(page.getByTestId('split-a').locator('canvas')).toHaveJSProperty(
    'width',
    await page.locator('.canvas--pdf').evaluate((el: HTMLCanvasElement) => el.width),
  );

  // B is edited on the right: put A in and B gets the fields
  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-copy').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  await expect(page.getByTestId('split-a').locator('.reference-field')).toHaveCount(FIELDS);

  // The pointer on a field of B lights its pair in A (and the other way round)
  await page.locator('.annotation').first().hover();
  await expect(page.getByTestId('split-a').locator('.reference-field--pair')).toHaveCount(1);
  const box = await page.getByTestId('split-a').locator('.reference-field').nth(2).boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.locator('.annotation--pair')).toHaveCount(1);

  await page.getByTestId('mode-overlay').click();
  await expect(page.getByTestId('split-a')).toHaveCount(0);
});

test('A and B with a different number of pages say so in the bar', async ({ page }) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  const twoPages = await PDFDocument.create();
  twoPages.addPage([595, 842]);
  twoPages.addPage([595, 842]);
  await page
    .getByTestId('input-b')
    .setInputFiles(
      file('factura-0331-nuevo.pdf', Buffer.from(await twoPages.save()), 'application/pdf'),
    );
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await openRow(page);
  await expect(page.getByTestId('pages-differ')).toContainText('B 1 de 2 · A 1 de 1');
});

test('a new batch starts from zero: the saved one is not added to it', async ({ page }) => {
  await openPanel(page);
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
  await waitForSavedBatch(page, 2);
  await page.goto('/landing');
  await expect(page.getByTestId('resume-batch')).toBeVisible();
  // Without choosing «Continuar», two new PDFs start a new batch.
  await page
    .locator('input[type=file]')
    .setInputFiles([
      file('nuevo-a.pdf', pdf, 'application/pdf'),
      file('nuevo-b.pdf', pdf, 'application/pdf'),
    ]);
  await page.waitForURL('**/lote');
  await page.getByTestId('next-templates').click();
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
  await expect(page.getByTestId('panel-grid')).not.toContainText('factura-0331');
  await page.reload();
  await expect(page.getByTestId('panel-item')).toHaveCount(2);
});

/** The example invoice drawn 20 pt to the right and 30 pt lower: its texts keep their words but move. */
async function shiftedPdf(dx: number, dy: number): Promise<Buffer> {
  const source = await PDFDocument.load(pdf);
  const out = await PDFDocument.create();
  const [embedded] = await out.embedPdf(source, [0]);
  const { width, height } = embedded;
  const sheet = out.addPage([width, height]);
  sheet.drawPage(embedded, { x: dx, y: dy });
  return Buffer.from(await out.save());
}

test('«Copiar y ajustar por textos» proposes the shift, is reviewed and applied in one undo step', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  await page
    .getByTestId('input-b')
    .setInputFiles(file('factura-0331-nuevo.pdf', await shiftedPdf(20, -30), 'application/pdf'));
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await openRow(page);

  await page.getByTestId('put-template-a').click();
  await expect(page.getByTestId('put-a-adjust')).toBeEnabled();
  await page.getByTestId('put-a-adjust').click();

  const review = page.getByTestId('adjust-review');
  await expect(review.getByTestId('adjust-apply')).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('split-a')).toBeVisible();
  // B is not touched until the proposal is applied
  await expect(page.locator('.annotation')).toHaveCount(0);
  await expect(review.getByTestId('adjust-fields')).toContainText('→ 20 pt');
  await expect(review.getByTestId('adjust-fields')).toContainText('↓ 30 pt');

  // Cancel leaves B as it was
  await review.getByTestId('adjust-cancel').click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(0);

  await page.getByTestId('put-template-a').click();
  await page.getByTestId('put-a-adjust').click();
  await review.getByTestId('adjust-tab-texts').click();
  await expect(review.getByTestId('adjust-anchors').locator('li').first()).toBeVisible();
  await review.getByTestId('adjust-apply').click();
  await expect(review).toHaveCount(0);
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);

  // One undo step takes everything back out
  await page.keyboard.press('Control+z');
  await expect(page.locator('.annotation')).toHaveCount(0);
});

test('A and B of different size: the notice lets you fit the coordinates of A to B or not', async ({
  page,
}) => {
  await openPanel(page);
  await page.getByTestId('view-list').click();
  const landscape = await PDFDocument.create();
  landscape.addPage([842, 595]);
  await page
    .getByTestId('input-b')
    .setInputFiles(
      file('factura-0331-nuevo.pdf', Buffer.from(await landscape.save()), 'application/pdf'),
    );
  await expect(page.getByTestId('panel-list')).toContainText('factura-0331-nuevo.pdf');
  await openRow(page);

  // Asks first, in any mode
  await expect(page.getByTestId('fit-ask')).toContainText('595 × 842');
  await expect(page.getByTestId('fit-ask')).toContainText('842 × 595');

  // Leave them: A is shown as it is, and it can be fitted later
  await page.getByTestId('fit-no').click();
  await expect(page.getByTestId('fit-off')).toBeVisible();
  await page.getByTestId('put-template-a').click();
  await expect(page.getByTestId('put-a-fit').locator('input')).not.toBeChecked();
  await page.getByTestId('put-a-copy').click();
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  const plain = await page
    .locator('.annotation')
    .first()
    .evaluate((el: HTMLElement) => el.style.left);

  // Fit: the copy lands scaled in one history step, and the choice is remembered
  await page.getByTestId('fit-apply').click();
  await expect(page.getByTestId('fit-on')).toContainText('×1.42');
  await page.getByTestId('put-template-a').click();
  await expect(page.getByTestId('put-a-fit').locator('input')).toBeChecked();
  await page.getByTestId('put-a-copy').click();
  await page.getByTestId('put-a-confirm').click();
  await expect(page.locator('.toast')).toContainText('ajustados al tamaño de B');
  await expect(page.locator('.annotation')).toHaveCount(FIELDS);
  const fitted = await page
    .locator('.annotation')
    .first()
    .evaluate((el: HTMLElement) => el.style.left);
  expect(parseFloat(fitted)).toBeGreaterThan(parseFloat(plain) * 1.2);

  await page.getByTestId('fit-remove').click();
  await expect(page.getByTestId('fit-off')).toBeVisible();
});
