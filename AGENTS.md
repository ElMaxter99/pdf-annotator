# AGENTS.md · Guía para agentes de IA y colaboradores

Este archivo es la fuente de verdad para cualquier agente (Claude Code, Copilot, Codex, Cursor…) que trabaje en este repositorio. `CLAUDE.md` lo importa. Para el detalle técnico completo ve a [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Contexto de producto y dominio: [`docs/PRODUCT.md`](docs/PRODUCT.md), [`docs/DOMAIN.md`](docs/DOMAIN.md); decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md); hoja de ruta: [`docs/ROADMAP.md`](docs/ROADMAP.md); pruebas: [`docs/TESTING.md`](docs/TESTING.md).

## 1. Qué es la app
**PDF Annotator** es una SPA en **Angular 20** (standalone components + signals) que permite:
1. Cargar un PDF (100 % en el navegador, no hay backend ni subida de archivos).
2. Colocar anotaciones de texto/check/radio/número sobre cualquier página, con coordenadas en **puntos PDF** (origen abajo-izquierda).
3. Sincronizar esas anotaciones con un **JSON** editable (`{ "pages": [{ "num", "fields": [...] }] }`).
4. Exportar el JSON o un **PDF anotado** (`pdf-lib`), y guardar **plantillas** reutilizables en `localStorage`.

Rutas: `/landing` (carga inicial) → `/workspace` (editor). Idiomas: es-ES, en, ca, fr, it, pt, de. Temas: oscuro/claro.

## 2. Comandos
| Comando | Uso |
| --- | --- |
| `npm install` | Instala dependencias (Node 22.12) |
| `npm run start:local` | Dev server en `http://localhost:4200` |
| `npm run start:ia` | Dev server + ayudante de IA local (`tools/ai-helper`, 127.0.0.1:4310); ver `docs/IA-LOCAL.md` |
| `npm run build` | `i18n:check` + `ng build` (producción, prerender SSR de rutas) |
| `npm test` | Karma/Jasmine (necesita Chrome) |
| `npm run test:ci` | Igual, headless y sin sandbox (como en GitHub Actions) |
| `npm run e2e` | Playwright sobre el build de producción (`npm run build` antes; `PW_CHROMIUM=<ruta>` para usar un Chromium ya instalado) |
| `npm run i18n:check` | Verifica que los 7 JSON de traducción tengan **las mismas claves** que `es-ES` |
| `node scripts/generate-example.mjs` | Regenera `examples/factura-ejemplo.pdf` |
| `npm run start:docker` | Imagen NGINX en `http://localhost:4444` |
| Publicar versión | Ver [`docs/RELEASING.md`](docs/RELEASING.md): subida de versión → release candidate → pruebas → «Release» → Vercel (normalmente lo ejecuta Claude) |

**Antes de dar una tarea por terminada:** `npm run build`, `npm run test:ci` y `npm run e2e` en verde. Si tocas el editor, el historial, la importación JSON, las fuentes o la exportación, **los e2e son tu red de seguridad** (`e2e/*.spec.ts`): ejecútalos antes y después y añade casos para el comportamiento nuevo.

## 3. Mapa del repositorio
```
src/app/
├─ pages/landing/            Landing (hero, dropzone, footer, selector de idioma)
├─ pages/batch/              Lote (`/lote`): pasos (subir PDF y plantillas; el resumen está en el paso 2 y «Abrir el panel» crea el lote) y panel con la tira «Versiones nuevas (B)» siempre visible (B sueltas emparejadas por nombre; las que no cuadran esperan en la tira para asignarlas a mano o descartarlas) en cuadrícula o lista; se llega desde la landing al soltar 2 o más PDFs
├─ pages/workspace/
│  ├─ workspace.page.ts      ⚠️ "Dios-componente" (~4.130 líneas): render del PDF, sincronización del JSON, atajos y UI
│  └─ components/            header · migration (barra y panel de estados del lote) · sidebar (4 pestañas: Documento, Anotaciones, Plantillas, Avanzado) · viewer · annotation-editor · footer · page-thumbnails · json-tree · shortcuts-dialog
├─ components/               language-selector, theme-toggle, toast-host (avisos globales)
├─ services/                 theme, pending-file (traspaso landing→workspace), app-metadata (SEO/OG), pdf-export (estampa anotaciones con pdf-lib), annotation-store (anotaciones + deshacer/rehacer, una instancia por página de workspace), annotation-import (normaliza JSON importado → anotaciones), toast (avisos no bloqueantes), session-store (última sesión en IndexedDB: PDF + anotaciones + página y zoom), batch-store (lote en IndexedDB, base propia `pdf-annotator-batch`; borrador de archivos en memoria)
├─ guards/                   workspace.guard (sin PDF pendiente → /landing)
├─ i18n/                     translation.service + pipe `t` + translations/*.json
├─ models/                   annotation.model, guide-settings.model, page-thumbnail.model
├─ fonts/                    font-catalog.service (fuentes estándar + personalizadas, resolución de nombres del JSON), standard-font-families, font-variant
├─ utils/                    pdf-file.utils, loose-json (parser seguro), color.utils, number.utils, download.utils, annotation-pages.utils, annotation-fields.utils, alignment.utils, migration.utils (estados A↔B, emparejado por nombre), zip.utils (puros, con tests)
└─ annotation-templates.service.ts   plantillas + última sesión en localStorage
desktop/                    App de escritorio (Electron): main, preload, ayudante de IA integrado, actualizador (`update-logic.mjs`) y `electron-builder.yml`; ver `docs/ARCHITECTURE.md` §10b
src/styles.scss             Estilos globales (header, toolbar, sidebar, viewer, diálogos, temas)
public/                      logo, favicons, og-image, worker de pdf.js (assets/pdfjs)
examples/                    PDF y JSON de ejemplo usados en README y capturas
design/                      Diseños aprobados (lienzo de claude.ai, copias, propuestas). Fuera del build
e2e/                         Tests Playwright (landing, editor, historial, importación, fuentes, exportación) + servidor estático
.github/workflows/ci.yml     CI: build, tests unitarios y e2e en PRs y pushes a develop/master
nginx.conf · Dockerfile      Despliegue estático con cabeceras de seguridad
```

## 4. Convenciones
- **Angular:** componentes *standalone*, signals (`signal`, `computed`), control flow `@if/@for` en código nuevo (el antiguo usa `*ngIf/*ngFor`). Los subcomponentes del workspace reciben `[vm]="vm"` (la página entera) en lugar de inputs granulares — respeta ese patrón o refactoriza de forma deliberada.
- **Estilo:** Prettier (`printWidth` 100, comillas simples). Sigue el estilo del archivo que tocas; sin comentarios innecesarios.
- **Estilos:** tokens `--bg --panel --accent --danger --text --muted`. Tema claro = `:root.theme-light`. El shell del workspace vive bajo `.app--workspace` en `styles.scss`.
- **i18n:** TODO texto visible usa la pipe `t` (`{{ 'clave' | t }}`). Añade la clave a **los 7 JSON** y ejecuta `npm run i18n:check`. No dejes cadenas fijas en español (solo quedan mensajes de `console`).
- **Avisos al usuario:** nunca `alert()`/`confirm()`; usa `ToastService.error/warning/show` con una clave i18n (`toast.*`). Los e2e esperan `.toast--error`.
- **Coordenadas:** `x,y` en puntos PDF. El DOM usa `top = canvas.height − y·scale`. Conversión en `domToPdfCoords`.
- **Commits:** mensajes cortos en imperativo, en inglés o español de forma consistente con `git log`. Actualiza `CHANGELOG.md` (sección *Unreleased*).

## 4b. Diseño primero
Todo cambio visible (pantallas, flujos, textos de pantalla) se diseña **antes de programarse** en el lienzo de claude.ai y lo aprueba la persona responsable; **no programes la interfaz hasta que esté aprobada**. Lo invisible (motor, tests, rendimiento, docs) avanza sin esperar. Detalle en [`docs/WORKFLOW.md`](docs/WORKFLOW.md) y [`design/README.md`](design/README.md): lienzo único, mesas `V-NN`/`P-NN`, tokens de `styles.scss`, anchos de escritorio y ambos temas, copia del diseño aprobado en `design/canvas/`. Incluye reglas de estilo, feedback, accesibilidad y autonomía.

## 5. Reglas de seguridad (no negociables)
1. **Nunca evalúes entrada del usuario** (`eval`, `Function`, `new Function`, `setTimeout(string)`). El JSON "flexible" se parsea con `utils/loose-json.ts`.
2. **No uses `innerHTML` / `bypassSecurityTrust*`** con datos del usuario (textos de anotaciones, nombres de plantilla/fuente). Usa `textContent` o bindings de Angular.
3. Valida tamaño y tipo de archivos importados (PDF: `isPdfFile`; JSON: ≤ 5 MB; fuentes: `.ttf/.otf/.woff/.woff2`).
4. Todo lo que se guarda en `localStorage` se lee como no confiable: normaliza antes de usar (`AnnotationTemplatesService`).
5. No añadas `connect-src` externos ni scripts de terceros sin actualizar la CSP de `nginx.conf`.
6. Nada de secretos en el repo: la app no tiene backend ni claves.

## 6. Cómo trabajar en tareas típicas
- **Nuevo atajo:** añade el caso en `handlePlainShortcut` (`workspace.page.ts`), la fila en `shortcuts-dialog.component.ts`, las claves `shortcuts.items.*` en los 7 idiomas y la tabla del README.
- **Nuevo campo de anotación:** `models/annotation.model.ts` → `prepareFieldForStorage/Form` → `serializeFieldForJson` (campos avanzados) → `AnnotationImportService.normalizeImportedCoordinates` (+ `utils/annotation-fields.utils.ts`) → template del editor (`annotation-editor.component.html`, un único formulario) → render (`redrawAllForPage`) → export PDF (`PdfExportService.exportAnnotatedPdf`, ya dibuja con los datos que le pasa la página).
- **Nuevo idioma:** añade `translations/xx.json`, impórtalo en `translation.service.ts` (`LANGUAGES`, `TRANSLATIONS`) y la etiqueta en `app.languages.xx`.
- **Cambio de layout:** la app se diseña solo para escritorio; revisa ~1650 y ~1280 px de ancho y ambos temas. El CSS móvil que ya existe se conserva pero no se diseña ni se amplía.

## 7. Trampas conocidas
- Los editores de crear (`preview`) y editar (`edit`) comparten **un único** componente (`annotation-editor`, input `mode`). Cualquier campo nuevo se añade una sola vez; ojo con las reglas `locked` (solo aplican en modo `edit`).
- Lógica pura (colores, números) va en `utils/*.ts` con su `.spec.ts`; no la metas de nuevo en `workspace.page.ts`.
- Cambios en las anotaciones: pásalos siempre por `applyCoordsChange(...)` (→ `AnnotationStore.applyChange`) para que entren en el historial; `replaceCoords(..., { skipHistory: true })` solo al cargar un PDF.
- Sidebar por pestañas (`vm.sidebarTab`): los paneles se ocultan con `[hidden]` (no `*ngIf`) para conservar los `@ViewChild` (editor JSON, inputs de archivo). Un elemento nuevo del panel va dentro del panel que corresponda; en los e2e abre la pestaña con `openSidebarTab(page, 'Anotaciones')` (`openWorkspace` abre Anotaciones por defecto).
- Selección múltiple (`vm.selection`, solo una página y sin anotaciones bloqueadas): Shift/Ctrl+clic, Ctrl+A, arrastre en grupo, flechas, Supr, Ctrl+C/V/D y barra `.selection-bar` en el visor. También hay selección por recuadro (`onHitboxPointer*`, `vm.lasso`; un arrastre >4 px sobre zona vacía; el `click` que sigue se ignora con `suppressHitboxClick`) y distribuir (`distributeBoxes`, ≥3). Toda acción de grupo pasa por `updateSelectedFields`/`applyCoordsChange` (un paso de historial; las flechas usan `coalesceKey: 'nudge'` para fusionarse). La selección se vacía al cambiar de página, deshacer/rehacer, importar o abrir un editor. Las matemáticas de alinear viven en `utils/alignment.utils.ts`. Los atajos de selección se ignoran con el foco en un campo de texto; al seleccionar se hace `blur()` del campo (pulsar una anotación no mueve el foco).
- `render()` serializa y fusiona llamadas simultáneas (pdf.js no admite dos renders a la vez en un canvas): llama siempre a `render()`, nunca a pdf.js directamente.
- Avisos de importación: `AnnotationImportService.normalizeImportedCoordinates(data, prepare, report)` rellena un `ImportReport` (solo cuenta, no cambia el resultado) y la página lo convierte en un toast `warning` únicamente al aplicar/importar de forma explícita (`reportImportIssues`), nunca en el autoaplicado al escribir. Una regla nueva de validación = un contador en el informe + clave `toast.importIssues.*` en los 7 idiomas.
- Lote (`/lote`): 1 PDF en la landing abre el editor de siempre; 2 o más abren los pasos (`BatchStoreService.draft`) y luego el panel. Cada PDF del lote se abre en el mismo editor: con versión B se edita B con A de referencia; sin B se edita el PDF con su plantilla (sin capa ni estados). La barra del editor (`components/migration`) lleva ‹ Panel, anterior/siguiente (`goBatchItem`) y «Listo». El editor se reutiliza para B. `BatchStoreService.activeItem()` activa el modo migración en `workspace.page.ts` (capa A en `redrawReference`, estados en `migration()`, guardado de B con debounce); mientras está activo no se guarda la «última sesión». A solo se lee; los campos de B siguen el flujo normal (`applyCoordsChange`). Una acción nueva de lote va en `components/migration`, no en `workspace.page.ts`. En lote la pestaña Documento muestra `components/batch-document` (ficha del PDF y capas A/B; métodos `batch*` de `workspace.page.ts`) en vez de la zona de subir PDF. El modo «Dividida» (`referenceMode = 'split'`) dibuja A en un segundo canvas del visor (`renderSplit`, `fitSplit`); los modos dependen de que haya B, no de que A tenga campos: sin campos se compara el PDF de A tal cual (mantener «A» pone su PDF sobre B) y solo «Poner plantilla A» queda desactivado. Si A y B miden distinto (`sizeMismatch`, tamaños en `pageSizesA/B`), el aviso pregunta y `BatchItem.fitA` (`undefined` = sin elegir, `true`/`false`) decide si `aPagesView` escala las coordenadas de A a B (`utils/page-scale.utils.ts`); la capa de A, los estados, «Poner plantilla A» y el PDF de A (`geometryForA`) leen siempre de ahí. Los avisos informativos de la barra se cierran con ✕ (`vm.notices`, `closeNotice`; estado en memoria en `BatchStoreService.closedNotices`, por PDF y con firma de la situación) y se recuperan desde la campana (`notices-bell`); un aviso nuevo que se pueda cerrar debe entrar en `NoticeId`.
- «Copiar y adaptar con IA» (`startAi`/`applyAi` en `workspace.page.ts`, chip y panel en `components/migration/migration-bar`, franja `components/migration/ai-review`, `services/ai-helper.service.ts`, `utils/ai-proposal.utils.ts`): el navegador habla con el ayudante local `tools/ai-helper` (que lanza `claude`/`copilot`); la respuesta se trata como no confiable (`sanitizeRow`) y la propuesta se aplica con `insertFields` (un paso de historial) solo con las filas marcadas. Los e2e usan el proveedor simulado (`AI_HELPER_FAKE=1`, lo arranca `playwright.config.ts`). Un estado de error nuevo = clave `ai.error.<code>.*` en los 7 idiomas.
- «Trasladar con IA» en lote (`pages/batch/ai-batch/`: botón, estado y chip por fila; `services/ai-batch.service.ts` = cola en serie, `utils/ai-batch.utils.ts` = reglas, `utils/adjust-cascade.utils.ts` + `services/pdf-text.service.ts` = ajuste por textos sin IA antes de preguntar): guarda el registro de cada PDF en `AiBatchRow` (pasos, enviado, detalles; `utils/ai-batch-details.utils.ts` lo convierte en pasos para `ai-batch-details`, el «Ver detalles» del lote) y la propuesta en `BatchItem.aiProposal` (`BatchStoreService.setAiProposal`) y el editor la carga (`loadSavedAi`) para revisarla PDF a PDF; nunca se aplica en bloque. Un código de error nuevo = `classifyAiError` + claves `batch.ai.*`/`ai.error.*` en los 7 idiomas.
- «Copiar y ajustar por textos» (`startAdjust`/`applyAdjust` en `workspace.page.ts`, panel `components/migration/adjust-review`): matemáticas puras en `utils/text-anchors.utils.ts` y `utils/adjust-session.utils.ts`; la propuesta se pinta en la capa de referencia (`drawAdjustPreview`) y B no cambia hasta aplicar (un paso de historial). Con «Ajustar» activo (tamaños distintos) los textos de A se escalan por eje antes de emparejar (`fitTextsOfA`), así el desplazamiento se mide después del ajuste de tamaño.
- Barra superior del editor (`components/header` + estilos «Workspace header v2» al final de `styles.scss`): una sola fila sin salto; por debajo de 1200 px atajos/tema/idioma pasan al menú ⋯ (`.toolbar__prefs`) y en móvil (≤960 px) se conserva el aspecto antiguo con `flex-wrap`. «Limpiar» pide confirmación (`clear-confirm`). Paso 2 del lote: `utils/template-paste.utils.ts` lee plantillas pegadas (formato Mongo) y las empareja por `pdfName`.
- Ruta `/workspace`: si no hay un PDF pendiente en `PendingFileService` (recarga, URL directa, Atrás/Adelante), `workspaceGuard` (asíncrono) reabre el PDF del lote de `?lote=<id>`, el último PDF suelto de esta visita (`rememberLastOpened`) o la sesión guardada; sin nada, va a `/landing`. El guard nunca consume el archivo; lo hace el componente. Un flujo nuevo que abra el workspace debe dejar antes un archivo pendiente, y si abre un PDF del lote, navegar con `?lote=<id>` (`utils/batch-open.utils.ts`).
- Sesión guardada: `workspace.page.ts` guarda con debounce (800 ms) en `SessionStoreService` solo si hay anotaciones o historial; al limpiar todo borra la sesión. Los datos restaurados se tratan como no confiables (pasan por `AnnotationImportService`). Si añades estado que deba sobrevivir a una recarga, inclúyelo en `SavedSession`.
- `Ctrl+Z/Y` globales también se disparan dentro del textarea JSON (comportamiento heredado).
- `preserveTextModel: true` en `replaceCoords` evita reformatear el texto que el usuario está escribiendo; **no** lo uses al importar archivos/plantillas.
- El PDF se guarda en memoria (`pdfByteSources`) en tres variantes para que el export sea robusto ante PDFs raros.
- Vercel Analytics/Speed Insights se inyectan como scripts; la CSP debe permitirlos si se despliega con ellos.
- SSR: `localStorage`, `window` y `Worker` solo existen en el navegador; protege el acceso (`typeof window`).

## 8. Definición de terminado
- [ ] `npm run build`, `npm run test:ci` y `npm run e2e` pasan.
- [ ] Textos nuevos traducidos en 7 idiomas.
- [ ] Probado en oscuro y claro, escritorio (1650 y 1280 px).
- [ ] README/CHANGELOG/atajos actualizados si cambia el comportamiento visible.
- [ ] Sin evaluación de entrada del usuario ni HTML sin sanear.
