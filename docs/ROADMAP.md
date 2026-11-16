# Hoja de ruta

El histórico de la iteración inicial está en `docs/archive/PROPUESTA_MEJORAS.md`. Este archivo es el vivo: actualízalo en cada PR que cambie el estado.

## Hecho (hasta v1.5.0)
Parser seguro, cabecera y layout compactos, atajos, extracción de `AnnotationEditor`, `PdfExportService`, `FontCatalogService`, `AnnotationStore`, `AnnotationImportService`, sidebar por pestañas, selección múltiple, sesión en IndexedDB, toasts, avisos de importación, e2e y CI.

## En curso
- **Lote de documentos y remaquetado, fase 1** (diseño aprobado `L-01`..`L-11`): pasos de subida, panel en cuadrícula o lista, editor de B con A como capa de referencia, estados por campo, «Poner plantilla A», «Listo» y descarga. Sin vista dividida ni miniaturas reales en el panel todavía.

## Hecho tras v1.5.0
- Remaquetado por lotes: vista dividida, aviso y escalado cuando A y B miden distinto, «Copiar y ajustar por textos», «Trasladar con IA» en cola, selección múltiple en el panel y ajuste por dos anclas (traslación + escala) en la cascada previa a la IA.

## Siguiente
1. **Remaquetado por lotes, pendiente:** ayudante con cola propia que sobreviva a recargas y concurrencia 2 con Claude (fase 4 de `plan-traslado-masivo-ia`), y medir créditos reales con Copilot.
2. Dividir `workspace.page.ts` (≈4.130 líneas): render del PDF, miniaturas y sincronización del JSON.
3. Accesibilidad: trap de foco en diálogos, `aria-live` en coordenadas, contraste en tema claro.
4. Rendimiento: miniaturas bajo demanda, `OnPush`.
6. Dockerfile: `nginx-unprivileged`, `npm ci`; `npm audit` y Dependabot en CI.
7. Más tests: atajos y normalización de coordenadas.
8. **Subir a Node 26 en todo el proyecto**, como parte de una feature de la siguiente versión (decisión de Maxter): `Dockerfile` (`node:22.12.0-alpine` → `26.x-alpine`, PR #221 de Dependabot como referencia), `node-version` en `ci.yml`, `release.yml`, `desktop-ci.yml` y `desktop-release.yml`, y la mención de Node 22.12 en `AGENTS.md`. Comprobar build, tests, e2e y el empaquetado de escritorio antes de fusionar.
9. **Migrar a Angular 22 de una sola vez**, también para la siguiente versión (decisión de Maxter): `ng update` de todos los paquetes `@angular/*` a la vez (referencias: PRs #227 y #228 de Dependabot, que no se pueden subir por separado), `zone.js` 0.15 → 0.16 (#240; Angular 20 exige `~0.15`) y `jasmine-core` 5 → 7 con un `karma-jasmine-html-reporter` compatible (#226). Dejar las cuatro PRs abiertas como referencia hasta hacerlo; después, `npm run build`, `npm run test:ci` y `npm run e2e` en verde.

## Ideas sin priorizar
Exportación en ZIP de varias plantillas.
