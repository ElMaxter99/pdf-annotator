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
async function withDesktopProjects(page: Page, { secureStore = true } = {}) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-ud-'));
  const documents = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-docs-'));
  const root = path.join(documents, 'PDF Annotator');
  const revealed: string[] = [];
  const opened: string[] = [];
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
    shell: {
      showItemInFolder: (file: string) => revealed.push(file),
      openPath: async (dir: string) => {
        opened.push(dir);
        return '';
      },
    },
    safeStorage: {
      isEncryptionAvailable: () => secureStore,
      getSelectedStorageBackend: () => (secureStore ? 'gnome_libsecret' : 'basic_text'),
      encryptString: (text: string) => Buffer.from(`ENC:${Buffer.from(text).toString('base64')}`),
      decryptString: (buf: Buffer) =>
        Buffer.from(buf.toString().slice(4), 'base64').toString('utf8'),
    },
    getWindow: () => ({
      webContents: {
        send: (channel: string, payload: unknown) => {
          void page
            .evaluate(
              ([c, p]) =>
                c === 'projects:sync-event'
                  ? (window as any).__emitSync?.(p)
                  : (window as any).__emitProgress?.(p),
              [channel, payload] as const,
            )
            .catch(() => undefined);
        },
      },
    }),
  });
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
        revealFolder: (i: unknown) => call('projects:reveal-folder', i),
        importTarget: (i: unknown) => call('projects:import-target', i),
        exportInfo: (i: unknown) => call('projects:export-info', i),
        exportProject: (i: unknown) => call('projects:export', i),
        reveal: () => call('projects:reveal'),
        importInspect: (i: unknown) => call('projects:import-inspect', i),
        importRun: (i: unknown) => call('projects:import-run', i),
        cancel: () => call('projects:cancel'),
        syncStatus: (i: unknown) => call('sync:status', i),
        syncChoose: () => call('sync:choose'),
        syncLink: (i: unknown) => call('sync:link', i),
        syncUnlink: () => call('sync:unlink'),
        syncAll: (i: unknown) => call('sync:all', i),
        syncProject: (i: unknown) => call('sync:project', i),
        syncReveal: (i: unknown) => call('sync:reveal', i),
        syncSftpChooseKey: () => call('sync:sftp-choose-key'),
        syncSftpInspect: (i: unknown) => call('sync:sftp-inspect', i),
        syncSftpTrust: (i: unknown) => call('sync:sftp-trust', i),
        syncSftpTest: (i: unknown) => call('sync:sftp-test', i),
        syncSftpCredential: (i: unknown) => call('sync:sftp-credential', i),
        syncSftpForget: () => call('sync:sftp-forget'),
        onSyncEvent: (cb: (p: unknown) => void) => {
          w['__emitSync'] = cb;
          return () => {
            w['__emitSync'] = undefined;
          };
        },
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
  return { root, picks, revealed, opened, projects, userData };
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

test('rename a project and its folder from the menu; the checks guard the dialog', async ({
  page,
}) => {
  const { root } = await withDesktopProjects(page);
  const make = (ref: string, name: string, lock?: object) => {
    const dir = path.join(root, ...ref.split('/'));
    mkdirSync(path.join(dir, 'batch'), { recursive: true });
    writeFileSync(
      path.join(dir, 'project.json'),
      JSON.stringify({ v: 1, id: ref, name, createdAt: 1, updatedAt: 2 }),
    );
    if (lock) writeFileSync(path.join(dir, '.lock'), JSON.stringify(lock));
  };
  make('Álvaro/Cliente 2', 'Cliente 2');
  make('Álvaro/Cliente 3', 'Cliente 3');
  make('Álvaro/cliente4', 'Cliente 4 · Maquetas', {
    host: 'PORTATIL-ALVARO',
    token: 'otro',
    since: Date.now(),
    seen: Date.now(),
  });

  await page.goto('/proyectos');
  const card = page.getByTestId('project-card').filter({ hasText: 'Cliente 2' });
  await card.getByTestId('project-menu').click();
  await card.getByTestId('project-rename').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('rename-folder')).toBeChecked();
  await expect(dialog.getByTestId('rename-confirm')).toBeDisabled();

  await dialog.getByTestId('rename-name').fill('Cliente 3');
  await expect(dialog).toContainText('ya hay una carpeta');
  await expect(dialog.getByTestId('rename-confirm')).toBeDisabled();

  await dialog.getByTestId('rename-name').fill('CON');
  await expect(dialog.getByTestId('rename-preview')).toContainText('_CON');
  await dialog.getByTestId('rename-name').fill('Facturas 2027');
  await expect(dialog.getByTestId('rename-preview')).toContainText('Álvaro/Facturas 2027');
  await dialog.getByTestId('rename-confirm').click();
  await expect(dialog).toHaveCount(0);

  expect(existsSync(path.join(root, 'Álvaro', 'Facturas 2027', 'project.json'))).toBe(true);
  expect(existsSync(path.join(root, 'Álvaro', 'Cliente 2'))).toBe(false);
  expect(existsSync(path.join(root, 'Álvaro', 'Facturas 2027', '.lock'))).toBe(false);
  await expect(page.getByTestId('project-card').first()).toContainText('Facturas 2027');

  // Un proyecto abierto en otro equipo no se puede renombrar.
  const locked = page.getByTestId('project-card').filter({ hasText: 'Cliente 4' });
  await locked.getByTestId('project-menu').click();
  await expect(locked.getByTestId('project-rename')).toBeDisabled();
  await page.keyboard.press('Escape');

  // Solo el nombre visible: la carpeta se queda cuando la casilla está desmarcada.
  const other = page.getByTestId('project-card').filter({ hasText: 'Cliente 3' });
  await other.getByTestId('project-menu').click();
  await other.getByTestId('project-rename').click();
  await dialog.getByTestId('rename-folder').uncheck();
  await dialog.getByTestId('rename-name').fill('Contratos');
  await dialog.getByTestId('rename-confirm').click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'Contratos' })).toHaveCount(1);
  expect(existsSync(path.join(root, 'Álvaro', 'Cliente 3', 'project.json'))).toBe(true);
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

test('sync with a linked folder: link, upload, download from another computer, conflict', async ({
  page,
}) => {
  const { root, picks, projects } = await withDesktopProjects(page);
  const sync = await import('../desktop/project-sync.mjs');
  const { localProvider } = await import('../desktop/sync-provider.mjs');
  const cloud = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-cloud-'));
  const otherRoot = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-other-'));
  const other = { host: 'PORTATIL-ALVARO', token: 'otro' };
  const mine = seedProject(projects, root, 'Cliente 1', 'c1', false);
  picks.open = cloud;

  await page.goto('/proyectos');
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  await expect(page.getByTestId('sync-chip')).toHaveCount(0);

  // Link: the folder is checked, the warning must be accepted, then the plan is asked.
  await page.getByTestId('sync-link').click();
  await page.getByTestId('sync-choose').click();
  await expect(page.getByTestId('sync-checked')).toBeVisible();
  await expect(page.getByTestId('sync-link-confirm')).toBeDisabled();
  await page.getByTestId('sync-accept').check();
  await page.getByTestId('sync-link-confirm').click();
  await expect(page.getByTestId('plan-both')).toBeChecked();
  await page.getByTestId('plan-go').click();
  await expect(page.getByTestId('sync-chip')).toContainText('Sincronizado');
  expect(existsSync(path.join(cloud, 'c1', '.sync', 'rev.json'))).toBe(true);
  await expect(page.getByTestId('sync-footer')).toContainText(cloud);

  // Another computer uploads a new project: it shows up as available and can be downloaded.
  const theirs = seedProject(projects, otherRoot, 'Cliente 2', 'c2', false);
  await sync.syncProject(localProvider(cloud), otherRoot, theirs.ref, other);
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('sync-available-row')).toHaveCount(1);
  await page.getByTestId('sync-download-available').click();
  await expect(page.getByTestId('project-card')).toHaveCount(2);
  await expect(page.getByTestId('sync-available')).toHaveCount(0);
  expect(existsSync(path.join(root, 'c2', 'batch', 'a1.a.pdf'))).toBe(true);

  // A local change waits to be uploaded; the menu and the card button upload it.
  await new Promise((resolve) => setTimeout(resolve, 20));
  projects.writeItem(
    mine.dir,
    'a3',
    { name: 'tres.pdf', status: 'ready' },
    { a: readFileSync(EXAMPLE_PDF) },
  );
  await page.getByTestId('sync-now').click();
  await expect(page.getByTestId('project-card').first()).toContainText('Sincronizado');

  await expect
    .poll(() => JSON.parse(readFileSync(path.join(cloud, 'c1', '.sync', 'rev.json'), 'utf8')).rev)
    .toBe(2);

  // Both computers change the same project: nothing is overwritten until the person decides.
  const base = path.join(otherRoot, 'c1');
  await sync.syncProject(localProvider(cloud), otherRoot, 'c1', other);
  await new Promise((resolve) => setTimeout(resolve, 20));
  projects.writeItem(
    base,
    'a1',
    { name: 'uno.pdf', status: 'ready' },
    { a: readFileSync(EXAMPLE_PDF) },
  );
  await sync.syncProject(localProvider(cloud), otherRoot, 'c1', other);
  projects.writeItem(
    mine.dir,
    'a2',
    { name: 'dos-local.pdf', status: 'ready' },
    { a: readFileSync(EXAMPLE_PDF) },
  );
  await page.getByTestId('sync-now').click();
  await expect(page.locator('[data-testid=sync-chip]', { hasText: 'Conflicto' })).toBeVisible();
  await page.getByTestId('sync-resolve').click();
  await expect(page.getByTestId('sconf-theirs')).toBeChecked();
  await page.getByTestId('sconf-continue').click();
  await expect(page.getByTestId('project-card')).toHaveCount(3);
  expect(readdirSync(root).some((name) => name.startsWith('c1-conflicto-'))).toBe(true);
  expect(readFileSync(path.join(mine.dir, 'batch', 'a2.json'), 'utf8')).toContain('"dos.pdf"');

  // Renombrar un proyecto sincronizado: cambia el nombre visible, la carpeta (la clave de la sincronización) no.
  const synced = page.getByTestId('project-card').filter({ hasText: 'Cliente 2' }).first();
  await synced.getByTestId('project-menu').click();
  await synced.getByTestId('project-rename').click();
  await expect(page.getByTestId('rename-folder')).toBeDisabled();
  await page.getByTestId('rename-name').fill('Cliente 2 · Maquetas');
  await page.getByTestId('rename-confirm').click();
  await expect(page.getByTestId('project-card').filter({ hasText: 'Maquetas' })).toHaveCount(1);
  expect(existsSync(path.join(root, 'c2', 'project.json'))).toBe(true);

  // Unlink keeps every project.
  await page.getByTestId('sync-manage').click();
  await page.getByTestId('sync-unlink').click();
  await expect(page.getByTestId('sync-footer')).toHaveCount(0);
  await expect(page.getByTestId('project-card')).toHaveCount(3);
});

test('sync with an SFTP server: fingerprint, test, link, upload, forget the credential', async ({
  page,
}) => {
  const { root, projects } = await withDesktopProjects(page);
  const served = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-sftp-'));
  const { startSftpServer } = await import('../desktop/test-sftp-server.mjs');
  const server = await startSftpServer({ root: served, users: { ana: 'secreto' } });
  try {
    seedProject(projects, root, 'Cliente 1', 'c1', false);
    await page.goto('/proyectos');
    await page.getByTestId('sync-link').click();
    await page.getByTestId('sync-tab-sftp').click();
    await page.getByTestId('sftp-host').fill('127.0.0.1');
    await page.getByTestId('sftp-port').fill(String(server.port));
    await page.getByTestId('sftp-user').fill('ana');
    await page.getByTestId('sftp-password').fill('secreto');
    await page.getByTestId('sftp-test').click();

    // First connection: the fingerprint is shown and must be confirmed.
    await expect(page.getByTestId('hostkey-fp')).toHaveText(server.fingerprint);
    await page.getByTestId('hostkey-trust').click();

    // The remote folder does not exist yet: it is offered to be created.
    await expect(page.getByTestId('sftp-test-error')).toContainText('no existe');
    await page.getByTestId('sftp-create-folder').click();
    await expect(page.getByTestId('sftp-steps')).toContainText('Acceso correcto');
    await page.getByTestId('sftp-test-continue').click();
    await expect(page.getByTestId('sync-checked')).toBeVisible();
    await expect(page.getByTestId('sync-link-confirm')).toBeDisabled();
    await page.getByTestId('sync-accept').check();
    await page.getByTestId('sync-link-confirm').click();
    await page.getByTestId('plan-go').click();
    await expect(page.getByTestId('sync-chip')).toContainText('Sincronizado');
    expect(existsSync(path.join(served, 'pdf-annotator', 'c1', '.sync', 'rev.json'))).toBe(true);
    await expect(page.getByTestId('sync-label')).toContainText(`ana@127.0.0.1:/pdf-annotator`);

    // The web never sees the secret: the screen only knows that one is saved.
    await page.getByTestId('sync-manage').click();
    await expect(page.getByTestId('sync-cred-state')).toContainText('almacén seguro');
    await expect(page.getByTestId('sync-fingerprint')).toContainText('SHA256:');
    expect(await page.content()).not.toContain('secreto');

    // Forgetting the credential keeps projects and uploaded files.
    await page.getByTestId('sync-cred-forget').click();
    await page.getByTestId('forget-confirm').click();
    await expect(page.getByTestId('project-card')).toHaveCount(1);
    expect(existsSync(path.join(served, 'pdf-annotator', 'c1', '.sync', 'rev.json'))).toBe(true);
    // Without a credential the app asks for the password again; "Ahora no" leaves it as is.
    await page.getByRole('button', { name: 'Ahora no' }).click();

    // Unlinking removes the link, not the uploaded files.
    await page.getByTestId('sync-manage').click();
    await page.getByTestId('sync-unlink').click();
    await page.getByTestId('sync-unlink-confirm').click();
    await expect(page.getByTestId('sync-footer')).toHaveCount(0);
    expect(existsSync(path.join(served, 'pdf-annotator', 'c1', 'project.json'))).toBe(true);
  } finally {
    await server.close();
  }
});

test('SFTP without a secure store asks for the password each session', async ({ page }) => {
  const { userData } = await withDesktopProjects(page, { secureStore: false });
  const served = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-sftp-'));
  const { startSftpServer } = await import('../desktop/test-sftp-server.mjs');
  const server = await startSftpServer({ root: served, users: { ana: 'secreto' } });
  try {
    mkdirSync(path.join(served, 'pdf-annotator'));
    await page.goto('/proyectos');
    await page.getByTestId('sync-link').click();
    await page.getByTestId('sync-tab-sftp').click();
    await page.getByTestId('sftp-host').fill('127.0.0.1');
    await page.getByTestId('sftp-port').fill(String(server.port));
    await page.getByTestId('sftp-user').fill('ana');
    await page.getByTestId('sftp-password').fill('secreto');
    await page.getByTestId('sftp-test').click();
    await page.getByTestId('hostkey-trust').click();
    await page.getByTestId('sftp-test-continue').click();
    await page.getByTestId('sync-accept').check();
    await page.getByTestId('sync-link-confirm').click();
    await expect(page.getByTestId('nostore-ask')).toBeVisible();
    await page.getByTestId('nostore-ask').click();
    await expect(page.getByTestId('sync-footer')).toContainText('127.0.0.1');
    // Nothing secret is written to disk, in any file.
    expect(existsSync(path.join(userData, 'projects-sync-secret.bin'))).toBe(false);
    for (const name of readdirSync(userData))
      expect(readFileSync(path.join(userData, name), 'utf8')).not.toContain('secreto');
  } finally {
    await server.close();
  }
});

test('quitar de la lista dice dónde quedan los archivos, abre la carpeta y la importación no la pisa', async ({
  page,
}) => {
  const { root, picks, opened, projects } = await withDesktopProjects(page);
  const { dir } = seedProject(projects, root, 'ejemplo 1', 'ejemplo 1');
  const out = mkdtempSync(path.join(os.tmpdir(), 'pa-e2e-out-'));
  const file = path.join(out, 'ejemplo 1.pdfannotator');

  await page.goto('/proyectos');
  const card = page.getByTestId('project-card');
  await card.getByTestId('project-menu').click();
  await card.getByTestId('project-export').click();
  picks.save = file;
  await page.getByTestId('export-choose').click();
  await expect(page.getByTestId('transfer-notice')).toContainText('ejemplo 1.pdfannotator');

  // El diálogo muestra la ruta, avisa de que no se borra nada y «Abrir carpeta» no lo cierra.
  await card.getByTestId('project-menu').click();
  await card.getByTestId('project-forget').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('No se borra ningún archivo');
  await expect(dialog.getByTestId('forget-path')).toContainText(dir);
  await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await dialog.getByTestId('forget-open-folder').click();
  await expect.poll(() => opened).toEqual([dir]);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Quitar de la lista' }).click();

  // La lista queda vacía, la carpeta sigue y el aviso ofrece abrirla otra vez.
  await expect(page.getByTestId('project-empty')).toBeVisible();
  expect(existsSync(path.join(dir, 'batch'))).toBe(true);
  expect(existsSync(path.join(dir, 'project.json'))).toBe(false);
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Los archivos siguen en');
  await toast.getByTestId('toast-action').click();
  await expect.poll(() => opened).toEqual([dir, dir]);

  // Importar con el mismo nombre: avisa de la carpeta ocupada y usa otra, sin tocar la primera.
  picks.open = file;
  await page.getByTestId('project-import').click();
  await expect(page.getByTestId('import-leftover')).toContainText('ejemplo 1-2');
  await page.getByTestId('import-open-existing').click();
  await expect.poll(() => opened).toEqual([dir, dir, dir]);
  await page.getByTestId('import-confirm').click();
  await expect(page.getByTestId('project-card')).toHaveCount(1);
  expect(existsSync(path.join(root, 'ejemplo 1-2', 'project.json'))).toBe(true);
  expect(existsSync(path.join(dir, 'project.json'))).toBe(false);
  expect(existsSync(path.join(dir, 'batch'))).toBe(true);
});
