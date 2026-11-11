# Hoja de ruta

El histórico de la iteración inicial está en `docs/archive/PROPUESTA_MEJORAS.md`. Este archivo es el vivo: actualízalo en cada PR que cambie el estado.

## Hecho (hasta v1.5.0)
Parser seguro, cabecera y layout compactos, atajos, extracción de `AnnotationEditor`, `PdfExportService`, `FontCatalogService`, `AnnotationStore`, `AnnotationImportService`, sidebar por pestañas, selección múltiple, sesión en IndexedDB, toasts, avisos de importación, e2e y CI.

## En curso
- **Remaquetado por lotes, fase 1** (diseño aprobado `M-01`..`M-10`): bandeja `/lote`, editor de B con A como capa de referencia, estados por campo, «Poner plantilla A», «Listo» y descarga. Sin vista dividida todavía (tablero `M-06`).

## Siguiente
1. **Remaquetado por lotes, fases siguientes:** vista dividida (A y B del mismo tamaño y zoom, scroll ligado), aviso y escalado cuando A y B miden distinto, y «Copiar y ajustar por textos» (proponer el desplazamiento con el texto que ya extrae pdf.js; siempre como sugerencia).
2. **Heredar `fontSize` global** al importar (hoy los campos sin tamaño reciben 14). Afecta al formato real del autor.
3. Dividir `workspace.page.ts` (≈4.130 líneas): render del PDF, miniaturas y sincronización del JSON.
4. Accesibilidad: trap de foco en diálogos, `aria-live` en coordenadas, contraste en tema claro.
5. Rendimiento: miniaturas bajo demanda, `OnPush`.
6. Dockerfile: `nginx-unprivileged`, `npm ci`; `npm audit` y Dependabot en CI.
7. Más tests: atajos y normalización de coordenadas.

## Ideas sin priorizar
Ajuste por dos anclas (traslación + escala) entre PDF viejo y nuevo; exportación en ZIP de varias plantillas.
