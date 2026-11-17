# Tabla de correspondencia de páginas A↔B

Mesas P-78 a P-81. **Aprobado por Maxter** («Diseño ok»): opción B (tabla por filas) y lo recomendado en las cuatro dudas.

## Decisiones
- **Tabla por filas** con una fila por página de B y un desplegable con la página de A (o «Sin página de A»), con «✦ Sugerir por textos» (misma lectura de textos que el ajuste, sin IA), «Desplazar todas ±1» y «Por número».
- **Páginas repetidas permitidas** con aviso ámbar; las páginas de A sin usar solo se avisan.
- **Ajuste por textos e IA usan la tabla** (cambia lo de P-75, pregunta 2). El ajuste por textos empareja cada página de B con la de A de la tabla. A la IA se le sigue enviando la plantilla de A con sus números de página (el ayudante busca la página en B) y la tabla viaja como pista en el prompt (`template.pageMap`).
- **«Poner plantilla A» con tabla** copia todas las páginas emparejadas de una vez, sin la confirmación de páginas libres; «Reemplazar» respeta las páginas de B sin A.
- **Por PDF del lote** (`BatchItem.pageMap`, IndexedDB): se descarta al sustituir A y se revisa (filas «Nueva») al cambiar B. Sin tabla todo sigue por número.
- **Para más adelante:** «Sugerir tablas» para varios PDFs desde el panel del lote.

## Notas de implementación
- `utils/page-map.utils.ts` (reglas puras con tests), `components/migration/page-map-dialog`, menú ▾ del chip en `components/viewer`.
- `workspace.page.ts`: `pageMap`, `tableLinked`, `aPagesForB` (A renumerada a B) y `aPage` con la tabla. Con tabla, las páginas enlazadas recorren las de B.
- Las miniaturas del diseño son páginas genéricas en el diálogo (no se renderizan las reales).
