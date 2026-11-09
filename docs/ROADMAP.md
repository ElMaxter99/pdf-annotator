# Hoja de ruta

El histórico de la iteración inicial está en `docs/archive/PROPUESTA_MEJORAS.md`. Este archivo es el vivo: actualízalo en cada PR que cambie el estado.

## Hecho (hasta v1.5.0)
Parser seguro, cabecera y layout compactos, atajos, extracción de `AnnotationEditor`, `PdfExportService`, `FontCatalogService`, `AnnotationStore`, `AnnotationImportService`, sidebar por pestañas, selección múltiple, sesión en IndexedDB, toasts, avisos de importación, e2e y CI.

## En curso
- **Fase 1 (esta rama):** documentos de contexto y flujo «diseño primero» (`docs/PRODUCT|DOMAIN|DECISIONS|TESTING|WORKFLOW.md`, `design/`).

## Siguiente
1. **Remaquetado de muchos PDFs** (20–50): subir los PDFs a la vez, asociar a cada uno su objeto `pages`, ver antes y después con el PDF nuevo, remaquetar y pasar al siguiente. Se trabaja en un hilo propio; el diseño pasa por `design/` antes de programarse.
2. **Heredar `fontSize` global** al importar (hoy los campos sin tamaño reciben 14). Afecta al formato real del autor.
3. Dividir `workspace.page.ts` (≈4.130 líneas): render del PDF, miniaturas y sincronización del JSON.
4. Accesibilidad: trap de foco en diálogos, `aria-live` en coordenadas, contraste en tema claro.
5. Rendimiento: miniaturas bajo demanda, `OnPush`.
6. Dockerfile: `nginx-unprivileged`, `npm ci`; `npm audit` y Dependabot en CI.
7. Más tests: atajos y normalización de coordenadas.

## Ideas sin priorizar
Ajuste por dos anclas (traslación + escala) entre PDF viejo y nuevo; exportación en ZIP de varias plantillas.
