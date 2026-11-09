# Dominio · glosario y formato

## Glosario
| Término | Significado |
| --- | --- |
| **Anotación / campo** | Elemento colocado sobre una página: `{ x, y, mapField, fontSize, color, type, … }`. |
| **`mapField`** | Lo que se pinta o la clave de datos (`{{cliente.nombre}}`, `generalData.month`). Con `value` relleno se pinta el valor; si no, la muestra del tipo o el dato resuelto del JSON de prueba (ver decisión 12). |
| **Puntos PDF** | Unidad del PDF (1 pt = 1/72 in). Origen **abajo-izquierda**: `y` crece hacia arriba. |
| **Página (`num`)** | Número de página empezando en 1. |
| **Plantilla** | Conjunto de anotaciones guardado en `localStorage` (`AnnotationTemplatesService`). No confundir con la plantilla de Mongo del autor, que es un objeto con `pages` y más atributos. |
| **Sesión** | Último PDF + anotaciones + página + zoom en IndexedDB (`SessionStoreService`). |
| **Guías / snapping** | Rejilla, reglas e imán (`GuideSettings`). |
| **Maquetar / remaquetar** | Colocar o recolocar las coordenadas sobre un PDF nuevo o cambiado. |

## Formato JSON
```json
{ "pages": [ { "num": 1, "fields": [
  { "type": "text", "x": 150, "y": 722, "mapField": "{{cliente.nombre}}", "fontSize": 12 }
] } ] }
```
- Mínimo por campo: `x`, `y`, `mapField`, `fontSize`, `type` (`text | check | radio | number`).
- Avanzados (solo con «Incluir propiedades avanzadas»): `color`, `fontFamily`, `opacity`, `backgroundColor`, `locked`, `hidden`, `value`, `appender`, `decimals`.
- La importación es tolerante: acepta un array directo o `{ pages }`, comillas simples, claves sin comillas, comentarios y comas finales (`utils/loose-json.ts`).
- Ejemplo completo: `examples/anotaciones-ejemplo.json` con `examples/factura-ejemplo.pdf`.

## Coordenadas
- Guardadas y exportadas en puntos PDF. El DOM usa `top = canvas.height − y·scale`; la conversión está en `domToPdfCoords`.
- Se redondean a 2 decimales al importar.
- Una anotación fuera del tamaño real de la página genera un aviso al importar de forma explícita.

## Diferencias conocidas con el formato del autor
Las plantillas reales del autor traen un `fontSize` global fuera de `pages` y campos sin `fontSize`. El importador actual pone **14** a los campos sin tamaño e ignora el global; está anotado en `docs/ROADMAP.md`.
