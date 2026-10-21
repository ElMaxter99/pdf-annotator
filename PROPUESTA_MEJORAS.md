# Propuesta de mejoras · PDF Annotator

## Qué se ha hecho en esta iteración
**Seguridad**
- **Crítico:** el editor JSON evaluaba el texto con `Function(...)` como fallback (ejecución de código arbitrario al pegar/importar un JSON malicioso). Sustituido por un parser propio que no ejecuta nada (`src/app/utils/loose-json.ts`, con tests). Sigue aceptando comillas simples, claves sin comillas, comentarios y comas finales; ignora `__proto__` y limita la profundidad.
- Límite de 5 MB al importar JSON.
- `nginx.conf`: CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `server_tokens off`.

**Interfaz (sin perder funcionalidad)**
- Cabecera en una sola fila (antes dos filas y mucho espacio perdido); etiquetas ocultas bajo 1650 px con tooltip que incluye el atajo.
- Layout de altura fija: sidebar y visor tienen scroll independiente; el PDF aprovecha toda la altura. Bajo 960 px se apila (visor → panel).
- Footer reducido a una línea, con texto traducido (antes "Desarrollado por" estaba fijo en español).
- Botón primario destacado para *Descargar PDF*; foco visible por teclado.

**Atajos explicados**
- Botón **Atajos** + tecla `?` abren un diálogo con todos los atajos (traducido a los 7 idiomas).
- Nuevos: `←/→`, `PgUp/PgDn`, `Home/End`, `+/−`, `0` (ajustar al ancho), `B` (sidebar). Se ignoran al escribir en campos.
- Nuevo botón **Ajustar** (fit-to-width).

## Propuestas siguientes (por valor / esfuerzo)
1. **Dividir `workspace.page.ts` (≈3.340 líneas)** en servicios (`PdfRenderService`, `AnnotationStore`, `JsonSyncService`, `FontService`, `ExportService`). ✅ Hecho: `<app-annotation-editor>` unificado y utilidades `color.utils`/`number.utils` con tests. ✅ `PdfExportService`, `FontCatalogService` y `AnnotationStore` (anotaciones + historial) y `AnnotationImportService` (normalización del JSON importado) extraídos, con tests. Pendiente: render del PDF/miniaturas y el resto de la sincronización del JSON (texto, árbol, autoaplicado).
2. **Sidebar por pestañas** (Documento · Anotaciones · Plantillas · Avanzado) para no hacer scroll con tantas secciones.
3. **Barra de herramientas del visor**: selección múltiple, mover con flechas, alinear/distribuir, copiar/pegar anotaciones.
4. **Persistencia de sesión** (IndexedDB): recuperar PDF y anotaciones tras recargar; aviso antes de perder cambios.
5. ✅ Toasts en lugar de `alert(...)` (hecho: `ToastService` + `app-toast-host`, textos en 7 idiomas). ✅ Validación del JSON con línea y columna del error (estado bajo el editor y avisos al aplicar/importar). Pendiente: validación por esquema de cada campo (tipos y rangos) con avisos por campo.
6. **Accesibilidad**: trap de foco en diálogos/editores, `aria-live` para coordenadas, contraste revisado en tema claro.
7. **Rendimiento**: render de miniaturas bajo demanda (virtualización) y `OnPush` en los componentes.
8. **Dockerfile**: usar `nginxinc/nginx-unprivileged` y `npm ci`; añadir `npm audit` y Dependabot en CI.
9. **Tests**: añadir specs de exportación PDF, normalización de coordenadas y atajos.
