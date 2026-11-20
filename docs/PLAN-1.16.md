# Plan de la 1.16 · «Cierre de pendientes»

Estado: **alcance validado por Maxter (2026-11-19). Nada de la 1.16 está programado salvo T1.** Este archivo es autocontenido: está pensado para pasárselo a una sesión de Claude que lance **varios agentes en paralelo**. Cada tarea indica sus archivos, sus dependencias, si puede ir en paralelo y su criterio de hecho.

La 1.15 «Solidez» (refactor, `workspace.page.ts` en 5.811 líneas) ya está en `CHANGELOG.md`. La 1.16 es de cierre: verificación, rendimiento invisible, una función visible pequeña (con diseño previo) y decisiones pendientes de Maxter.

## 0. Reglas para TODOS los agentes (no negociables)

1. **Nunca fusionar** en `develop` ni en `main`/`master` (ni PRs propias ni ajenas). Abre la PR hacia `develop` y avisa a Maxter.
2. **Nunca publicar** una versión (RC, final, Vercel). Disparar `release-candidate.yml` o `release.yml` es publicar. Aprobar un diseño o una PR no es permiso para publicar. La subida de versión a 1.16.0 y la publicación solo cuando Maxter lo pida expresamente.
3. **Diseño primero:** nada que cambie lo que se ve (pantallas, flujos, textos) se programa sin diseño aprobado por Maxter (mesas `P-NN` en el lienzo de claude.ai; ver `design/README.md` y `docs/WORKFLOW.md`). Lo invisible avanza sin esperar. Última mesa usada: **P-105**; la siguiente, P-106.
4. No borrar cosas ni decidir producto sin aprobación. Investigar, programar en ramas, abrir PRs y arreglar el CI no necesitan permiso.
5. Una rama y una PR por tarea (nombre `claude/<tarea>`; si tu entorno impone otra rama, úsala). No hagas push a ramas ajenas.
6. **Antes de empezar** lee `AGENTS.md`, `docs/ARCHITECTURE.md` y `docs/DECISIONS.md`. `workspace.page.ts` es enorme: usa `Grep` para el método concreto.
7. **«Hecho» por PR:** `npm run build`, `npm run test:ci` y `npm run e2e` en verde; `npm run i18n:check` si cambia un texto (7 idiomas); línea en `CHANGELOG.md` → *Unreleased*; `docs/ROADMAP.md` al día; tema claro revisado si cambian estilos; 1650 y 1280 px. Si fallan tests, relanza solo los que fallan mientras arreglas.
8. Textos y comentarios en español; commits en el idioma de `git log`.
9. Cada actualización a Maxter acaba con **Estado / Hecho por Claude / Necesito de ti**.
10. Cuerpo de PR: usar la plantilla del repo si existe y empezar con las líneas de atribución que pida el proyecto.

## 1. Estado verificado en el código (2026-11-19)

| Se creía | Realidad |
| --- | --- |
| Atajos, pruebas de coordenadas y OnPush pendientes | Hechos en la 1.13 (`utils/shortcuts.utils.ts`, `pdf-coords.utils.ts`, `annotation-import.service.spec.ts`, OnPush en los 10 subcomponentes `[vm]` y la página) |
| Tope por proyecto pendiente | **Implementado**: `ProjectLimits` en `services/project-store.service.ts` (`maxPdfs: 200`, `warnPdfs: 100`, 2 GB, aviso a 1 GB), `projectSize()` en `utils/project.utils.ts`, avisos en `pages/projects/projects.page.html`. Falta solo el visto bueno de Maxter |
| Chip «Desenlazar» del zoom A/B pendiente | **Existe**: `toggleSplitLink`, señal `splitLinked`, tecla `L`, `unlinkedSplit` en footer y visor |
| Gestos de lienzo | Entraron Ctrl/⌘+rueda, pellizco, mover con Espacio o botón central, Mayús+rueda y zoom en vista «Dividida». Atajos de vista ya existentes: `0` = ajustar al ancho, `Ctrl/⌘+0` = 100 % (README y diálogo de atajos), `Mayús+1` = ajustar a la página. **Falta el doble clic** (cero `dblclick` en `src/`) |
| Seguir partiendo `workspace.page.ts` | **Descartado**: no quedan bloques seguros (lo que resta está acoplado al DOM y a `render()`) |

GitHub: 0 PRs y 0 issues abiertos. Tests: 62 specs unitarios y 30 e2e.

## 2. Mapa de paralelismo

| Tarea | Qué | Diseño | Depende de | Paralelo con | Zona de archivos |
| --- | --- | --- | --- | --- | --- |
| **T1** | ROADMAP al día | No | — | todo | `docs/ROADMAP.md` (**hecha en la PR de este plan**) |
| **T2** | Verificar `start:docker` | No | — | todo | `Dockerfile`, `nginx.conf`, `scripts/docker-up.sh`, `docs/TESTING.md` |
| **T3** | Doble clic ajustar/100 % | **Sí (P-106)** | aprobación de la mesa | T2, T4a–T4c, T5 (con cuidado en `styles.scss`/i18n) | `workspace.page.ts`, `utils/zoom.utils.ts`, `utils/shortcuts.utils.ts`, `shortcuts-dialog`, 7 JSON, README, `e2e/zoom-gestures.spec.ts` |
| **T4a** | OnPush: hojas pequeñas | No | — | T2, T3, T4b, T5 | `components/{language-selector,ai-model-select,update-*}`, `workspace/components/{first-steps,shortcuts-dialog}` |
| **T4b** | OnPush: diálogos | No | — | T2, T3, T4a, T5 | `templates-export-dialog`, `export-samples-dialog`, `migration/ai-details`, `page-map-batch-dialog` |
| **T4c** | OnPush: `ai-batch/*` y landing | No | — | T2, T3, T4a, T4b | `pages/batch/ai-batch/*`, `pages/landing/landing.page.ts` |
| **T4d** | OnPush: `batch.page.ts` | No | **T4b y T4c fusionadas** (comparten hijos) | T2, T3, T5 | `pages/batch/batch.page.ts` (+ su `.html`) |
| **T5** | Auditoría axe (informe) | Solo si hay cambios visibles | — | todo salvo cambios en `styles.scss` simultáneos | nuevos: `scripts/` o `e2e/a11y.*`; informe en `docs/` |
| **T6** | Créditos de Copilot | Solo un texto | **Maxter** (su cuenta) | todo | `docs/IA-LOCAL.md`, claves `batch.ai.*` |
| **T7** | Cerrar decisión del tope | No | **Maxter** | todo | `docs/DECISIONS.md` |
| **T8** | Cifrado opcional | **Sí (mesas)** | **Maxter decide** | — | fuera de la 1.16 salvo aprobación |
| **T9** | Vercel de la 1.15 | — | **Maxter lo pide** | — | no es desarrollo |

**Conflictos esperables entre PRs paralelas** (resuélvelos al rebasar, no al fusionar tú):
- `CHANGELOG.md` (*Unreleased*) y `docs/ROADMAP.md`: todas añaden una línea; conflicto trivial. Cada agente añade su línea al final de su sección.
- Los 7 `translations/*.json`: solo T3 (y T5 si hay textos). No las toquéis dos agentes a la vez.
- `styles.scss`: T3 y T5; coordinar o secuenciar.
- `workspace.page.ts`: solo T3 lo toca; ningún otro agente debe editarlo.
- T4a/T4b/T4c no comparten archivos: seguras en paralelo. T4d va después de ellas.

## 3. Tareas

### T1 · ROADMAP al día — HECHA en esta PR
`docs/ROADMAP.md`: la 1.15 deja de estar «en curso», se retiran las cifras de líneas viejas y el tope y el chip Desenlazar pasan a «hechos». Sin cambios de código.

### T2 · Verificar `start:docker`
- **Contexto:** `Dockerfile` ya usa `nginxinc/nginx-unprivileged:1.31-alpine` (`USER nginx`, `EXPOSE 8080`); `scripts/docker-up.sh` publica el puerto 4444 del host. AGENTS.md dice «NGINX en 4444». Nunca se probó (no hay Docker en el entorno de Claude).
- **Hacer:** si hay Docker, `npm run start:docker`; comprobar que el mapeo es `4444:8080` (revisar el compose), rutas SPA y recarga en `/workspace`, MIME de `.mjs`, cabeceras/CSP de `nginx.conf` y que carga el worker de pdf.js.
- **Sin Docker:** añadir a `docs/TESTING.md` un guion de verificación de 6 pasos y pedírselo a Maxter; no inventes resultados.
- **Hecho:** informe de lo comprobado (o guion) y, si algo falla, PR con el arreglo en `Dockerfile`/`nginx.conf` con el CHANGELOG.

### T3 · Doble clic para alternar «ajustar» y 100 % (única función visible)
- **HECHA (2026-11-20):** mesa P-106 aprobada con lo recomendado (`Ctrl/⌘` + clic en zona vacía ya no crea anotación; alterna con el ajuste al **ancho**; en «Dividida» actúa sobre el panel bajo el puntero). Implementada con `toggleFitActual` en `workspace.page.ts` y la regla pura de `utils/zoom.utils.ts`. Sin cambios en `shortcuts.utils.ts`: es un gesto del ratón, no un atajo de teclado.
- **Actualización 2026-11-20:** Maxter eligió el gesto **A** (botón central o `Ctrl/⌘` + doble clic). Propuesta escrita en `design/propuestas/doble-clic-ajustar-zoom.md`; falta la mesa P-106 en el lienzo y su aprobación. Pregunta abierta: hoy `Ctrl/⌘` + clic en zona vacía crea una anotación. **La versión 1.16 espera a T3** (decisión de Maxter).
- **Bloqueada por diseño.** Primero **mesa P-106** (escritorio 1650 y 1280, oscuro y claro): gesto, feedback y cómo se descubre. Decisión pendiente de Maxter: «botón central o `Ctrl`+doble clic en zona vacía» (propuesta de `plan/propuesta-gestos-de-lienzo.md`) frente a doble clic normal, que choca con crear anotación al hacer clic. **No se reasignan los atajos existentes** (`Ctrl/⌘+0` sigue siendo 100 % y `0` ajustar al ancho); si se añadiera un atajo nuevo, se documenta en README, diálogo de atajos y paleta.
- **Tras la aprobación, archivos:** `src/app/pages/workspace/workspace.page.ts` (`onViewerWheel` ≈ L5063, `onPanPointerDown`, `zoomToScale`; todo zoom pasa por `zoomToScale(escala, ancla)`), `utils/zoom.utils.ts` (regla pura + spec), `utils/shortcuts.utils.ts` (+ spec) y `shortcuts-dialog`, claves `shortcuts.items.*` en los 7 JSON, tabla de atajos del README, `e2e/zoom-gestures.spec.ts`.
- **Reglas:** ignorado con foco en un campo de texto o con un editor abierto; no cambia el arrastre de anotaciones ni el recuadro de selección; sin animación con `prefers-reduced-motion`.
- **Hecho:** criterio general (§0.7) + e2e del gesto + spec de la regla pura + `npm run i18n:check`.

### T4 · OnPush en lo que queda en `Eager` (invisible; si algo se ve distinto, parar)
- **Lista** (comprobada con `grep -L ChangeDetectionStrategy.OnPush`): `components/{language-selector,ai-model-select,update-card,update-panel,update-install,update-channel,version-chip}`, `workspace/components/{first-steps,shortcuts-dialog,templates-export-dialog,export-samples-dialog}`, `migration/ai-details`, `pages/batch/page-map-batch/page-map-batch-dialog`, `pages/batch/ai-batch/{ai-batch-details,ai-batch-chip,ai-batch-button,ai-batch-panel}`, `pages/landing/landing.page.ts`, `pages/batch/batch.page.ts` (887 líneas).
- **Reparto:** T4a (hojas), T4b (diálogos), T4c (`ai-batch/*` + landing), T4d (`batch.page.ts`, después de T4b/T4c).
- **Método:** `plan/plan-onpush-vm.md` y `plan/medicion-onpush.md` (carpeta del proyecto, `plan/bench-onpush.cjs`): estado mutable a signals, auditoría de mutaciones, `ChangeDetectionStrategy.OnPush`. Medir antes/después y anotarlo en la PR. Los hijos que usan `markForCheck` o objetos mutados in situ necesitan signals.
- **Red de seguridad:** e2e `batch*.spec.ts`, `page-map-batch.spec.ts`, `landing.spec.ts`, `update-*.spec.ts`, `first-steps.spec.ts`.
- **Hecho:** criterio general + comparación de capturas si hay duda visual (sin cambios) + medición anotada.

### T5 · Auditoría de accesibilidad con axe
- Añadir `@axe-core/playwright` (devDependency) y un script de auditoría que recorra landing, editor (con `examples/factura-ejemplo.pdf`), lote y Proyectos en ambos temas y 1650/1280 px. **Primero como informe** (`docs/` o salida del script), fuera del CI.
- Si salen colores sueltos fuera de los tokens (`styles.scss`: `--bg --panel --accent --danger --text --muted`), listarlos. Los arreglos visibles pasan por mesa; los invisibles (atributos ARIA, nombres accesibles) pueden ir directo.
- Si sale limpio, proponer añadirlo al CI (decisión de Maxter).
- **Hecho:** informe con hallazgos clasificados (visible / invisible) y PR de lo invisible.

### T6 · Créditos reales de Copilot (necesita a Maxter)
Solo Maxter puede ejecutarlo con su cuenta: guion en `docs/IA-LOCAL.md` («Medir los créditos reales de Copilot», `tools/ai-phase0`, casos de `sample-plano/`). Con la tabla, otra PR cambia el texto del diálogo de «Trasladar con IA» (`batch.ai.*`, «medido en nuestra prueba»), con mesa si cambia algo visible. Un agente no debe inventar cifras.

### T7 · Visto bueno del tope por proyecto — HECHA (2026-11-20)
Maxter confirmó 200 PDFs / 2 GB con avisos a 100 PDFs / 1 GB; recogido en `DECISIONS` 16 y en el ROADMAP.

_Texto original:_
Confirmar 200 PDFs / 2 GB con avisos a 100 PDFs / 1 GB (ya implementado). Si dice que sí, añadir la decisión a `docs/DECISIONS.md` y quitar «sin confirmar» del ROADMAP.

### T8 · Cifrado opcional de proyectos (decisión de Maxter; fuera de la 1.16 salvo aprobación)
Decisión 6: «por ahora no». Propuesta: «Proteger con contraseña» por proyecto, clave en el almacén seguro del sistema, cifrar al exportar `.pdfannotator`. Patrón reutilizable: `desktop/sync-secrets.mjs`. Si Maxter lo quiere, **mesas primero** (contraseña perdida, importar un archivo cifrado, formato versionado en `docs/DOMAIN.md`).

### T9 · Vercel de la 1.15
No es desarrollo. Solo si Maxter lo pide expresamente.

## 4. Orden sugerido para el orquestador

1. **Ola 1 (ya, en paralelo):** T2, T4a, T4b, T4c, T5 (informe). Y en paralelo, **preparar la mesa P-106** de T3 (diseño, sin código).
2. **Ola 2:** T4d cuando T4b y T4c estén fusionadas por Maxter; T3 cuando apruebe la mesa.
3. **Ola 3 (Maxter):** T6, T7, T8, T9.
4. **Cierre:** subida de versión a 1.16.0 y RC/final **solo con petición expresa** (`docs/RELEASING.md`, parte B).

Fuera de la 1.16: partir más `workspace.page.ts`, firma de instaladores y canal estable/RC (`DECISIONS` 13 y 14), edición simultánea de proyectos, funciones nuevas del lote sin petición.

## 5. Riesgos
- OnPush y «no se refresca»: signals primero, e2e por zona, medir y parar si cambia algo.
- Doble clic frente a crear anotaciones: la mesa decide el gesto antes de programar.
- Docker no disponible en la nube: T2 puede quedar como guion para Maxter.
- Varias PRs a la vez chocan en `CHANGELOG.md`/`ROADMAP.md`: rebasar y resolver; fusiona Maxter.
