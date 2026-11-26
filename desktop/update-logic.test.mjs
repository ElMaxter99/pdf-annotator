import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyInstallError, installDetail, installNeedsPassword, compareVersions, feedForVersion, RELEASES_URL, isNewer, normalizeChannel, parseLatestRelease, parseReleaseForChannel, parseVersion, shouldCleanPendingUpdate, updateMode, updaterCacheDirName } from './update-logic.mjs';

test('parseVersion acepta v y prerelease, rechaza basura', () => {
  assert.deepEqual(parseVersion('v1.6.0')?.nums, [1, 6, 0]);
  assert.equal(parseVersion('1.6.0-beta.1')?.pre, 'beta.1');
  assert.equal(parseVersion('1.6'), null);
  assert.equal(parseVersion('latest'), null);
});

test('compareVersions ordena numéricamente y trata las prereleases', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.ok(compareVersions('1.5.0', '1.6.0') < 0);
  assert.equal(compareVersions('1.5.0', 'v1.5.0'), 0);
  assert.ok(compareVersions('1.6.0-beta.1', '1.6.0') < 0);
  assert.ok(compareVersions('1.6.0-beta.2', '1.6.0-beta.10') < 0);
});

test('isNewer: instalada 1.5 y publicada 1.6 avisa; igual o inválida no', () => {
  assert.equal(isNewer('1.5.0', '1.6.0'), true);
  assert.equal(isNewer('1.6.0', '1.6.0'), false);
  assert.equal(isNewer('1.6.0', '1.5.0'), false);
  assert.equal(isNewer('1.6.0', 'basura'), false);
});

test('updateMode: automático en Windows, AppImage, deb y rpm; manual en macOS sin firma y Linux sin formato', () => {
  assert.equal(updateMode({ platform: 'win32' }), 'auto');
  assert.equal(updateMode({ platform: 'linux', appImage: true }), 'auto');
  assert.equal(updateMode({ platform: 'linux', packageType: 'deb' }), 'auto');
  assert.equal(updateMode({ platform: 'linux', packageType: 'rpm' }), 'auto');
  assert.equal(updateMode({ platform: 'linux', packageType: 'pacman' }), 'manual');
  assert.equal(updateMode({ platform: 'linux', appImage: false }), 'manual');
  assert.equal(updateMode({ platform: 'darwin' }), 'manual');
  assert.equal(updateMode({ platform: 'darwin', macSigned: true }), 'auto');
});

test('parseLatestRelease ignora borradores y prereleases y fija la URL al repositorio', () => {
  const ok = { tag_name: 'v1.6.0', html_url: 'https://github.com/ElMaxter99/pdf-annotator/releases/tag/v1.6.0' };
  assert.deepEqual(parseLatestRelease(ok), { version: '1.6.0', url: ok.html_url });
  assert.equal(parseLatestRelease({ ...ok, draft: true }), null);
  assert.equal(parseLatestRelease({ ...ok, prerelease: true }), null);
  assert.equal(parseLatestRelease({ tag_name: 'v1.6.0-rc.1' }), null);
  assert.equal(parseLatestRelease(null), null);
  assert.equal(parseLatestRelease({ tag_name: 'v1.6.0', html_url: 'https://evil.example/x' }).url, 'https://github.com/ElMaxter99/pdf-annotator/releases/tag/v1.6.0');
});

const rel = (tag, extra = {}) => ({ tag_name: tag, draft: false, prerelease: /-/.test(tag), html_url: `https://github.com/ElMaxter99/pdf-annotator/releases/tag/${tag}`, ...extra });

test('normalizeChannel: «latest» y el antiguo «beta» son Últimas; lo demás, Solo estables', () => {
  assert.equal(normalizeChannel('latest'), 'latest');
  assert.equal(normalizeChannel('beta'), 'latest');
  assert.equal(normalizeChannel('stable'), 'stable');
  assert.equal(normalizeChannel('rc'), 'stable');
  assert.equal(normalizeChannel(undefined), 'stable');
});

test('parseReleaseForChannel: estable ignora las RC y los borradores', () => {
  const list = [rel('v1.9.0-rc.2'), rel('v1.9.0-rc.1'), rel('v1.8.5', { draft: true }), rel('v1.8.4')];
  assert.deepEqual(parseReleaseForChannel(list)?.version, '1.8.4');
  assert.equal(parseReleaseForChannel(list)?.prerelease, false);
});

test('parseReleaseForChannel: pruebas ofrece la RC más alta y la final gana a sus RC', () => {
  const list = [rel('v1.9.0-rc.1'), rel('v1.9.0-rc.10'), rel('v1.9.0-rc.2'), rel('v1.8.4')];
  const best = parseReleaseForChannel(list, { prerelease: true });
  assert.equal(best?.version, '1.9.0-rc.10');
  assert.equal(best?.prerelease, true);
  assert.equal(parseReleaseForChannel([...list, rel('v1.9.0')], { prerelease: true })?.version, '1.9.0');
});

test('parseReleaseForChannel: solo acepta rc.N, valores raros y una release suelta', () => {
  assert.equal(parseReleaseForChannel([rel('v2.0.0-beta.1')], { prerelease: true }), null);
  assert.equal(parseReleaseForChannel(null), null);
  assert.equal(parseReleaseForChannel(rel('v1.8.4'))?.version, '1.8.4');
});

test('una RC instalada no se «actualiza» a otra anterior ni a la misma; sí a la siguiente y a la final', () => {
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.1'), false);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.2'), false);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0-rc.3'), true);
  assert.equal(isNewer('1.9.0-rc.2', '1.9.0'), true);
  assert.equal(isNewer('1.8.4', '1.9.0-rc.1'), true);
});

test('classifyInstallError distingue contraseña cancelada de otros fallos', () => {
  assert.equal(classifyInstallError('Command failed with exit status 126'), 'cancelled');
  assert.equal(classifyInstallError('Error: Request dismissed'), 'cancelled');
  assert.equal(classifyInstallError('dpkg: error processing archive (status 1)'), 'failed');
  assert.equal(classifyInstallError(undefined), 'failed');
});

test('installDetail deja una línea corta sin la carpeta personal', () => {
  assert.equal(installDetail('fallo\n en /home/ana/.cache/x.deb', '/home/ana'), 'fallo en ~/.cache/x.deb');
  assert.equal(installDetail('a'.repeat(400)).length, 298);
});

test('installNeedsPassword solo para .deb/.rpm en Linux', () => {
  assert.equal(installNeedsPassword({ platform: 'linux', packageType: 'deb' }), true);
  assert.equal(installNeedsPassword({ platform: 'linux', appImage: true }), false);
  assert.equal(installNeedsPassword({ platform: 'win32' }), false);
});

test('updaterCacheDirName lee el nombre y rechaza rutas', () => {
  assert.equal(updaterCacheDirName('owner: x\nupdaterCacheDirName: pdf-annotator-desktop-updater\n'), 'pdf-annotator-desktop-updater');
  assert.equal(updaterCacheDirName("updaterCacheDirName: 'a-updater'"), 'a-updater');
  assert.equal(updaterCacheDirName('updaterCacheDirName: ../../etc'), null);
  assert.equal(updaterCacheDirName('updaterCacheDirName: ..'), null);
  assert.equal(updaterCacheDirName('provider: github'), null);
  assert.equal(updaterCacheDirName(undefined), null);
});

test('shouldCleanPendingUpdate solo tras arrancar una versión distinta', () => {
  assert.equal(shouldCleanPendingUpdate('1.16.0', '1.17.0'), true);
  assert.equal(shouldCleanPendingUpdate('1.17.0', '1.17.0'), false);
  assert.equal(shouldCleanPendingUpdate(null, '1.17.0'), false);
  assert.equal(shouldCleanPendingUpdate('', '1.17.0'), false);
});

test('linuxInstallCommand: una sola contraseña con pkexec y el gestor que haya', async () => {
  const { linuxInstallCommand } = await import('./update-logic.mjs');
  const has = (list) => (cmd) => list.includes(cmd);
  assert.deepEqual(linuxInstallCommand({ packageType: 'deb', file: '/c/p.deb', has: has(['pkexec', 'dpkg']) }), { cmd: 'pkexec', args: ['dpkg', '-i', '/c/p.deb'] });
  assert.deepEqual(linuxInstallCommand({ packageType: 'rpm', file: '/c/p.rpm', has: has(['pkexec', 'dnf', 'rpm']) }).args.slice(0, 3), ['dnf', 'install', '-y']);
  assert.deepEqual(linuxInstallCommand({ packageType: 'rpm', file: '/c/p.rpm', has: has(['pkexec', 'rpm']) }).args, ['rpm', '-U', '--replacepkgs', '/c/p.rpm']);
  assert.equal(linuxInstallCommand({ packageType: 'deb', file: '/c/p.deb', has: has(['dpkg']) }), null, 'sin pkexec: el instalador de siempre');
  assert.equal(linuxInstallCommand({ packageType: 'deb', file: null, has: has(['pkexec', 'dpkg']) }), null);
  assert.equal(linuxInstallCommand({ packageType: 'pacman', file: '/c/p', has: has(['pkexec']) }), null);
});

test('classifyPkexecResult: cancelar (126/127), dependencias, error y bien', async () => {
  const { classifyPkexecResult } = await import('./update-logic.mjs');
  assert.equal(classifyPkexecResult({ code: 0 }), 'ok');
  assert.equal(classifyPkexecResult({ code: 126 }), 'cancelled');
  assert.equal(classifyPkexecResult({ code: 127 }), 'unauthorized');
  assert.equal(classifyPkexecResult({ code: 1, stderr: 'dpkg: dependency problems prevent configuration of pdf-annotator' }), 'deps');
  assert.equal(classifyPkexecResult({ code: 1, stderr: 'algo raro' }), 'failed');
});

test('windowsElevatedLaunch: pide permiso, espera y reabre la app si se cancela; las comillas no rompen el script', async () => {
  const { windowsElevatedLaunch, psQuote } = await import('./update-logic.mjs');
  assert.equal(psQuote("C:\\Users\\O'Neil\\x.exe"), "'C:\\Users\\O''Neil\\x.exe'");
  const r = windowsElevatedLaunch({ installer: 'C:\\Temp\\setup.exe', exe: "C:\\Program Files\\PDF Annotator\\PDF Annotator.exe" });
  assert.equal(r.cmd, 'powershell.exe');
  const script = r.args.at(-1);
  assert.match(script, /-Verb RunAs -Wait -PassThru/);
  assert.match(script, /'--updated','--force-run'/);
  assert.match(script, /catch \{ Start-Process -FilePath 'C:\\Program Files\\PDF Annotator\\PDF Annotator\.exe' -ArgumentList '--update-cancelled' \}/);
  assert.match(script, /if \(\$p\.ExitCode -ne 0\)/);
});

test('runLinuxInstall: cancelar no abre otra ventana; pedirla otra vez instala; dependencias se arreglan tras la contraseña', async () => {
  const { runLinuxInstall } = await import('./update-logic.mjs');
  const plan = { cmd: 'pkexec', args: ['dpkg', '-i', '/c/p.deb'] };
  const calls = [];
  const answers = [{ code: 126, stderr: '' }, { code: 0, stderr: '' }];
  const run = async (p) => (calls.push(p.args[0]), answers.shift());
  const first = await runLinuxInstall({ plan, packageType: 'deb', run });
  assert.equal(first.kind, 'cancelled');
  assert.deepEqual(calls, ['dpkg'], 'una sola ventana al cancelar (sin apt-get -f)');
  const again = await runLinuxInstall({ plan, packageType: 'deb', run }); // «Pedir la contraseña otra vez»
  assert.equal(again.kind, 'ok');
  assert.deepEqual(calls, ['dpkg', 'dpkg']);

  const seq = [{ code: 1, stderr: 'dpkg: dependency problems prevent configuration' }, { code: 0, stderr: '' }];
  const deps = [];
  const r = await runLinuxInstall({ plan, packageType: 'deb', run: async (p) => (deps.push(p.args[0]), seq.shift()) });
  assert.equal(r.kind, 'ok');
  assert.deepEqual(deps, ['dpkg', 'apt-get']);
  const rpm = await runLinuxInstall({ plan: { cmd: 'pkexec', args: ['rpm', '-U', 'x'] }, packageType: 'rpm', run: async () => ({ code: 1, stderr: 'dependency problems' }) });
  assert.equal(rpm.kind, 'failed', 'en rpm no hay apt-get -f');
});

test('classifyPkexecResult: sin agente de polkit NO es una cancelación; privilegedEnv quita lo de Electron', async () => {
  const { classifyPkexecResult, privilegedEnv } = await import('./update-logic.mjs');
  assert.equal(classifyPkexecResult({ code: 126, stderr: '' }), 'cancelled');
  assert.equal(classifyPkexecResult({ code: 127, stderr: 'Error executing command as another user: Not authorized\n\nThis incident has been reported.' }), 'unauthorized');
  assert.equal(classifyPkexecResult({ code: 126, stderr: 'Error executing command as another user: Request dismissed' }), 'cancelled');
  assert.equal(classifyPkexecResult({ code: 127, stderr: 'Error executing command as another user: No authentication agent found.' }), 'failed');
  assert.equal(classifyPkexecResult({ code: -1, stderr: 'spawn pkexec ENOENT' }), 'failed');
  assert.deepEqual(privilegedEnv({ DISPLAY: ':0', ELECTRON_RUN_AS_NODE: '1', APPIMAGE: '/x', PATH: '/bin' }), { DISPLAY: ':0', PATH: '/bin' });
});

test('feedForVersion fija la etiqueta y usa siempre latest*.yml', () => {
  assert.deepEqual(feedForVersion('1.19.0'), { url: `${RELEASES_URL}/download/v1.19.0/`, channel: 'latest' });
  assert.deepEqual(feedForVersion('1.19.0-rc.7'), { url: `${RELEASES_URL}/download/v1.19.0-rc.7/`, channel: 'latest' });
  assert.equal(feedForVersion('basura'), null);
});

test('linuxManualCommand: comando para pegar en la terminal, con la ruta entre comillas', async () => {
  const { linuxManualCommand } = await import('./update-logic.mjs');
  assert.equal(linuxManualCommand({ packageType: 'deb', file: '/home/a/.cache/x/pending/PDF-Annotator.deb' }), "sudo apt install '/home/a/.cache/x/pending/PDF-Annotator.deb'");
  assert.equal(linuxManualCommand({ packageType: 'rpm', file: "/tmp/O'Neil.rpm" }), "sudo dnf install '/tmp/O'\\''Neil.rpm'");
  assert.equal(linuxManualCommand({ packageType: 'deb', file: '' }), null);
  assert.equal(linuxManualCommand({ packageType: 'appimage', file: '/x' }), null);
});

test('runLinuxInstall: «no autorizado» no lanza el arreglo de dependencias ni una segunda ventana', async () => {
  const { runLinuxInstall } = await import('./update-logic.mjs');
  const calls = [];
  const out = await runLinuxInstall({
    plan: { cmd: 'pkexec', args: ['dpkg', '-i', '/x.deb'] },
    packageType: 'deb',
    run: async (p) => (calls.push(p), { code: 127, stderr: 'Error executing command as another user: Not authorized' }),
  });
  assert.equal(out.kind, 'unauthorized');
  assert.equal(calls.length, 1);
});

test('pkexec «must be setuid root» (no_new_privs): blocked; se detecta antes con /proc/self/status', async () => {
  const { classifyPkexecResult, setuidBlocked } = await import('./update-logic.mjs');
  assert.equal(classifyPkexecResult({ code: 127, stderr: 'pkexec must be setuid root' }), 'blocked');
  assert.equal(setuidBlocked('Name:\tnode\nNoNewPrivs:\t1\nSeccomp:\t0\n'), true);
  assert.equal(setuidBlocked('Name:\tnode\nNoNewPrivs:\t0\n'), false);
  assert.equal(setuidBlocked(''), false);
});

test('linuxPackageKitCommand y classifyPkconResult', async () => {
  const { linuxPackageKitCommand, classifyPkconResult } = await import('./update-logic.mjs');
  const has = (c) => c === 'pkcon';
  assert.deepEqual(linuxPackageKitCommand({ packageType: 'deb', file: '/x.deb', has }), {
    cmd: 'pkcon',
    args: ['--noninteractive', '--allow-untrusted', 'install-local', '/x.deb'],
  });
  assert.equal(linuxPackageKitCommand({ packageType: 'deb', file: '/x.deb', has: () => false }), null);
  assert.equal(linuxPackageKitCommand({ packageType: 'appimage', file: '/x', has }), null);
  assert.equal(classifyPkconResult({ code: 0 }), 'ok');
  assert.equal(classifyPkconResult({ code: 1, stderr: 'Fatal error: The request was dismissed' }), 'cancelled');
  assert.equal(classifyPkconResult({ code: 1, stderr: 'Not authorized' }), 'unauthorized');
  assert.equal(classifyPkconResult({ code: 1, stderr: 'algo' }), 'failed');
});

test('runLinuxInstall: bloqueado → PackageKit si existe (sin pkexec); si no, blocked sin ejecutar nada', async () => {
  const { runLinuxInstall } = await import('./update-logic.mjs');
  const plan = { cmd: 'pkexec', args: ['dpkg', '-i', '/x.deb'] };
  const packageKit = { cmd: 'pkcon', args: ['install-local', '/x.deb'] };
  let calls = [];
  let out = await runLinuxInstall({ plan, packageType: 'deb', blocked: true, packageKit, run: async (p) => (calls.push(p.cmd), { code: 0, stderr: '' }) });
  assert.equal(out.kind, 'ok');
  assert.deepEqual(calls, ['pkcon']);
  calls = [];
  out = await runLinuxInstall({ plan, packageType: 'deb', blocked: true, run: async (p) => (calls.push(p.cmd), { code: 0, stderr: '' }) });
  assert.equal(out.kind, 'blocked');
  assert.deepEqual(calls, []);
  // sin saberlo de antemano: pkexec lo dice y se pasa a PackageKit en el mismo intento
  calls = [];
  out = await runLinuxInstall({
    plan,
    packageType: 'deb',
    packageKit,
    run: async (p) => (calls.push(p.cmd), p.cmd === 'pkexec' ? { code: 127, stderr: 'pkexec must be setuid root' } : { code: 0, stderr: '' }),
  });
  assert.equal(out.kind, 'ok');
  assert.deepEqual(calls, ['pkexec', 'pkcon']);
});
