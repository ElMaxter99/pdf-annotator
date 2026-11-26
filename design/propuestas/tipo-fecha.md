# Nuevo tipo de anotación «date» (candidata 1.20.2)

**Estado: implementado para la 1.20.2, sin mesas (Maxter, 2026-11-25), anotado en [`../PENDIENTE-MESAS.md`](../PENDIENTE-MESAS.md).** Decisiones de Maxter: el sistema que rellena las plantillas entiende o adaptará `type: "date"`; notación `DD/MM/YYYY`; versión 1.20.2. Origen: Maxter: «hagamos un desarrollo para la 1.20.2 donde agreguemos un nuevo tipo de anotación "date"».

## 1. Qué es
Un quinto tipo junto a `text`, `check`, `radio` y `number`. Como `number` con sus decimales y su sufijo, `date` lleva **un formato** que dice cómo se escribe la fecha en el PDF. El dato real lo pone quien rellena la plantilla; la app lo coloca, lo previsualiza y lo exporta.

JSON (el formato solo con «Incluir propiedades avanzadas», como `decimals` y `appender` del número):
```json
{ "type": "date", "x": 150, "y": 722, "mapField": "{{factura.fecha}}", "fontSize": 12, "dateFormat": "DD/MM/YYYY" }
```

## 2. Formato
- Propiedad `dateFormat`, texto con estos símbolos y separadores libres: `DD` (05), `D` (5), `MM` (03), `M` (3), `YYYY` (2026), `YY` (26). Cualquier otro carácter se copia tal cual (`/`, `-`, `.`, espacios, «de»).
- Sin `dateFormat`, o con uno inválido: `DD/MM/YYYY`. Al guardar un campo de fecha siempre se escribe su formato (con las propiedades avanzadas sale en el JSON); al importar, un formato inválido se avisa («N formato(s) de fecha no válido(s)»).
- Se limpia como no confiable al importar (texto plano, sin caracteres de control, ≤ 32 caracteres), igual que `appender`.
- **Fuera de esta versión:** nombres de mes («marzo») y horas. Dependen del idioma del documento, no del de la app, y complican el formato; se añaden después si hacen falta.

## 3. Dónde se ve
| Sitio | Cambio |
| --- | --- |
| Editor de anotaciones (`annotation-editor`, crear y editar) | Quinta opción «Fecha» en el selector de tipo. Con ella, un campo «Formato» con lista (`DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD`, `DD/MM/YY`, `D/M/YYYY`) y «Personalizado…» para escribir uno. Debajo, un ejemplo en pequeño con el 5 de marzo de 2026 («Se verá así: 05/03/2026»), para que se note la diferencia entre `D` y `DD` |
| Visor (vista previa) | En «Muestra», la fecha de ejemplo 31/12/2026 con el formato del campo (ancho realista). En «Datos de prueba», el dato formateado si es una fecha que se entienda (ver §4); si no, el texto tal cual y la marca de «sin resolver» que ya existe. En «mapField», el mapField como hoy |
| Opciones › Vista previa (valores de muestra) | Fila nueva «Fecha» como las de texto y número |
| Exportar PDF | Escribe lo mismo que la vista previa (ya usa sus datos) |
| JSON, árbol del JSON, mapField visible | `type: "date"` y `dateFormat` |
| IA y ajuste por textos | La IA trata la fecha como texto (hueco de línea, como hoy `number`); sin cambios en los prompts |

Selector de tipo con 5 opciones: a 1280 px el panel es estrecho. Si no caben en una fila, las etiquetas se acortan o el selector pasa a dos filas: lo decide la mesa.

## 4. Datos de prueba que se entienden como fecha
`2026-12-31`, `2026-12-31T10:00:00Z` (ISO) y `31/12/2026` (día/mes/año). Cualquier otro valor se pinta tal cual. No se usa `new Date(texto)` (depende del navegador): reglas propias en `utils/date-format.utils.ts`, con pruebas.

## 5. Preguntas para Maxter
1. **¿Lo entiende el sistema que rellena las plantillas?** Si ese sistema no conoce `type: "date"`, al recibirlo podría fallar o ignorar el campo. ¿Lo soporta ya, se adapta a la vez, o el JSON debe seguir diciendo `text` y la fecha solo existe en la app?
2. **Formato:** ¿vale `dateFormat` con símbolos `DD/MM/YYYY`, o el sistema usa otra notación (`dd/MM/yyyy`, `%d/%m/%Y`)? Mejor usar la misma que él.
3. **Versión:** es funcionalidad nueva; por `docs/RELEASING.md` tocaría **1.21.0** (1.20.2 sería solo arreglos). ¿1.21.0 o la llamamos 1.20.2 igualmente?
4. **Diseño:** esta sesión no tiene el lienzo. ¿Mesa en la otra sesión antes de programar, o «sin mesas» y se anota en `PENDIENTE-MESAS.md`?

## 6. Archivos que tocaría
- `models/annotation.model.ts` (`FieldType`, `dateFormat`), `utils/annotation-fields.utils.ts` (`normalizeFieldType`), `utils/field-style.utils.ts` (`prepareFieldForStorage/Form`), serialización del JSON, `AnnotationImportService` (+ contador de formato inválido en el `ImportReport` si se quiere avisar).
- `utils/date-format.utils.ts` nuevo (formatear y leer fechas) con su `.spec.ts`; `utils/preview-values.utils.ts` (muestra y datos de prueba).
- `annotation-editor` (opción y campo «Formato»), Opciones › Vista previa, claves i18n en los 7 idiomas.
- `docs/DOMAIN.md` (tipos y avanzados), README (tipos), CHANGELOG.
- e2e: crear una fecha, cambiar el formato, ver la muestra, exportar JSON e importar de vuelta.
