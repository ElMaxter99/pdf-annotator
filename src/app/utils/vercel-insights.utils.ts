/** Hosts servidos por Vercel, los únicos donde existen los scripts de `/_vercel/*` (D2 de la 1.17). */
export const VERCEL_HOST_SUFFIXES = ['.vercel.app'];

/**
 * Vercel Analytics y Speed Insights solo se cargan cuando la app se sirve desde Vercel: en Docker, en local o en
 * la app de escritorio esos scripts no existen y solo dejan errores de MIME en la consola.
 */
export function shouldLoadVercelInsights(hostname: string, isDesktop: boolean): boolean {
  if (isDesktop) return false;
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  return VERCEL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
}
