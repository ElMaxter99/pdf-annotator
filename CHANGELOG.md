## Unreleased
### Added
- Non-blocking toast notifications (`ToastService` + `app-toast-host`) replace every `alert()`; previously hard-coded Spanish import/export error messages are now translated in the 7 languages
- End-to-end test suite with Playwright (`npm run e2e`, 25 tests): landing, annotation editor, undo/redo history, JSON import (including that pasted code is never executed), fonts and PDF/JSON export
- GitHub Actions CI (`.github/workflows/ci.yml`): build + i18n check, unit tests and e2e on pull requests and pushes to `develop`/`master`
- `npm run test:ci` (headless Chrome without sandbox) and `karma.conf.cjs`

### Changed
- Refactor: imported-JSON normalisation moved to `AnnotationImportService` and `utils/annotation-fields.utils.ts` (`workspace.page.ts` ~3,530 → ~3,340 lines)
- Refactor: annotations and undo/redo history moved to `AnnotationStore`; pure page/field operations in `utils/annotation-pages.utils.ts` (`workspace.page.ts` ~3,640 → ~3,530 lines)
- Refactor: font catalogue, custom fonts and imported-font-name matching moved to `FontCatalogService` (`workspace.page.ts` ~3,990 → ~3,640 lines)
- Refactor: PDF export moved from `workspace.page.ts` to `PdfExportService` (fontkit loading included); download helpers in `utils/download.utils.ts` shared by PDF and JSON downloads
- Refactor: create/edit annotation forms merged into a single `AnnotationEditorComponent` (~130 duplicated template lines removed, no behaviour change)
- Refactor: colour and number helpers extracted into `utils/color.utils.ts` and `utils/number.utils.ts` (`workspace.page.ts` from ~4,300 to ~3,990 lines)

### Added
- Unit tests for `FontCatalogService` and the colour, number and PDF export utilities; 46 tests in total

## [v1.4.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.4.1) - 2026-10-20
### Changed
- Light theme: sidebar cursor box, thumbnails, template inputs now follow the theme
- Redesigned `/landing`: first screen focused on the action (title, centered drop zone, sample document, compact feature strip), full editor preview below, top bar with GitHub link, theme and language, and a compact open-source footer; fully responsive

### Added
- "Try with a sample document" button on the landing page

## [v1.4.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.4.0) - 2026-10-20
### Added
- Replace legal notice with MIT license referencing the GitHub repository
- Show read-only PDF coordinates in the annotation edit modal
- Keyboard shortcuts (page navigation, zoom, fit to width, sidebar toggle) with an in-app help dialog (`?`)
- "Fit to width" zoom button and shortcut hints in toolbar tooltips

### Changed
- Workspace layout: single-row compact toolbar, fixed-viewport shell with independent sidebar/viewer scroll, slim footer and a stacked layout below 960px
- Footer text is now translated in every language

### Changed (branding)
- Redesigned the social preview image (`og-image`, 1200×630; metadata now points to the PNG, since crawlers ignore SVG)
- Regenerated the logo as a high-resolution SVG (gradients, folded corner and coordinate marker) with matching PNG/ICO favicons, Apple touch icon and PWA icons; web manifest now has name and theme colour

### Fixed
- Importing a JSON file now refreshes the JSON editor (it kept showing the previous content)
- Viewer no longer clips the left side of the page when it is wider than the viewport; PDFs fit to width on small screens
- Language selector and JSON view toggle contrast in light theme

### Documentation
- New `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` and `docs/ARCHITECTURE.md`; rewritten README with screenshots and workflows; `examples/` with a sample PDF and annotations; improved issue/PR templates

### Security
- Pasted/imported JSON is parsed with a non-evaluating parser; `Function(...)` evaluation removed (arbitrary code execution)
- JSON imports are limited to 5 MB
- nginx: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `server_tokens off`

## [v1.3.3](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.3) - 2026-04-09
### Added
- Refine the workspace navbar with hierarchy and spacing #122

## [v1.3.2](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.2) - 2026-04-09
### Added
- fix: use PDF coordinates by default for guide inputs #118
- feat: add collapsible JSON panel in workspace sidebar #119
- Export JSON: show minimal fields by default and add advanced-fields toggle #120

## [v1.3.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.1) - 2025-11-27
### Added
- Add French, Italian, Portuguese, and German translations #100
- Add PDF cursor coordinate indicator #101
- Add legal notice to landing footer #111
- Add light/dark theme toggle #113
  
### Dev
- [Snyk] Upgrade pdfjs-dist from 5.4.296 to 5.4.394 #108

## [v1.3.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.0) - 2025-11-07
### Added
- Add page thumbnails sidebar #92
- Add lock and hide controls for workspace annotations #97

### Dev
- Split landing and workspace into routed pages #94
- Refactor landing page into page-scoped components #95
- Refactor workspace page into dedicated layout components #96

## [v1.2.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.2.0) - 2025-11-01
### Added
- Move JSON actions into sidebar panel #64
- Feat: refresh toolbar ui and pdf upload #65
- Persist selected language in local storage #74
- Add tree view option to JSON annotation menu #79
- Add overlay guides and configurable snapping controls #53
- Persist guide profiles with templates #84
- Feat: add advanced typography controls #82
- Feat: auto scroll JSON selection #85

### Dev
- Split landing and workspace into dedicated components #87

## [v1.1.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.1.0) - 2025-10-30
### Added
- docs: Improve branding and add issue templates #40
- Add Vercel speed insights integration and update dependencies #38
- Add annotation type controls and value overrides #47
- Add local annotation templates with auto-restore #52
- Add copy and paste duplication for annotations #57
- Add undo/redo support for annotation history #51
- Add Docker configuration for container deployment #50
- docs: clarify local and docker workflows #63

### Fix
- fix: replace deprecated json import assert #43
- fix: keep annotation editor focus when interacting with fields #47
- Close annotation modals when clicking outside the PDF viewer #56
- Handle annotations targeting non-existent PDF pages on download #58

## [v1.0.1] - 2025-10-28
### Added
- Improving Open Graph
- Expand README usage guide

### Fix
- Fix PDF.js worker selection for older Chrome (Issue in Chrome 113)

## [v1.0.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.0.0) - 2025-10-27
### Added
- Add @vercel/analytics integration to enhance tracking capabilities
- Add keyboard shortcuts to confirm, cancel or delete annotation editors
- Add draggable annotations to the PDF viewer
- Add hex color support for annotations
- Refactor appropriate tsconfig.json
- Add i18n support with translation guard
- Clear annotations when loading a new PDF
- Add footer with app details
- Add social media sharing metadata
- Add Download PDF with anotations
- Migrate coordinate JSON format

## [0.2.1] - 2025-09-03
###✨ Added
- Auto-focus en el input de texto al crear una nueva anotación, permitiendo empezar a escribir inmediatamente.
- Mejoras en la UI

## [0.2.0] - 2025-09-03
### ✨ Added
- Capacidad de crear anotaciones al hacer click en el PDF mediante hitbox.
- Panel de edición flotante para editar anotaciones existentes.
- Botón de borrar anotación individual directamente desde el panel de edición.
- Hover sobre anotaciones con cursor text y tooltip que indica “Click para editar”.
- Renderizado de anotaciones sobre `<canvas>` en capa separada (annotations-layer) para evitar conflictos con la creación de nuevas anotaciones.
- Funcionalidad de zoom in/out manteniendo las anotaciones correctamente escaladas.
- Navegación entre páginas del PDF con botones prev/next.
- Exportación de anotaciones en JSON mediante copia al portapapeles o descarga de archivo.
- Limpieza de todas las anotaciones con botón Clear.
- Mejora en la gestión de prioridad de click para que crear nuevas anotaciones no interfiera con la edición de existentes.
### 🐛 Fixed
- Bug donde hacer click en el PDF no creaba nuevas anotaciones correctamente debido a conflicto de capas.
- Bug donde el cursor no indicaba que se estaba sobre una anotación editable.
- Bug en el cálculo de coordenadas al hacer click sobre el PDF con zoom aplicado.

## [0.1.0] - 2025-08-28
### ✨ Added
- Configuración inicial de proyecto Angular 20 con Vite.
- Integración de `pdfjs-dist` para renderizar PDFs.
- Subida de PDF desde el navegador.
- Renderizado de páginas PDF en `<canvas>`.
- Captura de coordenadas mediante click en el PDF.
- Visualización de coordenadas en un panel JSON lateral.
- Input de texto editable para asociar valores a coordenadas.
---