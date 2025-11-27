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