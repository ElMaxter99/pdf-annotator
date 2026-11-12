// ¿Esta URL pertenece al origen de la app (app://pdf-annotator)? Sin Electron, para poder probarlo.
// OJO: en Node `new URL('app://x/y').origin` vale «null» (esquema no estándar), así que se compara esquema y host.
export function isAppUrl(url, origin) {
  try {
    const a = new URL(url);
    const b = new URL(origin);
    return a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}
