import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

/** Simula el puente de la app de escritorio (Electron) con una versión de prueba instalada. */
async function fakeDesktop(
  page: import('@playwright/test').Page,
  current: string,
  channel: 'stable' | 'latest',
) {
  await page.addInitScript(
    ([cur, ch]) => {
      let st: Record<string, unknown> = { status: 'idle', mode: 'auto', current: cur, channel: ch };
      const listeners: Array<(s: unknown) => void> = [];
      (window as unknown as Record<string, unknown>)['__channelCalls'] = [];
      (window as unknown as Record<string, unknown>)['desktop'] = {
        isDesktop: true,
        helperPort: 4310,
        getUpdateState: async () => st,
        onUpdateState: (cb: (s: unknown) => void) => (listeners.push(cb), () => undefined),
        checkForUpdates: async () => {
          st = { ...st, lastChecked: Date.now() };
          listeners.forEach((f) => f(st));
        },
        setState: (next: Record<string, unknown>) => {
          st = { ...st, ...next };
          listeners.forEach((f) => f(st));
        },
        downloadUpdate: async () => undefined,
        cancelUpdate: async () => undefined,
        installUpdate: async () => undefined,
        installOnQuit: async () => undefined,
        openReleasePage: async () => undefined,
        setUpdateChannel: async (c: string) => {
          ((window as unknown as Record<string, unknown>)['__channelCalls'] as string[]).push(c);
          st = { ...st, channel: c };
          listeners.forEach((f) => f(st));
        },
      };
    },
    [current, channel] as const,
  );
}

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/landing');
  await page.locator('input[type=file]').setInputFiles(EXAMPLE_PDF);
  await page.waitForURL('**/workspace');
}

async function openPanel(page: import('@playwright/test').Page) {
  await page.getByTestId('version-chip').first().click();
  await expect(page.getByTestId('update-panel')).toBeVisible();
}

test('en la web no hay chip pulsable ni selector de canal', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('version-chip')).toHaveCount(0);
  await expect(page.getByTestId('update-channel')).toHaveCount(0);
});

test('el panel de actualizaciones se abre desde el inicio, busca ahora y se cierra con Escape', async ({ page }) => {
  await fakeDesktop(page, '1.8.4', 'stable');
  await page.goto('/landing');
  await expect(page.getByTestId('version-chip')).toContainText('v1.8.4');
  await openPanel(page);
  await expect(page.getByTestId('panel-status')).toContainText('Sin comprobar');
  await page.getByTestId('panel-check').click();
  await expect(page.getByTestId('panel-status')).toContainText('al día');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('update-panel')).toHaveCount(0);
});

test('«Más tarde» deja el punto en el chip y el panel permite actualizar desde el lote o el editor', async ({ page }) => {
  await fakeDesktop(page, '1.8.4', 'stable');
  await openEditor(page);
  await page.evaluate(() =>
    (window as unknown as { desktop: { setState: (s: unknown) => void } }).desktop.setState({
      status: 'available',
      version: '1.9.0',
    }),
  );
  await page.getByTestId('update-card').getByRole('button', { name: 'Más tarde' }).first().click();
  await expect(page.getByTestId('update-card')).toHaveCount(0);
  await expect(page.getByTestId('version-chip-dot').first()).toBeVisible();
  await openPanel(page);
  await expect(page.getByTestId('panel-download')).toBeVisible();
});

test('pasar a Últimas pide confirmación y Cancelar lo deja como estaba', async ({ page }) => {
  await fakeDesktop(page, '1.8.4', 'stable');
  await openEditor(page);
  await openPanel(page);
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('channel-latest').click();
  await expect(page.getByTestId('channel-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('channel-dialog')).toHaveCount(0);
  await expect(page.getByTestId('update-panel')).toBeVisible();
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('channel-latest').click();
  await page.getByTestId('channel-confirm').click();
  await expect(page.getByTestId('channel-latest')).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => (window as unknown as { __channelCalls: string[] }).__channelCalls),
  ).toEqual(['latest']);
});

test('volver a Solo estables desde una prueba explica que no se baja de versión', async ({ page }) => {
  await fakeDesktop(page, '1.9.0-rc.1', 'latest');
  await openEditor(page);
  await openPanel(page);
  await expect(page.getByTestId('panel-version')).toContainText('Prueba');
  await page.getByTestId('channel-stable').click();
  await expect(page.getByTestId('channel-dialog')).toContainText('1.9.0-rc.1');
  await page.getByTestId('channel-confirm').click();
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');
});
