# Dominio · glosario y formato

## Glosario
| Término | Significado |
| --- | --- |
| **Anotación / campo** | Elemento colocado sobre una página: `{ x, y, mapField, fontSize, color, type, … }`. |
| **`mapField`** | Lo que se pinta o la clave de datos (`{{cliente.nombre}}`, `generalData.month`). Con `value` relleno se pinta el valor; si no, la muestra del tipo o el dato resuelto del JSON de prueba (ver decisión 12). |
| **Puntos PDF** | Unidad del PDF (1 pt = 1/72 in). Origen **abajo-izquierda**: `y` crece hacia arriba. |
| **Página (`num`)** | Número de página empezando en 1. |
| **Plantilla** | Conjunto de anotaciones guardado en `localStorage` (`AnnotationTemplatesService`). No confundir con la plantilla de Mongo del autor, que es un objeto con `pages` y más atributos. |
| **Archivo de proyecto** | (Escritorio) `.pdfannotator`: ZIP versionado para llevar un proyecto a otro equipo (ver «Formato del archivo de proyecto»). |
| **Carpeta enlazada** | (Escritorio) Carpeta que ya sincroniza el usuario (Drive, OneDrive, red…) donde la app deja una copia de cada proyecto para abrirlo en otro equipo: `<ruta>/project.json`, `batch/…` y `.sync/` (`rev.json` = revisión con huellas, `lock.json` = bloqueo con caducidad de 15 min, `backups/`). Cada equipo trabaja en su copia local; el estado de cada proyecto vive en `.sync.json`. Ver `docs/ARCHITECTURE.md` («Sincronizar con una carpeta enlazada»). |
| **Servidor SFTP** | (Escritorio) Alternativa a la carpeta enlazada: un servidor SSH que el usuario ya tiene (NAS, VPS…) donde la app deja la misma copia (`<carpeta remota>/<ruta>/project.json`, `batch/…`, `.sync/`). Solo un destino a la vez. La huella SHA-256 del servidor se confirma la primera vez y queda fijada (`projects-sync.json`); la credencial (contraseña o frase de paso de la clave privada) va al almacén seguro del sistema y nunca a la web, al repo ni a los archivos exportados. El bloqueo se crea en el servidor «solo si no existe» y caduca a los 15 min con la hora del servidor. Ver `docs/ARCHITECTURE.md` («Sincronizar con un servidor SFTP»). |
| **Proyecto** | (Escritorio) Carpeta visible del disco con el lote de un cliente: `project.json`, `batch/` y `.lock`. «Espacio de trabajo» sigue siendo el editor. |
| **Sesión** | Último PDF + anotaciones + página + zoom en IndexedDB (`SessionStoreService`). |
| **Guías / snapping** | Rejilla, reglas e imán (`GuideSettings`). |
| **Maquetar / remaquetar** | Colocar o recolocar las coordenadas sobre un PDF nuevo o cambiado. |

## Formato JSON
```json
{ "pages": [ { "num": 1, "fields": [
  { "type": "text", "x": 150, "y": 722, "mapField": "{{cliente.nombre}}", "fontSize": 12 }
] } ] }
```
- Mínimo por campo: `x`, `y`, `mapField`, `fontSize`, `type` (`text | check | radio | number | date`).
- Avanzados (solo con «Incluir propiedades avanzadas»): `color`, `fontFamily`, `opacity`, `backgroundColor`, `locked`, `hidden`, `value`, `appender`, `decimals`, `dateFormat` (solo `date`).
- `dateFormat`: símbolos `DD` (05), `D` (5), `MM` (03), `M` (3), `YYYY` (2026), `YY` (26); el resto de caracteres se copia tal cual. Sin formato o con uno inválido, `DD/MM/YYYY`. La vista previa formatea los datos de prueba que se leen como fecha (`2026-12-31`, `2026-12-31T10:00:00Z`, `31/12/2026`); otro valor se pinta tal cual (`utils/date-format.utils.ts`).
- La importación es tolerante: acepta un array directo o `{ pages }`, comillas simples, claves sin comillas, comentarios y comas finales (`utils/loose-json.ts`).
- Ejemplo completo: `examples/anotaciones-ejemplo.json` con `examples/factura-ejemplo.pdf`.

## Formato del archivo de proyecto (`.pdfannotator`, formato 1)
ZIP (se abre con cualquier descompresor) con estas entradas y ninguna más:
- `manifest.json`: `{ "format": "pdf-annotator-project", "formatVersion": 1, "app": { "name", "version" }, "exportedAt": <ms>, "files": [{ "path", "size", "sha256" }] }`. Lista todas las demás entradas con su huella.
- `project.json`: `{ "v": 1, "name", "createdAt", "updatedAt", "ref" }` (`ref` = subcarpeta sugerida; sin id: al importar nace uno nuevo).
- `batch/<id>.json`: metadatos y anotaciones de cada PDF del lote (lo que guarda el proyecto en disco).
- `batch/<id>.a.pdf` (siempre) y `batch/<id>.b.pdf` (opcional).
No viaja: `.lock`, rutas absolutas ni el nombre del equipo. Importar rechaza, sin escribir nada: nombres fuera de esa lista o con `..`, `\`, rutas absolutas; entradas cifradas o duplicadas; CRC o SHA-256 que no cuadren; PDFs sin cabecera `%PDF-`; más de 200 PDFs o 2 GB; un `formatVersion` mayor que el que entiende la app. Los PDFs de más de 40 MB se dejan fuera solo si la persona lo acepta. Un formato nuevo sube `formatVersion` y la app antigua pide actualizar.

## Coordenadas
- Guardadas y exportadas en puntos PDF. El DOM usa `top = canvas.height − y·scale`; la conversión está en `domToPdfCoords`.
- Se redondean a 2 decimales al importar.
- Una anotación fuera del tamaño real de la página genera un aviso al importar de forma explícita.

## Diferencias conocidas con el formato del autor
Las plantillas reales del autor traen un `fontSize` global fuera de `pages` y campos sin `fontSize`. El importador hace que esos campos hereden el global (si falta o no es válido, 14).
