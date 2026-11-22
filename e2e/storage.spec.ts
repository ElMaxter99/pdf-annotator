import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

const ENTRIES = [
  { id: 'projects', group: 'work', path: '~/PDF Annotator', clearable: false, canOpen: true },
  { id: 'editor-data', group: 'work', path: '~/.config/pdf/IndexedDB', clearable: false, canOpen: true },
  { id: 'program', group: 'app', path: '/opt/pdf-annotator', clearable: false, canOpen: true },
  { id: 'settings', group: 'app', path: '~/.config/pdf', clearable: false, canOpen: true },
  { id: 'browser-cache', group: 'clearable', path: '~/.config/pdf/Cache', clearable: true, canOpen: true },
  { id: 'update-downloads', group: 'clearable', path: '~/.cache/pdf-updater', clearable: true, canOpen: true },
  { id: 'ai-temp', group: 'clearable', path: '/tmp/pdfann-ia-*', clearable: true, canOpen: true },
  { id: 'update-log', group: 'clearable', path: '~/.config/pdf/update.log', clearable: true, canOpen: true },
];
const SIZES: Record<string, number> = {
  projects: 50_000_000, 'editor-data': 4_000_000, program: 300_000_000, settings: 2_000,
  'browser-cache': 20_000_000, 'update-downloads': 100_000_000, 'ai-temp': 0, 'update-log': 3_000,
};

async function fakeDesktop(page: import('@playwright/test').Page, failClear = false) {
  await page.addInitScript(
    ([entries, sizes, fail]) => {
      const w = window as unknown as Record<string, unknown>;
      w['__storageCalls'] = [];
      const calls = w['__storageCalls'] as string[];
      const left: Record<string, number> = { ...(sizes as Record<string, number>) };
      w['desktop'] = {
        isDesktop: true,
        helperPort: 4310,
        getUpdateState: async () => ({ status: 'idle', mode: 'auto', current: '1.18.0', channel: 'stable' }),
        onUpdateState: () => () => undefined,
        checkForUpdates: async () => undefined,
        downloadUpdate: async () => undefined,
        cancelUpdate: async () => undefined,
        installUpdate: async () => undefined,
        installOnQuit: async () => undefined,
        openReleasePage: async () => undefined,
        setUpdateChannel: async () => undefined,
        storage: {
          list: async () => ({ entries }),
          size: async (id: string) => ({ bytes: left[id] ?? 0, partial: false, exists: (left[id] ?? 0) > 0 }),
          clear: async (id: string) => {
            calls.push('clear:' + id);
            if (fail) return { ok: false };
            const freed = left[id] ?? 0;
            left[id] = 0;
            return { ok: true, freed };
          },
          reveal: async (id: string) => (calls.push('reveal:' + id), ''),
        },
      };
    },
    [ENTRIES, SIZES, failClear] as const,
  );
}

async function openPanel(page: import('@playwright/test').Page) {
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await page.getByTestId('more-options').click();
  await page.getByTestId('storage-open').click();
  await expect(page.getByTestId('storage-panel')).toBeVisible();
}

test('en la web no hay entrada de Almacenamiento', async ({ page }) => {
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
  await expect(page.getByTestId('storage-open')).toHaveCount(0);
});

test('el panel lista los tres grupos con sus tamaños y solo deja vaciar cachés', async ({ page }) => {
  await fakeDesktop(page);
  await openPanel(page);
  for (const g of ['work', 'app', 'clearable']) await expect(page.getByTestId('storage-group-' + g)).toBeVisible();
  await expect(page.getByTestId('storage-size-projects')).toContainText('MB');
  await expect(page.getByTestId('storage-clear-projects')).toHaveCount(0);
  await expect(page.getByTestId('storage-clear-program')).toHaveCount(0);
  await expect(page.getByTestId('storage-clear-browser-cache')).toBeVisible();
  await page.getByTestId('storage-open-projects').click();
  expect(await page.evaluate(() => (window as unknown as Record<string, string[]>)['__storageCalls'])).toContain('reveal:projects');
});

test('vaciar pide confirmación y no borra al cancelar', async ({ page }) => {
  await fakeDesktop(page);
  await openPanel(page);
  await page.getByTestId('storage-clear-update-downloads').click();
  await expect(page.getByTestId('storage-confirm')).toBeVisible();
  await page.getByTestId('storage-confirm-cancel').click();
  await expect(page.getByTestId('storage-confirm')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as Record<string, string[]>)['__storageCalls'])).toEqual([]);
  await page.getByTestId('storage-clear-update-downloads').click();
  await page.getByTestId('storage-confirm-ok').click();
  await expect(page.getByTestId('storage-freed')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as Record<string, string[]>)['__storageCalls'])).toEqual(['clear:update-downloads']);
});

test('si vaciar falla se avisa', async ({ page }) => {
  await fakeDesktop(page, true);
  await openPanel(page);
  await page.getByTestId('storage-clear-browser-cache').click();
  await page.getByTestId('storage-confirm-ok').click();
  await expect(page.getByTestId('storage-error')).toBeVisible();
});

test('Escape cierra el panel', async ({ page }) => {
  await fakeDesktop(page);
  await openPanel(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('storage-panel')).toHaveCount(0);
});
