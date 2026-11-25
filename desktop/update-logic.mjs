// Lógica pura del actualizador (sin Electron): comparar versiones, elegir modo y leer la última release.
export const REPO = { owner: 'ElMaxter99', repo: 'pdf-annotator' };
export const RELEASES_URL = `https://github.com/${REPO.owner}/${REPO.repo}/releases`;

/** «1.6.0», «v1.6.0» o «1.6.0-beta.1» → { nums, pre } o null si no es una versión. */
export function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(text ?? '').trim());
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ?? null };
}

/** <0 si a<b, 0 si iguales, >0 si a>b. Una versión con prerelease es anterior a la misma sin ella. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) throw new Error('Versión no válida');
  for (let i = 0; i < 3; i++) if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return 1;
  if (pb.pre === null) return -1;
  const xs = pa.pre.split('.');
  const ys = pb.pre.split('.');
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1;
    if (ys[i] === undefined) return 1;
    const nx = /^\d+$/.test(xs[i]);
    const ny = /^\d+$/.test(ys[i]);
    if (nx && ny && Number(xs[i]) !== Number(ys[i])) return Number(xs[i]) - Number(ys[i]);
    if (nx !== ny) return nx ? -1 : 1;
    if (!nx && xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1;
  }
  return 0;
}

export const isNewer = (current, candidate) => {
  try {
    return compareVersions(candidate, current) > 0;
  } catch {
    return false;
  }
};

/**
 * «auto»: la app descarga e instala sola (Windows NSIS, Linux AppImage, .deb y .rpm; estos dos piden la
 * contraseña con el diálogo del sistema al instalar).
 * «manual»: el botón abre la página de descargas (macOS sin firmar y Linux sin formato reconocido).
 */
export function updateMode({ platform, appImage = false, packageType = null, macSigned = false }) {
  if (platform === 'win32') return 'auto';
  if (platform === 'darwin') return macSigned ? 'auto' : 'manual';
  if (platform === 'linux') return appImage || packageType === 'deb' || packageType === 'rpm' ? 'auto' : 'manual';
  return 'manual';
}

/** Respuesta de GET /repos/:o/:r/releases/latest → { version, url } o null (borrador, prerelease, datos raros). */
export function parseLatestRelease(json) {
  if (!json || typeof json !== 'object' || json.draft === true || json.prerelease === true) return null;
  const parsed = parseVersion(json.tag_name);
  if (!parsed || parsed.pre) return null;
  const version = parsed.nums.join('.');
  const prefix = `${RELEASES_URL}/`;
  const url = typeof json.html_url === 'string' && json.html_url.startsWith(prefix) ? json.html_url : `${prefix}tag/v${version}`;
  return { version, url };
}

export const CHANNELS = ['stable', 'latest'];
/** Canal guardado → «stable» (solo estables) o «latest» (últimas); «beta» es el nombre antiguo de «latest». Cualquier otra cosa (archivo roto, valor raro) es «stable». */
export const normalizeChannel = (value) => (value === 'latest' || value === 'beta' ? 'latest' : 'stable');

/**
 * Respuesta de GitHub (una release o la lista de releases) → { version, url, prerelease } o null.
 * Solo estables: solo versiones finales (como parseLatestRelease). Últimas (`prerelease: true`): además las
 * pre-releases «X.Y.Z-rc.N»; entre todas gana la mayor (la última publicada, sea RC o estable) y la final de X.Y.Z gana a sus RC.
 */
export function parseReleaseForChannel(json, { prerelease = false } = {}) {
  const list = Array.isArray(json) ? json : [json];
  const prefix = `${RELEASES_URL}/`;
  let best = null;
  for (const item of list) {
    if (!item || typeof item !== 'object' || item.draft === true) continue;
    const parsed = parseVersion(item.tag_name);
    if (!parsed) continue;
    if (parsed.pre !== null && !(prerelease && /^rc\.\d+$/.test(parsed.pre))) continue;
    const version = parsed.nums.join('.') + (parsed.pre ? `-${parsed.pre}` : '');
    const url = typeof item.html_url === 'string' && item.html_url.startsWith(prefix) ? item.html_url : `${prefix}tag/v${version}`;
    if (!best || compareVersions(version, best.version) > 0) best = { version, url, prerelease: parsed.pre !== null };
  }
  return best;
}

/**
 * Versión elegida → feed «generic» de esa release y nombre del canal de electron-updater. electron-updater con
 * `allowPrerelease` solo acepta etiquetas del mismo canal que la versión instalada (desde una «-rc.N» nunca ve la final),
 * así que en «Últimas» se fija la etiqueta elegida y el archivo de canal que le corresponde (`rc.yml` o `latest.yml`).
 */
export function feedForVersion(version) {
  const parsed = parseVersion(version);
  if (!parsed) return null;
  const clean = parsed.nums.join('.') + (parsed.pre ? `-${parsed.pre}` : '');
  return { url: `${RELEASES_URL}/download/v${clean}/`, channel: parsed.pre ? String(parsed.pre).split('.')[0] : 'latest' };
}

export const bytesToMb = (n) => Math.round((Number(n) || 0) / 1048576);

/**
 * Mensaje de un fallo al instalar → «cancelled» (el usuario cerró o canceló el cuadro de contraseña del sistema:
 * pkexec/sudo terminan con 126 o 127) o «failed» (cualquier otro).
 */
export function classifyInstallError(message) {
  const text = String(message ?? '');
  if (/\b(status|code|exit(?:ed)?(?: with)?(?: code)?)\W{0,3}(126|127)\b/i.test(text) || /dismissed|cancel+ed|not authorized|authentication (?:was )?(?:canceled|cancelled|failed)/i.test(text)) return 'cancelled';
  return 'failed';
}

/** Recorta y limpia el motivo técnico que se muestra y se copia (una línea, sin rutas del usuario, máx. 300). */
export function installDetail(message, home = '') {
  let text = String(message ?? '').replace(/\s+/g, ' ').trim();
  if (home) text = text.split(home).join('~');
  return text.length > 300 ? `${text.slice(0, 297)}…` : text;
}

/** ¿La instalación pedirá contraseña? Solo en Linux con .deb/.rpm (AppImage se sustituye sin pedirla). */
export const installNeedsPassword = ({ platform, appImage = false, packageType = null }) =>
  platform === 'linux' && !appImage && (packageType === 'deb' || packageType === 'rpm');

/** `updaterCacheDirName` del `app-update.yml` que deja electron-builder (o null). Solo un nombre de carpeta, nunca una ruta. */
export function updaterCacheDirName(yml) {
  const m = /^updaterCacheDirName:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m.exec(String(yml ?? ''));
  const name = m?.[1]?.trim();
  return name && !/[\\/]|^\.\.?$/.test(name) ? name : null;
}

/**
 * Tras instalar una versión, el instalador descargado se queda en `<caché>/<updaterCacheDirName>/pending`
 * (electron-updater solo vacía esa carpeta al descargar la siguiente). Se borra al arrancar una versión distinta
 * de la última que arrancó, así no ocupa espacio hasta la próxima actualización.
 */
export const shouldCleanPendingUpdate = (lastVersion, currentVersion) =>
  typeof lastVersion === 'string' && lastVersion.trim() !== '' && lastVersion.trim() !== currentVersion;

// ───────── Instalar tras cancelar la contraseña o el permiso (1.17) ─────────

/**
 * Comando para instalar el paquete descargado en Linux .deb/.rpm con UNA sola ventana de contraseña (`pkexec`).
 * electron-updater encadena un `apt-get -f` (otra contraseña) cuando `dpkg` falla, también si se cancela: aquí no.
 * `has(cmd)` dice si un programa existe. Devuelve `{ cmd, args }` o null si no hay forma (se usa el instalador de siempre).
 */
export function linuxInstallCommand({ packageType, file, has }) {
  if (!file || !has('pkexec')) return null;
  if (packageType === 'deb' && has('dpkg')) return { cmd: 'pkexec', args: ['dpkg', '-i', file] };
  if (packageType === 'rpm') {
    if (has('dnf')) return { cmd: 'pkexec', args: ['dnf', 'install', '-y', file] };
    if (has('zypper')) return { cmd: 'pkexec', args: ['zypper', '--non-interactive', 'install', '--allow-unsigned-rpm', file] };
    if (has('rpm')) return { cmd: 'pkexec', args: ['rpm', '-U', '--replacepkgs', file] };
  }
  return null;
}

/** Arreglo de dependencias tras un `dpkg -i` que falló por ellas (solo si la persona ya dio la contraseña). */
export const linuxFixDepsCommand = () => ({ cmd: 'pkexec', args: ['apt-get', 'install', '-f', '-y'] });

/**
 * Entorno para lanzar `pkexec` desde la app: el de la sesión, sin las variables propias de Electron/Node que se
 * heredarían en el proceso privilegiado o que confunden a polkit (la ventana de contraseña la dibuja el agente de la sesión).
 */
export function privilegedEnv(env = {}) {
  const out = { ...env };
  for (const key of Object.keys(out)) if (/^(ELECTRON_|NODE_OPTIONS$|APPIMAGE|APPDIR$|CHROME_DESKTOP$)/.test(key)) delete out[key];
  return out;
}

/**
 * Resultado de `pkexec …`: `ok`, `cancelled` (126 = ventana cerrada o cancelada, 127 = no autorizado), `deps`
 * (dpkg instaló a medias por dependencias que faltan) o `failed`.
 */
export function classifyPkexecResult({ code, stderr = '' }) {
  if (code === 0) return 'ok';
  // Sin agente de polkit (o sin sesión gráfica) pkexec sale con 126/127 SIN haber pedido nada: no es una cancelación.
  if (code === -1 || /no authentication agent|error getting authority|cannot open display|failed to connect|command not found|no such file/i.test(String(stderr))) return 'failed';
  if (code === 126 || code === 127) return 'cancelled';
  if (/dependency problems|dependencias|depends on .* however/i.test(String(stderr))) return 'deps';
  return 'failed';
}

/**
 * Un intento de instalación en Linux: `pkexec` con el paquete y, solo si `dpkg` falló por dependencias tras dar la
 * contraseña, el arreglo con `apt-get -f`. `run({ cmd, args })` → `{ code, stderr }`. Devuelve `{ kind, result }`
 * con kind `ok` | `cancelled` | `failed`. Cancelar NO lanza una segunda ventana.
 */
export async function runLinuxInstall({ plan, packageType, run }) {
  let result = await run(plan);
  let kind = classifyPkexecResult(result);
  if (kind === 'deps' && packageType === 'deb') {
    result = await run(linuxFixDepsCommand());
    kind = classifyPkexecResult(result) === 'ok' ? 'ok' : 'failed';
  }
  return { kind: kind === 'deps' ? 'failed' : kind, result };
}

/** Comillas simples de PowerShell: se doblan las que haya dentro. */
export const psQuote = (text) => `'${String(text).replace(/'/g, "''")}'`;

/**
 * Windows con la app en una carpeta que pide permiso de administrador: lanza el instalador con el aviso de Windows (UAC)
 * y espera; si el permiso se cancela o el instalador falla, vuelve a abrir la app con `--update-cancelled` para ofrecer
 * «Pedir permiso otra vez» en lugar de dejar a la persona sin app.
 */
export function windowsElevatedLaunch({ installer, exe, args = ['--updated', '--force-run'] }) {
  const list = args.map(psQuote).join(',');
  const reopen = `Start-Process -FilePath ${psQuote(exe)} -ArgumentList '--update-cancelled'`;
  const script = `try { $p = Start-Process -FilePath ${psQuote(installer)} -ArgumentList ${list} -Verb RunAs -Wait -PassThru -ErrorAction Stop; if ($p.ExitCode -ne 0) { ${reopen} } } catch { ${reopen} }`;
  return { cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script] };
}
