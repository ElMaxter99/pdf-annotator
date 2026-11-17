import { expect, Page, test } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
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
  setupProjectsIpc({
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
    app: { getPath: (name: string) => (name === 'documents' ? documents : userData) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    getWindow: () => null,
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
      },
      getUpdateState: async () => ({ status: 'idle', mode: 'manual', current: '1.13.0' }),
      onUpdateState: () => () => undefined,
    };
  });
  return { root };
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
