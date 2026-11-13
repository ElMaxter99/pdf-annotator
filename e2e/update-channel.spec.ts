import { expect, test } from '@playwright/test';
import { EXAMPLE_PDF, stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

/** Simula el puente de la app de escritorio (Electron) con una versión de prueba instalada. */
async function fakeDesktop(
  page: import('@playwright/test').Page,
  current: string,
  channel: 'stable' | 'beta',
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
        checkForUpdates: async () => undefined,
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

test('en la web el selector de canal no existe', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByTestId('update-channel')).toHaveCount(0);
});

test('pasar a Pruebas pide confirmación y Cancelar lo deja como estaba', async ({ page }) => {
  await fakeDesktop(page, '1.8.4', 'stable');
  await openEditor(page);
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('channel-beta').click();
  await expect(page.getByTestId('channel-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('channel-dialog')).toHaveCount(0);
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('channel-beta').click();
  await page.getByTestId('channel-confirm').click();
  await expect(page.getByTestId('channel-beta')).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(() => (window as unknown as { __channelCalls: string[] }).__channelCalls),
  ).toEqual(['beta']);
});

test('volver a Estable desde una prueba explica que no se baja de versión', async ({ page }) => {
  await fakeDesktop(page, '1.9.0-rc.1', 'beta');
  await openEditor(page);
  await expect(page.getByTestId('current-test-tag')).toBeVisible();
  await page.getByTestId('channel-stable').click();
  await expect(page.getByTestId('channel-dialog')).toContainText('1.9.0-rc.1');
  await page.getByTestId('channel-confirm').click();
  await expect(page.getByTestId('channel-stable')).toHaveAttribute('aria-pressed', 'true');
});
