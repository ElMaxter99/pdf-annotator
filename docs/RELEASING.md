# Cómo se publica una versión

Este documento tiene **dos partes**: la **Parte A** explica el flujo en lenguaje natural para cualquier persona; la **Parte B** es la checklist exacta para la IA (Claude), que **normalmente es quien ejecuta** todo esto a petición de Maxter. Quien lo haga a mano puede seguir la Parte B igual (los comandos y botones son los mismos).

---

# Parte A · El flujo explicado para personas

## La idea en una frase
Antes de publicar una versión de verdad (por ejemplo la **1.9.0**) se publica una o varias **versiones de prueba** (**1.9.0-rc.1**, **rc.2**…) para instalarlas y probarlas en Windows, macOS y Linux. Cuando una de ellas sale bien, se publica la versión final con el mismo código.

## ¿Hay que hacer siempre una RC?
**No.** Una RC no es una versión distinta, es un **ensayo de la misma versión**: `1.9.0-rc.1` y `1.9.0` llevan el mismo código; la RC solo sirve para instalarlo y probarlo antes de publicar la `1.9.0` de verdad. La versión «normal» (1.9.0) es siempre la que se publica al final.
- **Recomendado (haz RC primero)**: cambios grandes, funcionalidad nueva, cambios en la app de escritorio, el instalador o las actualizaciones. Es el caso de la 1.9.0.
- **Opcional (puedes ir directo a «Release»)**: arreglos pequeños y de bajo riesgo (un texto, un arreglo de CSS, documentación), siempre que la última versión haya salido bien.
- Si una RC sale con fallos no se «arregla»: se saca otra (`rc.2`) y, cuando una sale bien, se publica la final con el mismo número.

## Qué es una *release candidate* (RC)
Es un ensayo general. «Candidata a versión final». Tiene instaladores reales (los mismos archivos que tendría la final), pero GitHub la marca como **pre-release**: no es «la última versión», y los usuarios normales no reciben aviso de ella. Solo la ve quien la busque en la página de [Releases](https://github.com/ElMaxter99/pdf-annotator/releases) o quien haya activado el canal **Pruebas** en la app de escritorio (pie del editor → «Canal de actualizaciones»).

## Los pasos, de principio a fin
1. **Decidir la versión.** Se sube de versión cuando hay cosas nuevas que enseñar. Si solo hay arreglos, se sube el último número (1.9.0 → 1.9.1); si hay funcionalidad nueva, el del medio (1.9.0 → 1.10.0).
2. **Preparar la versión.** Se hace una *pull request* a `develop` que cambia el número de versión y pasa lo que había en «Unreleased» del CHANGELOG a una sección con el número y la fecha. Se fusiona cuando las comprobaciones salen en verde.
3. **Crear la release candidate.** En GitHub → *Actions* → «Release candidate» → *Run workflow* (rama `develop`) y se escribe la versión (`1.9.0`). GitHub, por su cuenta:
   - comprueba que esa versión final no exista ya,
   - elige el número de RC (`rc.1` la primera vez, `rc.2` la siguiente…),
   - pasa los tests, compila los instaladores de Windows, macOS y Linux,
   - y publica la pre-release con las notas del CHANGELOG.
   Tarda unos 10–15 minutos. No cambia ningún archivo del repositorio: solo crea la etiqueta y la release.
4. **Probar la RC.** Se baja el instalador de tu sistema desde [Releases](https://github.com/ElMaxter99/pdf-annotator/releases) y se instala (los instaladores no van firmados: Windows y macOS avisarán, es normal). Se comprueba que abre, que la versión del pie dice `1.9.0-rc.1`, que se carga un PDF, se anota y se exporta, y que lo nuevo de esta versión funciona. Más detalles en `docs/INSTALAR.md`. Cuando ya hay una RC instalada con el canal «Pruebas», las siguientes RC llegan solas como actualización.
5. **Si algo falla.** Se arregla en una PR a `develop` (sin tocar la versión), se fusiona y se vuelve a lanzar «Release candidate» con **la misma versión**: sale `rc.2`. Y así hasta que una salga limpia. Una RC no se borra ni se edita: se saca otra.
6. **Dar por buena una RC.** Maxter dice «vale». Nadie publica la final sin ese visto bueno.
7. **Publicar la versión final.** *Actions* → «Release» → *Run workflow* (rama `develop`). GitHub alinea `develop` y `master`, etiqueta `v1.9.0`, compila los instaladores definitivos, pone las notas y **publica**. A partir de ese momento, las apps instaladas avisan de la actualización.
8. **La web.** La web no se publica sola: Vercel construye una vista previa de la rama `release/v1.9.0`; se revisa y, si está bien, en Vercel → *Deployments* → **Promote to Production**. (Los errores de cuota de Vercel en las PR se ignoran.)

## Preguntas frecuentes
- **¿Puedo saltarme la RC?** Sí, el botón «Release» funciona sin ella, pero no se recomienda: la RC existe para encontrar problemas de instalación antes de que lleguen a todos.
- **¿La RC cambia lo que ve un usuario normal?** No. Nunca aparece como «última versión» y la app en canal Estable la ignora.
- **¿Pasar de «Pruebas» a «Estable» baja de versión?** No. Te quedas en la RC hasta que salga la siguiente versión final.
- **¿Por qué «Release candidate» falla a veces?** Mira la sección de problemas conocidos al final de la Parte B.

---

# Parte B · Checklist para la IA (Claude)

> Lee esto **entero antes de sacar una versión**. Aprobación de Maxter: **solo** para la versión final (paso 7) y la promoción de la web en Vercel (paso 8); las RC se pueden lanzar sin pedirla cuando Maxter ha dicho «saca versión». Nunca fusionar en `master` a mano, ni borrar etiquetas/releases sin aprobación, ni saltarse comprobaciones.

Repositorio: `ElMaxter99/pdf-annotator`. Ramas: `develop` (trabajo) y `master` (estable; la alinea el workflow «Release»). Variable: `X.Y.Z` = versión (solo dígitos).

## 0. Antes de empezar
- [ ] Hay trabajo fusionado en `develop` que justifique versión (`CHANGELOG.md` → *Unreleased* no vacío).
- [ ] Decide `X.Y.Z` (patch = solo arreglos, minor = funcionalidad) y díselo a Maxter si hay duda.
- [ ] **¿RC o directo?** Haz RC (pasos 2–4) si hay funcionalidad nueva, cambios en `desktop/` (Electron, instaladores, actualizador), en los workflows de release o en algo que solo se prueba instalando; también si es la primera versión tras un cambio de proceso. Puedes ir directo al paso 5 (con el visto bueno de Maxter) solo para arreglos pequeños y de bajo riesgo, con la versión anterior sana. Si dudas, haz RC y explícaselo a Maxter. Una RC es un ensayo de la **misma** versión: no se sube el número por cada RC.
- [ ] La rama asignada ya fusionada se reinicia desde `develop` sin forzar: `git fetch origin develop && git switch -C <rama> origin/develop` (un `push --force` puede estar denegado; un push normal avanza si `develop` ya contiene lo viejo).

## 1. Subir la versión (PR a `develop`)
- [ ] `npm run release:deploy -- bump X.Y.Z` (cambia `package.json` y el badge del README).
- [ ] `package-lock.json`: líneas 3 y 9 → `X.Y.Z`. `node scripts/sync-desktop-version.mjs` (copia a `desktop/package.json`).
- [ ] `CHANGELOG.md`: dejar `## Unreleased` vacío y debajo `## [vX.Y.Z](https://github.com/ElMaxter99/pdf-annotator/tree/v.X.Y.Z) - AAAA-MM-DD` con el contenido que había en *Unreleased*.
- [ ] `node scripts/release-notes.mjs X.Y.Z-rc.1 | head` debe mostrar las notas (no «Aún no hay sección»).
- [ ] Commit, push a la rama asignada, PR a `develop` (cuerpo con las 2 líneas de atribución del proyecto).
- [ ] Esperar `build-and-test` **verde**. Snyk, Codex y CodeRabbit fallan por límites de cuenta: se ignoran. Fusionar (merge) con `expectedHeadSha`.

## 2. Lanzar la RC
- [ ] Lanzar: `mcp__github__actions_run_trigger` → `run_workflow`, `workflow_id: release-candidate.yml`, `ref: develop`, `inputs: {"version": "X.Y.Z"}` (o Actions → Release candidate → Run workflow).
- [ ] Qué hace (`.github/workflows/release-candidate.yml` → llama a `desktop-release.yml`): valida `^\d+\.\d+\.\d+$`; falla si `vX.Y.Z` existe; calcula `rc.N` (reutiliza la etiqueta si el HEAD ya la tiene); configura la identidad de git (`github-actions[bot]`) y crea la etiqueta anotada; `verify` (build + tests + e2e), `draft` (crea el borrador una vez, como pre-release), `package` ×4 (windows, macos arm64, macos intel, ubuntu) con la versión de la etiqueta (`scripts/sync-desktop-version.mjs --tag`), `notes` (notas de la sección `X.Y.Z` del CHANGELOG + aviso de prueba) y publica (`publish: true`). **No toca `master`, `package.json` ni el CHANGELOG.**
- [ ] Programar una comprobación a ~6–10 min (`send_later`) y listar jobs: `actions_list` → `list_workflow_jobs` con el id del run. Duración típica 10–15 min.

## 3. Verificar la RC
- [ ] Todos los jobs en `success`; la release `vX.Y.Z-rc.N` existe, **no es borrador** y es *pre-release* (`list_releases`).
- [ ] Tiene los instaladores: Windows `.exe`, macOS `.dmg`/`.zip` (arm64 e Intel), Linux AppImage/`.deb`/`.rpm`, más los `latest*.yml`.
- [ ] Notas con la frase «Versión de prueba» y la sección del CHANGELOG.
- [ ] Si algo falla: leer logs (`get_job_logs`, `failed_only`), arreglar **el workflow o el código en una PR a `develop`** (sin tocar la versión), fusionar con CI verde y volver a lanzar (sale `rc.N+1`). Máximo un re-run por fallo sin causa raíz entendida. No saltar tests ni deshabilitarlos.

## 4. Pasar la RC a Maxter
- [ ] Informar con el formato **Estado / Hecho por Claude / Necesito de ti**: enlace a la pre-release, cómo instalarla (a mano desde Releases, o canal «Pruebas» si ya tiene la 1.9.0 o posterior) y qué probar.
- [ ] Esperar. Si Maxter reporta fallos → paso 3 (arreglo) y nueva RC. **No lanzar la final sin su visto bueno explícito.**

## 5. Versión final (solo con visto bueno de Maxter)
- [ ] `run_workflow` con `workflow_id: release.yml`, `ref: develop`, `inputs` `{"dry_run": "false", "publish": "true"}` (se puede hacer antes un simulacro con `dry_run: "true"`).
- [ ] Qué hace: `scripts/release.mjs --yes` alinea `develop` y `master` (avance rápido o merge de `master` en `develop`; nunca fuerza), crea la rama `release/vX.Y.Z` y la etiqueta `vX.Y.Z`; luego `desktop-release.yml` compila, pone las notas y **publica**. Requiere `package.json`, README (badge) y CHANGELOG ya en `X.Y.Z` (paso 1).
- [ ] Verificar: release `vX.Y.Z` publicada (no borrador, no pre-release) con los instaladores.

## 6. Web (Vercel) — manual y con aprobación
- [ ] Vercel construye la vista previa de `release/vX.Y.Z`. Maxter la valida y hace **Promote to Production** (o lo pide explícitamente). La IA no promociona sin pedirlo.

## 7. Cierre
- [ ] Contar a Maxter el resultado con enlaces. Si se cambió el proceso, actualizar este archivo.

## Problemas conocidos
- **«Committer identity unknown» en el job `tag`**: faltaba `git config user.name/user.email`; ya corregido en `release-candidate.yml` (PR #198). `release.yml` ya lo traía.
- **Etiquetas creadas con `GITHUB_TOKEN` no disparan otros workflows**: por eso `release-candidate.yml` y `release.yml` llaman a `desktop-release.yml` con `workflow_call` en vez de depender del evento de etiqueta.
- **Borradores «untagged» en Releases**: restos de intentos fallidos o de electron-builder; no son versiones. Borrarlos requiere aprobación de Maxter.
- **Un push forzado a la rama asignada puede estar denegado**: usar un push normal tras reiniciar la rama desde `develop`.
- **Instaladores sin firmar**: SmartScreen/Gatekeeper avisan; macOS no se actualiza solo (el aviso lleva a la descarga). Ver `docs/DECISIONS.md` (decisión 13).
- Si `release-candidate.yml` o `release.yml` cambian, dejar este documento al día.
