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

export const CHANNELS = ['stable', 'beta'];
/** Canal guardado → «stable» o «beta»; cualquier otra cosa (archivo roto, valor raro) es «stable». */
export const normalizeChannel = (value) => (value === 'beta' ? 'beta' : 'stable');

/**
 * Respuesta de GitHub (una release o la lista de releases) → { version, url, prerelease } o null.
 * Estable: solo versiones finales (como parseLatestRelease). Pruebas (`prerelease: true`): además las
 * pre-releases «X.Y.Z-rc.N»; entre todas gana la mayor, y la final de X.Y.Z gana a sus RC.
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

export const bytesToMb = (n) => Math.round((Number(n) || 0) / 1048576);
