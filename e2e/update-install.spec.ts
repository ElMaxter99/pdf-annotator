import { expect, test } from '@playwright/test';
import { stubAnalytics } from './helpers';

test.beforeEach(async ({ page }) => stubAnalytics(page));

/** Puente simulado: `installUpdate` pasa a «instalando» y luego a lo que diga `outcome`. */
async function fakeDesktop(
  page: import('@playwright/test').Page,
  initial: Record<string, unknown>,
) {
  await page.addInitScript((init) => {
    let st: Record<string, unknown> = {
      status: 'idle',
      mode: 'auto',
      current: '1.13.0-rc.1',
      ...init,
    };
    const listeners: Array<(s: unknown) => void> = [];
    const push = (next: Record<string, unknown>) => {
      st = { ...st, ...next };
      listeners.forEach((f) => f(st));
    };
    const w = window as unknown as Record<string, unknown>;
    w['__installCalls'] = 0;
    w['__push'] = push;
    w['desktop'] = {
      isDesktop: true,
      helperPort: 4310,
      getUpdateState: async () => st,
      onUpdateState: (cb: (s: unknown) => void) => (listeners.push(cb), () => undefined),
      checkForUpdates: async () => undefined,
      downloadUpdate: async () => undefined,
      cancelUpdate: async () => undefined,
      setUpdateChannel: async () => undefined,
      installOnQuit: async () => undefined,
      openReleasePage: async () => undefined,
      dismissUpdated: async () => push({ justUpdatedFrom: undefined }),
      installUpdate: async () => {
        w['__installCalls'] = (w['__installCalls'] as number) + 1;
        push({ status: 'installing', installError: undefined });
      },
    };
  }, initial);
}

const ready = { status: 'ready', version: '1.13.0-rc.2', needsPassword: true };

test('Reiniciar ahora muestra «Instalando» con el aviso de la contraseña en Linux', async ({
  page,
}) => {
  await fakeDesktop(page, ready);
  await page.goto('/landing');
  await page.getByRole('button', { name: 'Reiniciar ahora' }).click();
  const dialog = page.getByTestId('update-installing');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Instalando la versión 1.13.0-rc.2');
  await expect(page.getByTestId('update-installing-hint')).toContainText('contraseña');
  await expect(page.getByTestId('update-card')).toHaveCount(0);
});

test('sin contraseña (Windows) avisa del instalador', async ({ page }) => {
  await fakeDesktop(page, { ...ready, needsPassword: false });
  await page.goto('/landing');
  await page.getByRole('button', { name: 'Reiniciar ahora' }).click();
  await expect(page.getByTestId('update-installing-hint')).toContainText('instalador');
});

test('si se cancela la contraseña se explica y «Reintentar» reutiliza la descarga', async ({
  page,
}) => {
  await fakeDesktop(page, ready);
  await page.goto('/landing');
  await page.getByRole('button', { name: 'Reiniciar ahora' }).click();
  await page.evaluate(() =>
    (window as unknown as { __push: (s: object) => void }).__push({
      status: 'ready',
      installError: 'cancelled',
    }),
  );
  const dialog = page.getByTestId('update-install-error');
  await expect(dialog).toContainText('Cancelaste la contraseña');
  await expect(page.getByTestId('update-install-retry')).toContainText(
    'Pedir la contraseña otra vez',
  );
  await expect(dialog.getByRole('button')).toHaveText(['Pedir la contraseña otra vez', 'Ahora no']);
  await page.getByTestId('update-install-retry').click();
  await expect(page.getByTestId('update-installing')).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { __installCalls: number }).__installCalls),
  ).toBe(2);
});

test('en Windows, tras cancelar el permiso, se ofrece pedirlo otra vez con su propio texto', async ({
  page,
}) => {
  await fakeDesktop(page, { ...ready, needsAdmin: true, installError: 'cancelled' });
  await page.goto('/landing');
  const dialog = page.getByTestId('update-install-error');
  await expect(dialog).toContainText('Cancelaste el permiso de Windows');
  await expect(page.getByTestId('update-install-retry')).toContainText('Pedir permiso otra vez');
  await page.getByTestId('update-install-retry').click();
  await expect(page.getByTestId('update-installing')).toBeVisible();
});

test('un fallo muestra el motivo real y «Ahora no» devuelve la tarjeta', async ({ page }) => {
  await fakeDesktop(page, {
    ...ready,
    installError: 'failed',
    installDetail: 'dpkg: error de dependencias',
  });
  await page.goto('/landing');
  await expect(page.getByTestId('update-install-detail')).toContainText(
    'dpkg: error de dependencias',
  );
  await expect(page.getByTestId('update-install-error').getByRole('button')).toHaveText([
    'Reintentar',
    'Copiar detalles',
    'Ahora no',
  ]);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('update-install-error')).toHaveCount(0);
  await expect(page.getByTestId('update-card')).toBeVisible();
});

test('tras reabrir confirma la actualización y se puede cerrar', async ({ page }) => {
  await fakeDesktop(page, { current: '1.13.0-rc.2', justUpdatedFrom: '1.13.0-rc.1' });
  await page.goto('/landing');
  const done = page.getByTestId('update-done');
  await expect(done).toContainText('se actualizó a 1.13.0-rc.2');
  await expect(done).toContainText('1.13.0-rc.1');
  await done.getByRole('button', { name: 'Cerrar' }).click();
  await expect(done).toHaveCount(0);
});

test('Linux: si el sistema no autoriza no dice «cancelaste» y deja pedir la contraseña otra vez, copiar detalles y cerrar', async ({
  page,
}) => {
  await fakeDesktop(page, {
    ...ready,
    installError: 'unauthorized',
    installDetail: 'Error executing command as another user: Not authorized',
  });
  await page.goto('/landing');
  const dialog = page.getByTestId('update-install-error');
  await expect(dialog).toContainText('El sistema no dejó instalar la actualización');
  await expect(dialog).not.toContainText('Cancelaste');
  await expect(page.getByTestId('update-install-detail')).toContainText('Not authorized');
  await expect(dialog.getByRole('button')).toHaveText([
    'Pedir la contraseña otra vez',
    'Copiar detalles',
    'Ahora no',
  ]);
  await page.getByTestId('update-install-retry').click();
  await expect(page.getByTestId('update-installing')).toBeVisible();
});

test('al cancelar de verdad la contraseña solo se ofrece pedirla otra vez o cerrar', async ({
  page,
}) => {
  await fakeDesktop(page, { ...ready, installError: 'cancelled' });
  await page.goto('/landing');
  const dialog = page.getByTestId('update-install-error');
  await expect(dialog).toContainText('Cancelaste la contraseña');
  await expect(dialog.getByRole('button')).toHaveText(['Pedir la contraseña otra vez', 'Ahora no']);
});

test('Linux con la ventana restringida (no_new_privs) y sin systemd-run: pide abrir la app desde el menú', async ({
  page,
}) => {
  await fakeDesktop(page, {
    ...ready,
    installError: 'blocked',
    installDetail: 'pkexec must be setuid root',
  });
  await page.goto('/landing');
  const dialog = page.getByTestId('update-install-error');
  await expect(dialog).toContainText('Cierra la app y ábrela desde el menú para actualizar');
  await expect(dialog).not.toContainText('Cancelaste');
  await expect(dialog.getByRole('button')).toHaveText(['Copiar detalles', 'Ahora no']);
});
