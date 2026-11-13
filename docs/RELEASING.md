# Cómo se publica una versión

> **Quién lo hace:** normalmente lo ejecuta **Claude** (a petición de Maxter, en el hilo del proyecto). Maxter solo decide *cuándo* sacar versión, prueba la release candidate y dice «vale» para la final. Lo de abajo es el procedimiento exacto, por si hay que hacerlo a mano.

Resumen: **subir versión → release candidate (RC) → probar → (más RC si hay fallos) → versión final → web en Vercel.**

## Conceptos
- **Versión final** `vX.Y.Z`: la que ven los usuarios; las apps instaladas avisan de ella.
- **Release candidate** `vX.Y.Z-rc.N`: ensayo con instaladores reales (Windows, macOS, Linux). Se publica como *pre-release* de GitHub: nunca es «última versión» y las apps en canal **Estable** la ignoran. Las apps en canal **Pruebas** (pie del editor → «Canal de actualizaciones») la reciben como actualización.
- Las ramas son `develop` (trabajo) y `master` (estable). Nunca se fusiona nada en `master` a mano: lo alinea el workflow «Release».

## 1. Subir la versión (PR a `develop`)
1. `git switch develop && git pull && git switch -c chore/version-X.Y.Z`
2. `npm run release:deploy -- bump X.Y.Z` (cambia `package.json` y el badge del README).
3. A mano: `package-lock.json` (líneas 3 y 9), `node scripts/sync-desktop-version.mjs` (copia a `desktop/package.json`) y en `CHANGELOG.md` dejar `## Unreleased` vacío y debajo la cabecera `## [vX.Y.Z](https://github.com/ElMaxter99/pdf-annotator/tree/v.X.Y.Z) - AAAA-MM-DD` con lo que estaba en *Unreleased*.
4. PR a `develop`; esperar a `build-and-test` en verde (Snyk, Codex y CodeRabbit pueden fallar por límites de cuenta: no es el código) y fusionar.

## 2. Release candidate
1. GitHub → **Actions → «Release candidate» → Run workflow**, rama `develop`, versión `X.Y.Z`.
2. El workflow (`release-candidate.yml`): comprueba que `vX.Y.Z` no exista, calcula `rc.N` (la primera es `rc.1`; si `develop` no ha cambiado desde la última RC la reutiliza), etiqueta `develop`, ejecuta tests y e2e, compila los instaladores y los sube a una pre-release con las notas de la sección `X.Y.Z` del CHANGELOG. **No toca `master`, `package.json` ni el CHANGELOG**: la versión del instalador sale de la etiqueta (`scripts/sync-desktop-version.mjs --tag`).
3. Seguimiento: la pestaña Actions; al acabar, la pre-release aparece en [Releases](https://github.com/ElMaxter99/pdf-annotator/releases) con los `.exe`, `.dmg`/`.zip`, AppImage, `.deb` y `.rpm`.

## 3. Probar la RC
- **A mano:** descargar el instalador de [Releases](https://github.com/ElMaxter99/pdf-annotator/releases) (guía en `docs/INSTALAR.md`). Los instaladores no están firmados: Windows (SmartScreen) y macOS (Gatekeeper) avisan.
- **Desde la app:** en la app de escritorio, pie del editor → «Canal de actualizaciones» → «Pruebas». Las apps anteriores a 1.9.0 no tienen el selector: la primera RC se instala a mano.
- Comprobar: instala y abre, la versión del pie es `vX.Y.Z-rc.N`, cargar un PDF, anotar, exportar, el aviso de actualización y (si se usa) el ayudante de IA.

## 4. Si hay fallos
Arreglo en una PR a `develop`, fusionar y volver a lanzar «Release candidate» con la misma versión: sale `rc.2`, `rc.3`… Repetir hasta que una RC salga limpia. **No** se sube la versión por cada RC.

## 5. Versión final (solo cuando Maxter da por buena la RC)
1. GitHub → **Actions → «Release» → Run workflow**, rama `develop` (deja `publish` marcado).
2. `release.yml` alinea `develop` y `master`, crea la rama `release/vX.Y.Z` y la etiqueta `vX.Y.Z`, compila los instaladores, pone las notas del CHANGELOG y **publica**. Desde ese momento las apps ya instaladas avisan de la actualización.
   - Simulacro antes: marcar `dry_run`. A mano: `npm run release:guide` y `npm run release:deploy`.
3. **Web (Vercel):** a mano. Vercel construye la vista previa de `release/vX.Y.Z`; validarla y, si está bien, *Deployments → Promote to Production*. Los errores de cuota de Vercel en las PR se ignoran.

## Reglas
- Pedir aprobación de Maxter antes de la versión final y de cualquier promoción de la web; las RC pueden lanzarse sin pedirla si él ha dicho que se saque versión.
- No fusionar en `master` a mano, no borrar etiquetas ni releases sin aprobación.
- Si algo falla en el workflow, arreglar el workflow en una PR (no saltarse comprobaciones) y relanzar.
