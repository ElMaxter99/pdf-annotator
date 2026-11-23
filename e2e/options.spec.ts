import { expect, test } from '@playwright/test';
import { stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

async function fakeDesktop(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const st = { status: 'idle', mode: 'auto', current: '1.19.0', channel: 'stable' };
    (window as unknown as Record<string, unknown>)['desktop'] = {
      isDesktop: true,
      helperPort: 4310,
      getUpdateState: async () => st,
      onUpdateState: () => () => undefined,
      checkForUpdates: async () => undefined,
      downloadUpdate: async () => undefined,
      cancelUpdate: async () => undefined,
      installUpdate: async () => undefined,
      installOnQuit: async () => undefined,
      openReleasePage: async () => undefined,
      setUpdateChannel: async () => undefined,
    };
  });
}

test('en escritorio las Opciones tienen Actualizaciones e IA y se abren con Ctrl+,', async ({ page }) => {
  await fakeDesktop(page);
  await page.goto('/landing');
  await page.getByTestId('options-open').click();
  const dialog = page.getByTestId('options-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('options-nav-updates')).toBeVisible();
  await expect(page.getByTestId('options-nav-ai')).toBeVisible();
  await expect(dialog.getByTestId('update-channel')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.keyboard.press('Control+,');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Control+,');
  await expect(dialog).toHaveCount(0);
});

test('el límite de peticiones tiene valores por defecto, se guarda y valida «Otro…»', async ({ page }) => {
  // Copilot puede no estar instalado en la máquina de pruebas: se parte de él ya elegido.
  await page.addInitScript(() => localStorage.setItem('pdf-annotator.ai.provider', 'copilot'));
  await page.goto('/landing');
  await page.getByTestId('options-open').click();
  // En local solo hay IA: sin lista de secciones.
  await expect(page.getByTestId('options-nav-ai')).toHaveCount(0);
  await expect(page.getByTestId('options-limit-10')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('options-limit-25').click();
  await expect(page.getByTestId('options-limit-25')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('options-limit-inf').click();
  await expect(page.getByTestId('options-note-inf')).toBeVisible();
  await page.getByTestId('options-limit-other').click();
  await page.getByTestId('options-limit-input').fill('0');
  await expect(page.getByTestId('options-limit-error')).toBeVisible();
  await page.getByTestId('options-limit-input').fill('');
  await page.getByTestId('options-limit-input').pressSequentially('75');
  await expect(page.getByTestId('options-limit-input')).toBeFocused();
  await expect(page.getByTestId('options-limit-input')).toHaveValue('75');
  await expect(page.getByTestId('options-limit-error')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.limits'))).toContain('"copilot":75');
  // Claude Code arranca sin límite y lo explica.
  await page.getByTestId('options-provider-claude').click();
  await expect(page.getByTestId('options-limit-inf')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('options-note-claude')).toBeVisible();
  // Restablecer pide confirmación en línea.
  await page.getByTestId('options-reset').click();
  await page.getByTestId('options-reset-ok').click();
  expect(await page.evaluate(() => localStorage.getItem('pdf-annotator.ai.limits'))).toContain('"copilot":10');
});
