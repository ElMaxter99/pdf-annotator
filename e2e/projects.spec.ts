import { expect, Page, test } from '@playwright/test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

/**
 * The desktop bridge is faked in the page, but every call runs the REAL main-process code
 * (`desktop/projects-ipc.mjs` → `desktop/projects.mjs`) against a temporary folder.
 */
async function withDesktopProjects(page: Page) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-ud-'));
  const documents = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-docs-'));
  const root = path.join(documents, 'PDF Annotator');
  const { setupProjectsIpc } = await import('../desktop/projects-ipc.mjs');
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  /** Files the faked native dialogs answer with (the tests set them before clicking). */
  const picks = { save: '', open: '' };
  setupProjectsIpc({
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    app: {
      getPath: (name: string) => (name === 'documents' ? documents : userData),
      getVersion: () => '9.9.9',
    },
    dialog: {
      showOpenDialog: async () =>
        picks.open
          ? { canceled: false, filePaths: [picks.open] }
          : { canceled: true, filePaths: [] },
      showSaveDialog: async () =>
        picks.save ? { canceled: false, filePath: picks.save } : { canceled: true },
    },
    shell: { showItemInFolder: (file: string) => revealed.push(file) },
    getWindow: () => ({
      webContents: {
        send: (_channel: string, payload: unknown) => {
          void page
            .evaluate((p) => (window as any).__emitProgress?.(p), payload)
            .catch(() => undefined);
        },
      },
    }),
  });
  const revealed: string[] = [];
  const revive = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (Array.isArray(record['__u8'])) return Uint8Array.from(record['__u8'] as number[]);
      return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, revive(v)]));
    }
    return value;
  };
  await page.exposeFunction('__projectsCall', async (channel: string, payload: string) => {
    const handler = handlers.get(channel);
    const result = await handler?.(...(JSON.parse(payload, (_k, v) => v) as unknown[]).map(revive));
    return JSON.stringify(result ?? null);
  });
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, any>;
    const encode = (_k: string, v: unknown) =>
      v instanceof Uint8Array ? { __u8: Array.from(v) } : v;
    const decode = (_k: string, v: any) =>
      v && v.type === 'Buffer' && Array.isArray(v.data) ? Uint8Array.from(v.data) : v;
    const call = async (channel: string, ...args: unknown[]) =>
      JSON.parse(await w['__projectsCall'](channel, JSON.stringify(args, encode)), decode);
    w['desktop'] = {
      isDesktop: true,
      helperPort: 4310,
      projects: {
        info: () => call('projects:info'),
        chooseRoot: () => call('projects:choose-root'),
        list: () => call('projects:list'),
        create: (i: unknown) => call('projects:create', i),
        open: (i: unknown) => call('projects:open', i),
        saveItem: (i: unknown) => call('projects:save-item', i),
        removeItem: (i: unknown) => call('projects:remove-item', i),
        renew: (i: unknown) => call('projects:renew', i),
        release: (i: unknown) => call('projects:release', i),
        rename: (i: unknown) => call('projects:rename', i),
        forget: (i: unknown) => call('projects:forget', i),
        exportInfo: (i: unknown) => call('projects:export-info', i),
        exportProject: (i: unknown) => call('projects:export', i),
        reveal: () => call('projects:reveal'),
        importInspect: (i: unknown) => call('projects:import-inspect', i),
        importRun: (i: unknown) => call('projects:import-run', i),
        cancel: () => call('projects:cancel'),
        pathForFile: (file: File) => (window as any).__dropPaths?.[file.name] ?? '',
        onProgress: (cb: (p: unknown) => void) => {
          w['__emitProgress'] = cb;
          return () => {
            w['__emitProgress'] = undefined;
          };
        },
      },
      getUpdateState: async () => ({ status: 'idle', mode: 'manual', current: '1.13.0' }),
      onUpdateState: () => () => undefined,
    };
  });
  const projects = await import('../desktop/projects.mjs');
  return { root, picks, revealed, projects };
}

test.beforeEach(async ({ page }) => stubAnalytics(page));

test('the web has no Projects button', async ({ page }) => {
  await page.goto('/landing');
  await expect(page.getByTestId('landing-projects')).toHaveCount(0);
});

test('create a project, fill its batch on disk and keep it after a reload', async ({ page }) => {
  const { root } = await withDesktopProjects(page);
  await page.goto('/landing');
  await page.getByTestId('landing-projects').click();
  await expect(page.getByTestId('project-empty')).toBeVisible();

  await page.getByTestId('project-new').click();
  await page.getByTestId('project-name').fill('Cliente 1');
  await page.getByTestId('project-create').click();
  const card = page.getByTestId('project-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Cliente 1');
  expect(existsSync(path.join(root, 'Cliente 1', 'project.json'))).toBe(true);

  await page.getByTestId('project-open').click();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('project-crumb')).toContainText('Cliente 1');
  await page.getByTestId('input-pdfs').setInputFiles(EXAMPLE_PDF);
  await page.getByTestId('next-templates').click();
  await page.getByTestId('open-panel').click();
  await expect(page.getByTestId('panel-item')).toHaveCount(1);

  const batchDir = path.join(root, 'Cliente 1', 'batch');
  await expect
    .poll(() => (existsSync(batchDir) ? readdirSync(batchDir).sort().join(',') : ''))
    .toMatch(/\.a\.pdf/);
  expect(existsSync(path.join(root, 'Cliente 1', '.lock'))).toBe(true);

  await page.reload();
  await expect(page.getByTestId('panel-item')).toHaveCount(1);
  await expect(page.getByTestId('project-crumb')).toContainText('Cliente 1');

  await page.getByTestId('project-crumb').getByRole('link').click();
  await expect(page.getByTestId('project-card')).toContainText('1 PDFs');
});

test('a project open on another computer asks before it is taken over', async ({ page }) => {
  const { root } = await withDesktopProjects(page);
  const dir = path.join(root, 'Álvaro', 'cliente3');
  mkdirSync(path.join(dir, 'batch'), { recursive: true });
  writeFileSync(
    path.join(dir, 'project.json'),
    JSON.stringify({ v: 1, id: 'p3', name: 'Cliente 3', createdAt: 1, updatedAt: 2 }),
  );
  writeFileSync(
    path.join(dir, '.lock'),
    JSON.stringify({ host: 'PORTATIL-ALVARO', token: 'otro', since: Date.now(), seen: Date.now() }),
  );

  await page.goto('/proyectos');
  const card = page.getByTestId('project-card');
  await expect(card).toContainText('PORTATIL-ALVARO');
  await expect(card.getByTestId('project-open')).toHaveCount(0);

  await card.getByRole('button', { name: 'Tomar el control' }).click();
  await expect(page.getByRole('dialog')).toContainText('PORTATIL-ALVARO');
  await page.getByRole('dialog').getByRole('button', { name: 'Tomar el control' }).click();
  await page.waitForURL('**/lote');
  await expect(page.getByTestId('project-crumb')).toContainText('Cliente 3');
});

test('the projects folder missing shows an error with a way out', async ({ page }) => {
  await withDesktopProjects(page);
  await page.addInitScript(() => {
    const w = window as unknown as { desktop: { projects: Record<string, unknown> } };
    w.desktop.projects['list'] = async () => ({ error: 'root-missing' });
  });
  await page.goto('/proyectos');
  await expect(page.getByTestId('project-root-error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Elegir otra carpeta' })).toBeVisible();
});

/** A project with two PDFs written straight to the folder, as another run of the app would leave it. */
function seedProject(
  projects: typeof import('../desktop/projects.mjs'),
  root: string,
  name: string,
  sub: string,
  withB = true,
) {
  const { createProject, resolveRef, writeItem } = projects;
  mkdirSync(root, { recursive: true });
  const created = createProject(root, name, sub);
  const { dir } = resolveRef(root, created.ref);
  const pdf = readFileSync(EXAMPLE_PDF);
  writeItem(
    dir,
    'a1',
    { name: 'uno.pdf', status: 'ready' },
    { a: pdf, b: withB ? pdf : undefined },
  );
  writeItem(dir, 'a2', { name: 'dos.pdf', status: 'review' }, { a: pdf });
  return { dir, ref: created.ref };
}

test('export a project from its menu, then import the file as a copy and as a replacement', async ({
  page,
}) => {
  const { root, picks, revealed, projects } = await withDesktopProjects(page);
  const { dir } = seedProject(projects, root, 'Cliente 1', 'Álvaro/cliente1');
  const out = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-out-'));
  const file = path.join(out, 'Cliente 1.pdfannotator');

  await page.goto('/proyectos');
  const card = page.getByTestId('project-card');
  await card.getByTestId('project-menu').click();
  await card.getByTestId('project-export').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Exportar «Cliente 1»');
  await expect(dialog).toContainText('Antes de compartir');
  await page.getByTestId('export-include-b').uncheck();
  await expect(page.getByTestId('export-include-b')).not.toBeChecked();
  await page.getByTestId('export-include-b').check();

  picks.save = file;
  await page.getByTestId('export-choose').click();
  const notice = page.getByTestId('transfer-notice');
  await expect(notice).toContainText('Cliente 1.pdfannotator');
  expect(readFileSync(file).subarray(0, 2).toString()).toBe('PK');
  await notice.getByTestId('transfer-reveal').click();
  await expect.poll(() => revealed).toEqual([file]);

  // Import: the project already exists, so it asks; a copy leaves the original alone.
  picks.open = file;
  await page.getByTestId('project-import').click();
  await expect(page.getByTestId('import-file')).toContainText('Cliente 1.pdfannotator');
  await expect(page.getByRole('dialog')).toContainText('Archivo revisado');
  await expect(page.getByTestId('import-sub')).toHaveValue('Álvaro/cliente1');
  await page.getByTestId('import-confirm').click();
  await expect(page.getByRole('dialog')).toContainText('Ya existe un proyecto con ese nombre');
  await page.getByTestId('conflict-continue').click();
  await expect(page.getByTestId('transfer-notice')).toContainText('Cliente 1 (2)');
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  expect(existsSync(path.join(root, 'Álvaro', 'cliente1-2', 'project.json'))).toBe(true);

  // Replace: asks again, names what would be lost, and keeps a safety copy.
  writeFileSync(path.join(dir, 'batch', 'extra.json'), JSON.stringify({ name: 'solo-aqui.pdf' }));
  writeFileSync(path.join(dir, 'batch', 'extra.a.pdf'), readFileSync(EXAMPLE_PDF));
  await page.getByTestId('project-import').click();
  await page.getByTestId('import-confirm').click();
  await page.getByTestId('conflict-replace').check();
  await page.getByTestId('conflict-continue').click();
  await expect(page.getByRole('dialog')).toContainText('¿Reemplazar «Cliente 1»?');
  await expect(page.getByRole('dialog')).toContainText('1 PDFs que solo están en tu proyecto');
  await page.getByTestId('replace-confirm').click();
  await expect(page.getByTestId('transfer-notice')).toContainText('importado');
  expect(existsSync(path.join(root, 'Álvaro', 'cliente1-antes-de-importar', 'project.json'))).toBe(
    true,
  );
  expect(existsSync(path.join(dir, 'batch', 'extra.json'))).toBe(false);
  expect(readdirSync(root).filter((name) => name.startsWith('.import'))).toEqual([]);
});

test('dropping a file that is not a project explains why, and an empty project cannot be exported', async ({
  page,
}) => {
  const { root, projects } = await withDesktopProjects(page);
  mkdirSync(root, { recursive: true });
  const created = projects.createProject(root, 'Vacío', '');
  expect(created.pdfs).toBe(0);
  const fake = path.join(mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-drop-')), 'factura.pdf');
  writeFileSync(fake, readFileSync(EXAMPLE_PDF));

  await page.addInitScript((target) => {
    (window as any).__dropPaths = { 'factura.pdf': target };
  }, fake);
  await page.goto('/proyectos');
  await page.getByTestId('project-card').getByTestId('project-menu').click();
  await page.getByTestId('project-export').click();
  await expect(page.getByRole('dialog')).toContainText('Nada que exportar');
  await page.getByRole('button', { name: 'Cerrar' }).click();

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(['x'], 'factura.pdf', { type: 'application/pdf' }));
    document
      .querySelector('.app--projects')!
      .dispatchEvent(
        new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
      );
  });
  await expect(page.getByTestId('import-error')).toContainText(
    '«factura.pdf» no es un archivo de proyecto',
  );
  expect(readdirSync(root).sort()).toEqual(['Vacío']);
});
