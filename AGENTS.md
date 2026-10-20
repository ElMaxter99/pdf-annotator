# AGENTS.md · Guía para agentes de IA y colaboradores

Este archivo es la fuente de verdad para cualquier agente (Claude Code, Copilot, Codex, Cursor…) que trabaje en este repositorio. `CLAUDE.md` lo importa. Para el detalle técnico completo ve a [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
| `npm run build` | `i18n:check` + `ng build` (producción, prerender SSR de rutas) |
| `npm test` | Karma/Jasmine (necesita Chrome) |
| `npm run test:ci` | Igual, headless y sin sandbox (como en GitHub Actions) |
| `npm run e2e` | Playwright sobre el build de producción (`npm run build` antes; `PW_CHROMIUM=<ruta>` para usar un Chromium ya instalado) |
| `npm run i18n:check` | Verifica que los 7 JSON de traducción tengan **las mismas claves** que `es-ES` |
| `node scripts/generate-example.mjs` | Regenera `examples/factura-ejemplo.pdf` |
| `npm run start:docker` | Imagen NGINX en `http://localhost:4444` |

**Antes de dar una tarea por terminada:** `npm run build`, `npm run test:ci` y `npm run e2e` en verde. Si tocas el editor, el historial, la importación JSON, las fuentes o la exportación, **los e2e son tu red de seguridad** (`e2e/*.spec.ts`): ejecútalos antes y después y añade casos para el comportamiento nuevo.

## 3. Mapa del repositorio
```
src/app/
├─ pages/landing/            Landing (hero, dropzone, footer, selector de idioma)
├─ pages/workspace/
│  ├─ workspace.page.ts      ⚠️ "Dios-componente" (~3.340 líneas): render del PDF, sincronización del JSON, atajos y UI
│  └─ components/            header · sidebar · viewer · annotation-editor · footer · page-thumbnails · json-tree · shortcuts-dialog
├─ components/               language-selector, theme-toggle
├─ services/                 theme, pending-file (traspaso landing→workspace), app-metadata (SEO/OG), pdf-export (estampa anotaciones con pdf-lib), annotation-store (anotaciones + deshacer/rehacer, una instancia por página de workspace), annotation-import (normaliza JSON importado → anotaciones)
├─ i18n/                     translation.service + pipe `t` + translations/*.json
├─ models/                   annotation.model, guide-settings.model, page-thumbnail.model
├─ fonts/                    font-catalog.service (fuentes estándar + personalizadas, resolución de nombres del JSON), standard-font-families, font-variant
├─ utils/                    pdf-file.utils, loose-json (parser seguro), color.utils, number.utils, download.utils, annotation-pages.utils, annotation-fields.utils (puros, con tests)
└─ annotation-templates.service.ts   plantillas + última sesión en localStorage
src/styles.scss             Estilos globales (header, toolbar, sidebar, viewer, diálogos, temas)
public/                      logo, favicons, og-image, worker de pdf.js (assets/pdfjs)
examples/                    PDF y JSON de ejemplo usados en README y capturas
e2e/                         Tests Playwright (landing, editor, historial, importación, fuentes, exportación) + servidor estático
.github/workflows/ci.yml     CI: build, tests unitarios y e2e en PRs y pushes a develop/master
nginx.conf · Dockerfile      Despliegue estático con cabeceras de seguridad
```

## 4. Convenciones
- **Angular:** componentes *standalone*, signals (`signal`, `computed`), control flow `@if/@for` en código nuevo (el antiguo usa `*ngIf/*ngFor`). Los subcomponentes del workspace reciben `[vm]="vm"` (la página entera) en lugar de inputs granulares — respeta ese patrón o refactoriza de forma deliberada.
- **Estilo:** Prettier (`printWidth` 100, comillas simples). Sigue el estilo del archivo que tocas; sin comentarios innecesarios.
- **Estilos:** tokens `--bg --panel --accent --danger --text --muted`. Tema claro = `:root.theme-light`. El shell del workspace vive bajo `.app--workspace` en `styles.scss`.
- **i18n:** TODO texto visible usa la pipe `t` (`{{ 'clave' | t }}`). Añade la clave a **los 7 JSON** y ejecuta `npm run i18n:check`. No dejes cadenas fijas en español (quedan algunas heredadas en `alert()`/`console`; no las amplíes).
- **Coordenadas:** `x,y` en puntos PDF. El DOM usa `top = canvas.height − y·scale`. Conversión en `domToPdfCoords`.
- **Commits:** mensajes cortos en imperativo, en inglés o español de forma consistente con `git log`. Actualiza `CHANGELOG.md` (sección *Unreleased*).

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
- **Cambio de layout:** revisa tres anchos (≥1650, ~1280 y <960 px) y ambos temas.

## 7. Trampas conocidas
- Los editores de crear (`preview`) y editar (`edit`) comparten **un único** componente (`annotation-editor`, input `mode`). Cualquier campo nuevo se añade una sola vez; ojo con las reglas `locked` (solo aplican en modo `edit`).
- Lógica pura (colores, números) va en `utils/*.ts` con su `.spec.ts`; no la metas de nuevo en `workspace.page.ts`.
- Cambios en las anotaciones: pásalos siempre por `applyCoordsChange(...)` (→ `AnnotationStore.applyChange`) para que entren en el historial; `replaceCoords(..., { skipHistory: true })` solo al cargar un PDF.
- `Ctrl+Z/Y` globales también se disparan dentro del textarea JSON (comportamiento heredado).
- `preserveTextModel: true` en `replaceCoords` evita reformatear el texto que el usuario está escribiendo; **no** lo uses al importar archivos/plantillas.
- El PDF se guarda en memoria (`pdfByteSources`) en tres variantes para que el export sea robusto ante PDFs raros.
- Vercel Analytics/Speed Insights se inyectan como scripts; la CSP debe permitirlos si se despliega con ellos.
- SSR: `localStorage`, `window` y `Worker` solo existen en el navegador; protege el acceso (`typeof window`).

## 8. Definición de terminado
- [ ] `npm run build`, `npm run test:ci` y `npm run e2e` pasan.
- [ ] Textos nuevos traducidos en 7 idiomas.
- [ ] Probado en oscuro y claro, escritorio y móvil.
- [ ] README/CHANGELOG/atajos actualizados si cambia el comportamiento visible.
- [ ] Sin evaluación de entrada del usuario ni HTML sin sanear.
