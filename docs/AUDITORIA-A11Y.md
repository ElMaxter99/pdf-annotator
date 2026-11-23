# Auditoría de accesibilidad con axe (1.16 · T5)

Fecha: 2026-11-19 · Versión auditada: 1.15.0 (build de producción) · Herramienta: `@axe-core/playwright` 4.x con las etiquetas `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y `best-practice`.

## Cómo repetirla

```bash
npm run build
PW_CHROMIUM=/opt/pw-browsers/chromium npm run a11y   # PW_CHROMIUM opcional; A11Y_PORT cambia el puerto (4377)
```

`scripts/a11y-audit.mjs` levanta el servidor estático de `e2e/`, recorre los estados de abajo en **tema oscuro y claro** y a **1650 y 1280 px**, y escribe `a11y-audit.json` (ignorado por git) con cada regla incumplida y sus nodos. **No forma parte del CI.** Para Proyectos usa el código real de `desktop/projects-ipc.mjs` sobre una carpeta temporal (dos proyectos, uno bloqueado por otro equipo).

Estados cubiertos: landing; editor con `examples/factura-ejemplo.pdf` (pestañas Documento, Anotaciones, Plantillas y Avanzado, y el editor de anotación abierto); lote con 2 PDFs (paso 1, paso 2 y panel); Almacenamiento de la app de escritorio (panel y confirmación de vaciado, 1.18; 0 hallazgos); Proyectos (lista). 10 estados × 2 temas × 2 anchos = 40 pasadas.

No cubre (se pueden añadir al script): diálogos de Proyectos (nuevo, sincronizar, importar/exportar), menú ⋯, paleta de comandos, «Trasladar con IA», tabla de páginas A↔B y el modo Dividida.

## Resultado

| | Antes | Después |
| --- | --- | --- |
| Reglas incumplidas (regla × estado) | 106 | 48 |
| Nodos | 140 | 62 |
| Tema oscuro | 2–3 por estado | solo `page-has-heading-one` |
| Tema claro | 3–4 por estado | `page-has-heading-one` y `color-contrast` |

En tema oscuro **no queda ningún problema de contraste**. Todo lo que queda es visible o estructural y pasa por mesa.

## A. Hallazgos invisibles (arreglados en esta PR)

Solo se han tocado plantillas `.html` y un `.ts` de plantilla en línea (`version-chip`); ni `styles.scss` ni `workspace.page.ts`. No cambia ningún texto visible.

| Regla axe | Dónde | Arreglo |
| --- | --- | --- |
| `nested-interactive` + `label-content-name-mismatch` | Zona de soltar de la landing (`landing-dropzone`): un `role="button"` con otro botón dentro y un nombre («Carga tu PDF») distinto del texto visible | Se quita `role`, `tabindex` y `aria-label` de la zona (sigue aceptando clic y soltar). El botón «Seleccionar PDF» es el control accesible; también sigue funcionando Enter/Espacio al llegar desde él |
| `aria-allowed-role` + `label-content-name-mismatch` | «¿Quieres empezar de cero?» en la pestaña Documento: `<section role="button">` con `aria-label` distinto del texto | `section` → `div` (conserva `role="button"`, `tabindex`), sin `aria-label`: el nombre sale del texto visible. Se borra la clave `app.workspaceUpload.ariaLabel` de los 7 JSON (ya no se usa) |
| `aria-allowed-role` | Miniaturas de página (`role="listitem"` sobre `<button>`) | Se quitan `role="list"` y `role="listitem"`; los botones conservan `aria-label` y `aria-current="page"` |
| `label-content-name-mismatch` | Botón del zoom del pie (nombre «Zoom del PDF», texto «150 %») | El nombre empieza por el texto visible: «150 % · Zoom del PDF» (con el prefijo «B · » en vista dividida desenlazada) |
| `select-name` | Selector de plantillas guardadas (pestaña Plantillas) | `aria-label` con la clave existente `sidebar.templates.selectLabel` |
| `label` (×2) | Selectores de color de «Fondo» y «Color» del editor de anotación | `aria-label` con las claves existentes `annotation.fields.background.label` y `annotation.fields.color.label` |
| `label-content-name-mismatch` | Desplegable de fuente del editor (`aria-labelledby` solo apuntaba a «Fuente», no al valor visible) | `aria-labelledby` ahora apunta a la etiqueta y al propio botón («Fuente Helvetica») |
| `label-content-name-mismatch` | Marca de la barra del lote (`aria-label="Pdf Annotator"`, el enlace muestra además el subtítulo) | Se quita el `aria-label`; el nombre sale del contenido |
| `label-content-name-mismatch` | Chip de versión (visible «v1.15.0», nombre «Versión 1.15.0…») | El nombre usa «v1.15.0»: «Versión v1.15.0. Abrir actualizaciones» |
| `aria-progressbar-name` (×4 detectados, ×3 más por la misma causa) | Barra del lote (`batch.progressLabel`), tres barras de Proyectos (tarjeta, sincronización, importar/exportar), progreso de «Exportar plantillas», «Trasladar con IA» en lote y «Sugerir tablas» | `aria-label` o `aria-labelledby` con claves existentes o el título del diálogo. Nuevas: `projects.progressLabel` («Progreso de «{{name}}»») y `projects.progressGeneric` («Progreso») en los 7 idiomas |

Los tres últimos progresos (exportar plantillas, IA en lote, sugerir tablas) no salieron en la auditoría porque no se alcanzaron esos estados, pero tienen la misma causa y se corrigen igual.

## B. Hallazgos visibles o estructurales (NO arreglados: pasan por mesa)

### B1. Contraste insuficiente en el tema claro (`color-contrast`, 34 nodos, solo `:root.theme-light`)

| Pareja | Ratio | Necesario | Dónde |
| --- | --- | --- | --- |
| `#ffffff` sobre `--accent` `#0f9b8e` | **3,44:1** | 4,5:1 | Botones primarios: `.landing__cta` «Seleccionar PDF», `.btn--primary` (Siguiente: Plantillas, Revisar siguiente, Nuevo proyecto, Abrir, Sincronizar con otra carpeta…), `.btn--active` («Muestra» del editor) |
| `#f6f7fb` (`--bg`) sobre `--accent` `#0f9b8e` | **3,21:1** | 4,5:1 | Pestañas y segmentos activos del lote: `.batch-tabs__on`, `.batch-seg__on` (Todos, Cuadrícula) |
| `#b45309` sobre `#f3e7c9` | **4,08:1** | 4,5:1 | Chip `.batch-chip--warn` («Vacío») |

Observaciones para la mesa:

- Lo que falla es **el token `--accent` del tema claro usado como fondo**. `--accent-text` (`#0b7d72`) existe y sí pasa para texto sobre `--bg`/`--panel`, pero los fondos acentuados siguen usando `--accent`. Esto matiza la nota de la 1.14 («`--accent-text` … cumplen AA»): los tokens de texto cumplen; las superficies acentuadas con texto blanco no.
- Un `--accent` más oscuro para fondos (p. ej. el mismo `#0b7d72`, que da 5,0:1 con blanco y 4,7:1 con `--bg`) o texto oscuro sobre el acento resolvería las dos primeras filas; la tercera pide un ámbar más oscuro para el texto o un fondo más claro. Es decisión de diseño: no se ha tocado.

### B2. Falta un `<h1>` en el editor y en los pasos 1–2 del lote (`page-has-heading-one`, 28 nodos, ambos temas)

`/workspace` no tiene ningún encabezado de nivel 1, y `/lote` solo lo tiene en el panel (`batch-bar__title`), no en los pasos «1 · Subir los PDF» y «2 · Plantillas». Es **estructural, no visual**, pero un `h1` oculto necesita una clase «solo para lectores de pantalla» y hoy **no hay ninguna global** (hay copias locales: `.footer__sr`, `.landing__features-title`, la paleta de comandos). Añadirla es un cambio en `styles.scss`, que esta tarea no toca (zona compartida con T3). **Propuesta:** añadir una utilidad `.sr-only` a `styles.scss` y un `<h1 class="sr-only">` en la cabecera del editor y en los pasos del lote.

### B3. Colores sueltos fuera de los tokens `--bg --panel --accent --danger --text --muted`

Tokens definidos en `styles.scss` (líneas 2–8 oscuro, 17–23 claro, más `--accent-text`). Fuera de esas líneas hay:

- **≈ 290 colores `rgb()/rgba()`** y **≈ 215 literales hex** en `styles.scss` y 11 hojas de componente. Los `rgba()` más repetidos son variantes con alfa de tokens: `94,234,212` (= `--accent` oscuro, 113 usos), `0,0,0` (35), `5,5,17` (17), `15,23,42` (= `--text` claro, 17), `255,255,255` (16), `148,163,184` (12), `255,77,77` (= `--danger` oscuro, 9), `220,38,38` (= `--danger` claro, 7), `15,155,142` (= `--accent` claro, 6).
- **Hex sueltos más usados** (usos en SCSS): `#fbbf24` ámbar de avisos (47; 35 en `styles.scss` y el resto en `batch.page.scss`, `ai-batch.scss`, `ai-model-select`, `page-map-batch-dialog`, `projects.page.scss`), `#ffffff` (19), `#d7dde9` (10), `#92400e` (10), `#041818` (8, texto oscuro sobre el acento), `#b45309` (7), `#b91c1c` (6), `#dc2626` (5, igual que `--danger` claro), `#b57600` (5), `#8a5a00` (5), `#eef2f7`, `#b7791f`, `#1d1d2a`, `#0f9b8e` (4 cada uno; este último duplica `--accent` claro).
- **Una vez cada uno:** `#2563eb`, `#7c3aed`, `#a78bfa`, `#f59e0b`, `#d97706`, `#fff3cd`, `#ffe5e5`, `#fca5a5`, `#ff8a8a` y los tonos de neutros `#e2e8f0`, `#cbd5e1`, `#94a3b8`, `#64748b`, `#f1f5f9`, `#f8fafc`, `#d9e2ec`, `#d6e0eb`, `#e5edf5`, `#e9edf5`, `#e9ebf1`. `#ff5f57`, `#febc2e` (botones de la ventana de ejemplo) y `#9cdcfe`, `#c586c0`, `#b5cea8` (resaltado del árbol JSON, `json-tree.component.scss`) son decorativos.
- Duplicados exactos de un token que se pueden sustituir por `var(--…)` sin cambio visual: `#dc2626` = `--danger` claro, `#0f9b8e` = `--accent` claro, `#0b7d72` = `--accent-text` claro, `#475569` = `--muted` claro, `#f6f7fb` = `--bg` claro, `#ff4d4d`/`#b0b0b0`/`#f5f5f5` = tokens oscuros.
- Candidatos a **nuevo token** (el ámbar de avisos es el más usado y tiene varias variantes por tema): `--warning`, `--warning-text` y quizá `--on-accent`.

Ningún hex suelto ha generado por sí mismo un fallo de axe en las pantallas auditadas salvo `#b45309` sobre `#f3e7c9` (B1); el resto no se ha medido en los estados no cubiertos.

## C. Si sale limpio: propuesta para el CI (decisión de Maxter)

Hoy no sale limpio (quedan B1 y B2). Cuando la mesa los resuelva, propongo **no** meter las 40 pasadas en cada PR (son 40 pasadas con un navegador, unos minutos) y hacer en su lugar:

1. Un job opcional (o `workflow_dispatch`/semanal) que ejecute `npm run a11y` y falle si hay reglas con `impact` `serious` o `critical`.
2. Para ello habría que añadir al script una opción de salida con error (hoy solo informa) y, si se quiere empezar antes, ejecutarlo solo en tema oscuro hasta cerrar B1.

No se ha tocado `.github/workflows/`.

## Actualización 1.17 · B2 (h1 oculto)
- Hecho: `.sr-only` global y `<h1 class="sr-only">` en la cabecera del editor y en los pasos del lote. Desaparecen `page-has-heading-one` y `region`.
- Nuevo pendiente: `heading-order` (20 nodos, solo el editor): tras el `h1`, el primer título visible del panel lateral es `h4`/`h5` («Miniaturas», «Plantillas reutilizables», «Anotaciones (JSON)», el de muestras de Avanzado). Arreglarlo es cambiar esos títulos a `h2`/`h3` **y** las reglas de `styles.scss` que los estilan por etiqueta (`.templates h5`, `.advanced-panel … h5`, `.preview-panel h4`…), sin cambio visual. Mejor después del paso a tokens (B3), que toca el mismo archivo.
- Resultado de `npm run a11y` tras B2: 40 hallazgos (regla × estado): `color-contrast` 34 nodos (tema claro, tarea B1) y `heading-order` 20 nodos.

## Actualización 1.17 · B1, `heading-order` y B4
- **B1 (contraste):** token `--accent-fill` para el acento usado como fondo (igual que `--accent` en oscuro, `#0b7d72` en claro, ≈ 5:1 con texto blanco); todos los `background: var(--accent)` sólidos pasan a él. El chip ámbar del lote usa `--warning-text` (en claro `#92400e`).
- **`heading-order`:** los títulos del panel lateral (`Miniaturas`, `Anotaciones (JSON)`, `Plantillas reutilizables`, fuentes, guías, muestras y datos de prueba, capas del lote y cabecera de la propuesta) pasan de `h4`/`h5` a `h2` (y el grupo de la propuesta de `h6` a `h3`), con las reglas de `styles.scss` cambiadas a la vez. Capturas del panel lateral antes/después idénticas píxel a píxel (4 pestañas × 2 anchos × 2 temas) y mismos estilos calculados.
- **Resultado de `npm run a11y`: 0 hallazgos** en los 44 estados (landing, editor, lote, Proyectos; oscuro/claro; 1650/1280).
- **B4:** el CI ejecuta `npm run a11y:ci` tras los e2e y falla con cualquier hallazgo serio o crítico (o un escenario sin auditar). El JSON se sube con el informe de Playwright si algo falla.

