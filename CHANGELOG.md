## [v1.0.0] - 2025-10-27
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