// PDF Annotator · proceso principal de Electron: ventana, web empaquetada (app://), ayudante de IA y actualizaciones.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell, Menu } from 'electron';
import electronUpdater from 'electron-updater';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RELEASES_URL, REPO, classifyInstallError, installDetail, installNeedsPassword, isNewer, normalizeChannel, parseReleaseForChannel, updateMode } from './update-logic.mjs';
import { resolvePath } from './shell-path.mjs';
import { isAppUrl } from './trusted-origin.mjs';
import { setupProjectsIpc } from './projects-ipc.mjs';
import { goInHistory, historyDirectionForCommand, historyDirectionForKey } from './history-nav.mjs';

const { autoUpdater } = electronUpdater;
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'app://pdf-annotator';
const PREFERRED_PORT = 4310;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const webRoot = process.env.PDF_ANNOTATOR_WEB || (app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(here, '..', 'dist', 'pdf-annotator', 'browser'));
const toolsRoot = app.isPackaged ? path.join(process.resourcesPath, 'tools') : path.join(here, '..', 'tools');

/** El puerto 4310 si está libre; si no (otro ayudante, otra app), uno libre que elige el sistema. */
function freePort(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(port === 0 ? 0 : freePort(0)));
    probe.listen(port, '127.0.0.1', () => {
      const { port: got } = probe.address();
      probe.close(() => resolve(got));
    });
  });
}
const HELPER_PORT = await freePort(PREFERRED_PORT);
const CSP = `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; connect-src 'self' blob: data: http://127.0.0.1:${HELPER_PORT}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let helper = null;

// ───────── Web empaquetada ─────────
function resolveWebFile(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const full = path.resolve(webRoot, rel);
  if (full !== webRoot && !full.startsWith(webRoot + path.sep)) return null;
  const candidates = [full, path.join(full, 'index.html')];
  for (const c of candidates) if (existsSync(c) && statSync(c).isFile()) return c;
  if (path.extname(rel)) return null; // un recurso que no existe: 404, no la SPA
  for (const name of ['index.csr.html', 'index.html']) {
    const f = path.join(webRoot, name);
    if (existsSync(f)) return f;
  }
  return null;
}

function registerWebProtocol() {
  protocol.handle('app', async (request) => {
    const { host, pathname } = new URL(request.url);
    if (host !== 'pdf-annotator') return new Response('Not found', { status: 404 });
    const file = resolveWebFile(pathname);
    if (!file) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', CSP);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(res.body, { status: res.status, headers });
  });
}

// ───────── Ayudante de IA ─────────
async function startHelper() {
  const server = path.join(toolsRoot, 'ai-helper', 'server.mjs');
  if (!existsSync(server)) return console.warn('[desktop] No se encuentra el ayudante de IA:', server);
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', AI_HELPER_PORT: String(HELPER_PORT), AI_HELPER_ORIGINS: ORIGIN, PATH: await resolvePath() };
  helper = spawn(process.execPath, [server], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  helper.stdout.on('data', (d) => process.stdout.write(`[ia] ${d}`));
  helper.stderr.on('data', (d) => process.stderr.write(`[ia] ${d}`));
  helper.on('exit', (code) => {
    console.warn('[desktop] El ayudante de IA terminó con código', code);
    helper = null;
  });
}
const stopHelper = () => {
  if (helper) helper.kill();
  helper = null;
};

// ───────── Actualizaciones ─────────
// electron-builder deja «package-type» («deb», «rpm»…) en los recursos de los paquetes de Linux; electron-updater lo usa para instalar.
const packageType = (() => {
  try {
    return readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
  } catch {
    return null;
  }
})();
const mode = updateMode({ platform: process.platform, appImage: Boolean(process.env.APPIMAGE), packageType, macSigned: false });
// Canal de actualizaciones («stable» por defecto, «beta» = también versiones de prueba RC). Se guarda en la carpeta de datos de la app.
const settingsFile = path.join(app.getPath('userData'), 'update-channel.json');
const loadChannel = () => {
  try {
    return normalizeChannel(JSON.parse(readFileSync(settingsFile, 'utf8')).channel);
  } catch {
    return 'stable';
  }
};
let channel = loadChannel();
const needsPassword = installNeedsPassword({ platform: process.platform, appImage: Boolean(process.env.APPIMAGE), packageType });
const updateLog = path.join(app.getPath('userData'), 'update.log');
const logUpdate = (line) => {
  try {
    appendFileSync(updateLog, `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* sin log: no pasa nada */
  }
};
// Marca de «se acaba de actualizar»: se escribe justo antes de instalar y se lee al arrancar con la versión nueva.
const updatedFile = path.join(app.getPath('userData'), 'just-updated.json');
const readJustUpdated = () => {
  try {
    const { from, to } = JSON.parse(readFileSync(updatedFile, 'utf8'));
    rmSync(updatedFile, { force: true });
    return to === app.getVersion() && typeof from === 'string' ? from : undefined;
  } catch {
    return undefined;
  }
};
let state = { status: 'idle', mode, current: app.getVersion(), channel, needsPassword, justUpdatedFrom: readJustUpdated() };
let cancelToken = null;
const setState = (patch) => {
  state = { ...state, ...patch };
  if (win && !win.isDestroyed()) win.webContents.send('desktop:update:state', state);
};
const setError = (err) => {
  console.warn('[desktop] actualización:', err?.message || err);
  logUpdate(`error (${state.status}): ${err?.message || err}`);
  // Si falla la instalación, la descarga sigue en disco: se vuelve a «lista» con el motivo, no a un error genérico.
  if (state.status === 'installing') {
    rmSync(updatedFile, { force: true });
    return setState({ status: 'ready', installError: classifyInstallError(err?.message), installDetail: installDetail(err?.message, os.homedir()) });
  }
  setState({ status: 'error', error: 'update' });
};

const releasesApi = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/releases`;
const releaseApi = () => process.env.PDF_ANNOTATOR_RELEASE_API || (channel === 'beta' ? `${releasesApi}?per_page=30` : `${releasesApi}/latest`);

async function checkManual() {
  const res = await net.fetch(releaseApi(), { headers: { accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const latest = parseReleaseForChannel(await res.json(), { prerelease: channel === 'beta' });
  if (latest && isNewer(app.getVersion(), latest.version)) {
    setState({ status: 'available', version: latest.version, prerelease: latest.prerelease, notesUrl: latest.url, error: undefined });
  }
}

async function checkForUpdates() {
  if (['downloading', 'ready', 'installing'].includes(state.status) || state.checking) return;
  if (!app.isPackaged && !process.env.PDF_ANNOTATOR_UPDATE_URL && !process.env.PDF_ANNOTATOR_RELEASE_API) return;
  setState({ checking: true });
  try {
    if (mode === 'manual') await checkManual();
    else await autoUpdater.checkForUpdates();
    setState({ lastChecked: Date.now() });
  } catch (e) {
    console.warn('[desktop] comprobación de versión:', e?.message || e); // sin red: sin ruido
  } finally {
    setState({ checking: false });
  }
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = channel === 'beta';
  autoUpdater.allowDowngrade = false;
  if (process.env.PDF_ANNOTATOR_UPDATE_URL) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: process.env.PDF_ANNOTATOR_UPDATE_URL });
  }
  autoUpdater.on('update-available', (info) =>
    setState({ status: 'available', version: info.version, prerelease: /-rc\.\d+$/.test(info.version), notesUrl: `${RELEASES_URL}/tag/v${info.version}`, error: undefined }),
  );
  autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', percent: Math.round(p.percent), transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded', () => setState({ status: 'ready' }));
  autoUpdater.on('error', setError);
}

function trusted(event) {
  return isAppUrl(event.senderFrame?.url, ORIGIN);
}
let projects = null;
function setupIpc() {
  const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => (trusted(event) ? fn(...args) : undefined));
  projects = setupProjectsIpc({ handle, app, dialog, getWindow: () => win });
  // El bloqueo de cada proyecto abierto se renueva cada minuto (caduca a los 10 sin señales).
  setInterval(() => projects?.renewAll(), 60 * 1000).unref();
  ipcMain.on('desktop:helper-port', (event) => {
    event.returnValue = HELPER_PORT;
  });
  handle('desktop:update:get', () => state);
  handle('desktop:update:check', () => checkForUpdates());
  handle('desktop:update:download', async () => {
    if (mode !== 'auto' || state.status !== 'available') return;
    setState({ status: 'downloading', percent: 0, transferred: 0, total: 0 });
    try {
      const { CancellationToken } = electronUpdater;
      cancelToken = new CancellationToken();
      await autoUpdater.downloadUpdate(cancelToken);
    } catch (e) {
      if (cancelToken?.cancelled) setState({ status: 'available', percent: undefined });
      else setError(e);
    } finally {
      cancelToken = null;
    }
  });
  handle('desktop:update:set-channel', (next) => {
    const value = normalizeChannel(next);
    if (value === channel) return;
    channel = value;
    autoUpdater.allowPrerelease = channel === 'beta';
    try {
      writeFileSync(settingsFile, JSON.stringify({ channel }));
    } catch (e) {
      console.warn('[desktop] no se pudo guardar el canal:', e?.message || e);
    }
    // Una descarga en curso o ya lista sigue su camino; si no, se vuelve a mirar con el canal nuevo.
    if (['downloading', 'ready', 'installing'].includes(state.status)) return setState({ channel });
    setState({ channel, status: 'idle', version: undefined, prerelease: undefined, notesUrl: undefined, error: undefined });
    return checkForUpdates();
  });
  handle('desktop:update:cancel', () => cancelToken?.cancel());
  handle('desktop:update:install', async () => {
    if (state.status !== 'ready') return;
    // La instalación en Linux es síncrona y bloquea el proceso principal: primero se pinta «Instalando» y se da un respiro.
    setState({ status: 'installing', installError: undefined, installDetail: undefined, justUpdatedFrom: undefined });
    logUpdate(`instalando ${state.version} (desde ${app.getVersion()})`);
    try {
      writeFileSync(updatedFile, JSON.stringify({ from: app.getVersion(), to: state.version }));
    } catch {
      /* sin aviso de «se actualizó» */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    stopHelper();
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      setError(e);
    }
  });
  handle('desktop:update:dismiss-updated', () => setState({ justUpdatedFrom: undefined }));
  handle('desktop:update:install-on-quit', () => {
    if (state.status !== 'ready') return;
    autoUpdater.autoInstallOnAppQuit = true;
    setState({ installOnQuit: true });
  });
  handle('desktop:update:open-release', () => shell.openExternal(state.notesUrl?.startsWith(RELEASES_URL) ? state.notesUrl : RELEASES_URL));
}

// ───────── Menú ─────────
// Ayuda → «Buscar actualizaciones…» y «Acerca de» abren el panel de versión en la pantalla actual (también en Windows y Linux).
const MENU_TEXT = {
  es: { file: 'Archivo', quit: 'Salir', edit: 'Edición', help: 'Ayuda', about: 'Acerca de PDF Annotator', check: 'Buscar actualizaciones…', notes: 'Notas de la versión' },
  en: { file: 'File', quit: 'Quit', edit: 'Edit', help: 'Help', about: 'About PDF Annotator', check: 'Check for updates…', notes: 'Release notes' },
};
function buildMenu() {
  const t = MENU_TEXT[app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en'];
  const openPanel = (check) => {
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send('desktop:update:open-panel', { check });
  };
  const help = {
    label: t.help,
    role: 'help',
    submenu: [
      { label: t.about, click: () => openPanel(false) },
      { label: t.check, accelerator: 'CmdOrCtrl+U', click: () => openPanel(true) },
      { label: t.notes, click: () => shell.openExternal(RELEASES_URL) },
    ],
  };
  const mac = process.platform === 'darwin';
  return Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : [{ label: t.file, submenu: [{ label: t.quit, role: 'quit' }] }]),
    { label: t.edit, role: 'editMenu' },
    ...(mac ? [viewMenu(), { role: 'windowMenu' }] : []),
    help,
  ]);
}

// ───────── Ventana ─────────
function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#1e1e2f',
    title: 'PDF Annotator',
    icon: path.join(here, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  // El pellizco no debe escalar la interfaz: el zoom es el del PDF (lo gestiona la web).
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, ORIGIN)) {
      event.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  // Atrás / Adelante como en el navegador: teclado, botones laterales del ratón y gesto de deslizar.
  const go = (direction) => direction !== 0 && goInHistory(win.webContents.navigationHistory, direction);
  win.webContents.on('before-input-event', (event, input) => {
    if (go(historyDirectionForKey(input, process.platform))) event.preventDefault();
  });
  win.on('app-command', (_event, command) => go(historyDirectionForCommand(command)));
  win.on('swipe', (_event, direction) => go(historyDirectionForCommand(direction)));
  win.on('closed', () => (win = null));
  win.loadURL(`${ORIGIN}/landing`);
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on('before-quit', () => {
  projects?.releaseAll();
  stopHelper();
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
  if (!win) createWindow();
});

// Sin los roles de zoom de página: «Acercar/Alejar/Tamaño real» mueven el zoom del PDF.
// `registerAccelerator: false` deja que la tecla llegue a la web; el clic en el menú usa el IPC.
function viewMenu() {
  const zoom = (command) => () => win?.webContents.send('desktop:zoom', command);
  const item = (label, accelerator, command) => ({ label, accelerator, registerAccelerator: false, click: zoom(command) });
  return {
    label: 'View',
    submenu: [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      item('Actual Size', 'CmdOrCtrl+0', 'reset'),
      item('Zoom In', 'CmdOrCtrl+Plus', 'in'),
      item('Zoom Out', 'CmdOrCtrl+-', 'out'),
      { type: 'separator' },
      { role: 'togglefullscreen' },
    ],
  };
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  Menu.setApplicationMenu(buildMenu());
  registerWebProtocol();
  setupUpdater();
  setupIpc();
  startHelper();
  createWindow();
  setTimeout(checkForUpdates, 4000);
  setInterval(checkForUpdates, CHECK_EVERY_MS);
});
