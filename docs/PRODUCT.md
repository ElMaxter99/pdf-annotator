# Producto · PDF Annotator

## Para qué sirve
Un editor visual de **coordenadas sobre PDFs**. Se hace clic donde va un dato, se le da un nombre (`{{cliente.nombre}}` o una ruta de datos como `generalData.month`) y la app devuelve su posición exacta en **puntos PDF**. Un backend usa ese JSON para rellenar el documento (facturas, contratos, formularios, certificados). Opcionalmente estampa los textos en el propio PDF.

Todo ocurre en el navegador: no hay backend, ni subida de archivos, ni claves.

## Quién lo usa y cómo
- **Caso principal (el del autor):** otra aplicación guarda plantillas de PDF en Mongo. Cada plantilla es un objeto con un atributo `pages` (`{ num, fields: [{ type, x, y, mapField, fontSize? }] }`) más atributos propios de esa aplicación (`pdfName`, `fontSize`, `upperCase`…). PDF Annotator se usa para **maquetar y remaquetar** esos `pages` sobre el PDF real, de uno en uno. De cada plantilla solo importa `pages`; el resto vive en la otra aplicación.
- **Otros usos:** desarrolladores que generan PDFs desde plantillas, QA/operaciones que rellenan formularios, cualquiera que quiera marcar texto, checks o importes sin tocar el original.

## Qué no es
- No es un editor de contenido del PDF (no cambia el texto existente).
- No tiene cuentas, sincronización ni servidor. Lo guardado vive en el navegador (localStorage, IndexedDB).
- No ejecuta código del usuario: el JSON se parsea con un parser propio, nunca con `eval`.

## Funcionalidad actual (v1.5.0)
Anotaciones de texto, check, radio y número; edición completa, selección múltiple, alinear y distribuir, deshacer/rehacer; rejilla, reglas y guías; JSON en vivo con árbol; plantillas; fuentes propias; exportar JSON y PDF anotado; sesión recuperable; 7 idiomas; tema claro y oscuro; responsive. Detalle en `README.md` y `docs/ARCHITECTURE.md`.

## Siguiente necesidad de producto
Trabajar **muchos PDFs en serie** (20–50): subir todos a la vez, asociar a cada uno su objeto `pages`, ver antes y después cuando llega el PDF nuevo, remaquetar y pasar al siguiente. Cada PDF es distinto, así que no se aplica un reajuste global a todo el lote. Se diseña y se trabaja en su propio hilo; ver `docs/ROADMAP.md`.
