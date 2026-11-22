# IA en local para migrar plantillas A→B

> Estado: **fase 0 (prueba de calidad)**. Todavía no hay nada en la interfaz de la app. Plan completo: «Plan: remaquetado de coordenadas A→B con IA» (documento del proyecto). Código de la prueba: [`tools/ai-phase0/`](../tools/ai-phase0/README.md).

## Decisiones de producto (no reabrir sin hablar con Maxter)
- **Solo en local y con suscripción.** Nada se despliega con esta función. No hay claves de API ni tokens de pago por uso: se descartan la API de pago de Claude, BYOK y GitHub Models (retirado el 30-jul-2026).
- **La IA es el CLI que ya está instalado y con la sesión iniciada** por la persona que usa la app: `claude -p` (Claude Code) o `copilot -p` (Copilot CLI), según lo que decida el cliente. La app nunca toca credenciales.
- **La IA no escribe coordenadas a ojo.** Devuelve página, texto ancla de B y el lado del hueco; las coordenadas las calcula el código con las posiciones de pdf.js y los huecos dibujados. La propuesta se revisa en «Dividida» como cualquier otra.
- **Orden de pruebas:** primero todo el desarrollo con Claude; Copilot está implementado pero sin probar hasta que se vaya a usar en el trabajo.

## Qué se envía a la IA
El ayudante (y el script de la fase 0) prepara una carpeta temporal y ejecuta el CLI dentro de ella. En la app va **por partes** (ver «Cómo pregunta el ayudante»): cada petición tiene su propia carpeta con solo lo suyo:

| Archivo | Contenido |
| --- | --- |
| `A-p<N>.png`, `B-p<N>.png` | La página de A de esa petición y sus páginas candidatas de B, renderizadas como imagen (escala 1,5) |
| `textsA.json`, `textsB.json` | Textos de esas páginas con página, posición y ancho `w` (extraídos con pdf.js) |
| `fields.json` | Los campos de esa página de A que no se colocaron sin IA: posición, tipo (`type`), `mapField` (`label`) y los 8 textos más cercanos |
| `prompt.md` | Las instrucciones y el formato de respuesta, generados desde las plantillas de `tools/ai-helper/prompts/` |

- **No se envía el PDF original**, solo las páginas como imágenes y sus textos. Esas imágenes y textos **contienen el contenido del documento** (datos personales, importes…): usar solo PDF que el cliente permita enviar a ese proveedor.
- La línea de comandos solo lleva una frase fija («Lee el archivo prompt.md…»); nunca contenido del PDF.
- La carpeta temporal se borra al terminar (salvo `--keep-work`). En `out/` solo quedan las respuestas del CLI y las coordenadas propuestas; `out/` y `pairs/` no se suben a git.
- Los valores de prueba y las anotaciones de B no se mandan; solo la plantilla A.

## Claude (`claude -p`)
- **Qué usa:** el CLI de Claude Code con el inicio de sesión de la suscripción (Pro/Max), en modo no interactivo, con la herramienta de lectura de archivos permitida (`--allowedTools Read`) y `--output-format json`. Sin `--bare` (con `--bare` no usa el login de suscripción).
- **Clave de API:** si existe `ANTHROPIC_API_KEY` en el entorno, el CLI cobra por API sin avisar. El script la quita del entorno del CLI; `--keep-api-key` la conserva (solo para pruebas internas).
- **Límites:** ventana de 5 horas y límite semanal de la suscripción, compartidos con el uso normal de Claude y Claude Code. Cada llamada es una sesión del CLI. El script de la fase 0 hace **una llamada por par** (un reintento si la respuesta no es JSON válido); la app hace **una por página de A con campos**, más re-preguntas y reintentos, con un tope de 8 por PDF (ver «Cómo pregunta el ayudante»).
- **Términos (leer antes de ampliar el uso):** la documentación del [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) indica que Anthropic no permite a terceros ofrecer el login de claude.ai ni sus límites en sus productos. Este uso es local y personal: la app ejecuta el `claude` que cada persona instaló y con el que inició sesión, y no maneja credenciales. Es razonable pero **no es una autorización expresa**: no distribuir la función con credenciales, no usar la sesión de otra persona y cada persona usa su propia suscripción. Ver la documentación de [`claude -p`](https://code.claude.com/docs/en/headless) y la de [Claude Code con planes Pro/Max](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan).
- **Imágenes:** el modelo las abre con la herramienta Read desde la carpeta de trabajo (funciona en la fase 0).

## Prueba de lectura de imágenes
Cada PNG que se deja al CLI lleva un código de 4 caracteres enorme en una franja añadida debajo de la página y el prompt exige devolverlos en `images`. Solo se exigen los códigos **de las imágenes de esa petición**. Sin ellos la respuesta se descarta y se reintenta (hasta 2 intentos, con cualquier proveedor). **La primera petición del PDF hace de prueba**: si tras sus intentos no devuelve los códigos, el ayudante no gasta más peticiones en ese PDF; así un modelo que no ve imágenes no coloca campos usando solo los JSON. Si el pase sin IA ya había colocado campos, se devuelve un **parcial** con ellos (`details.aborted = 'images_not_read'`, diagnóstico `partial`, el resto `why: 'sin_respuesta'` y el motivo en `warnings[0]`); si no había nada colocado, responde `images_not_read` como error. Si falla una petición posterior, solo quedan sin colocar sus campos (y entran en la re-pregunta).

## Cómo pregunta el ayudante (por partes)
Plan completo: [`docs/PLAN-IA-ROBUSTA.md`](PLAN-IA-ROBUSTA.md). Código: `tools/ai-helper/pipeline.mjs` (E/S y CLI), `tools/ai-phase0/passes.mjs` (orquestación, sin E/S) y `tools/ai-phase0/lib.mjs` (reglas puras).
0. **Pase sin IA** (`tools/ai-phase0/text-first.mjs`, ver «Colocar sin IA» abajo): los campos cuya etiqueta de A está igual en B y tienen hueco dibujado en el mismo lado se colocan sin preguntar. Si se colocan todos, no hay ninguna llamada (`requests: 0`).
1. **Preparación (sin IA).** Páginas útiles de A = las que tienen campos que quedan por colocar; solo esas se envían. B se lee entero en local para elegir candidatas.
2. **Candidatas de B** por página útil de A: con la tabla de páginas A↔B (`template.pageMap`), las páginas de B que apuntan a esa A; sin tabla (o si la tabla no le asigna ninguna), las 3 páginas de B con más palabras compartidas (normalizadas, ≥ 3 letras, sin números; `CANDIDATE_PAGES`); si B tiene 3 páginas o menos, todas.
3. **Pasada 1:** una petición por página útil de A con esa página, sus candidatas, sus textos y solo sus campos.
4. **Pasada 2:** los campos sin colocar (`found:false` —también con `absent`—, ancla no encontrada o sin respuesta) se vuelven a preguntar, una petición por página de A, con las 3 siguientes páginas de B aún no enviadas (por orden de parecido) o, si ya se enviaron todas, con las mismas y el motivo de cada fallo. Si un campo sale colocado varias veces, gana el de mayor confianza.
5. **Reintentos** (cualquier proveedor): hasta 2 intentos por petición (1 si la persona desactiva «reintentar») si el JSON no vale, menos de la mitad de los campos son válidos o faltan códigos de imágenes de esa petición.
6. **Tope:** como mucho **8 llamadas al CLI por PDF** (`MAX_REQUESTS_PER_PDF`, reintentos incluidos). Al llegar se devuelve lo colocado con el diagnóstico `cap_reached`. Las llamadas de un PDF van en serie; la concurrencia entre PDF no cambia.
7. **Errores:** `limit`, `aborted` y `missing` se lanzan (pausan o cortan el lote). `timeout` o `cli_error` en una petición, o `images_not_read` en la primera, devuelven lo ya colocado (también sin IA) como parcial con `details.aborted = <código>`; si aún no hay nada colocado, se lanzan.

**Prompts editables.** Los textos están en Markdown en `tools/ai-helper/prompts/`: `traslado.md` (pasada 1), `repregunta.md` (pasada 2), `reintento-imagenes.md` y `reintento-json.md` (avisos de reintento). El código solo rellena los `{{marcadores}}` (cada archivo lista los suyos en un comentario, que no se envía); un marcador desconocido hace fallar la petición en vez de mandar un prompt roto. El script de la fase 0 (`run.mjs`) sigue con la petición única de siempre (`buildPrompt`) para comparar con las medidas anteriores.

**Contrato con la app** (`result.rows[]`): una fila por campo; las colocadas llevan además `source: 'text' | 'ai'` (pase sin IA o IA) y `snapped` (encajada en un hueco dibujado); las no colocadas, `why` (`sin_resultado`, `ancla_A_no_encontrada`, `ancla_B_no_encontrada`, `sin_respuesta` o `no_existe_en_b`).

**Contrato con la app** (`result.details`): `placedWithoutAi` = campos colocados por el pase sin IA; `attempts[]` lleva una entrada por llamada al CLI con `n`, `pass` (1 | 2), `group` (`"A-p3"`), `images` (nombres enviados), `fields`, `retry`, uso, pasos y recuentos; `requests` = total de llamadas; `plan` = `[{ group, candidatesB: ["B-p1", …], fields }]`; `sent` resume lo realmente enviado (imágenes sin repetir, JSON sumados por petición, páginas y textos enviados); `placed`, `notPlaced` (recuento por `why`, incluido `no_existe_en_b`), `diagnosis` (además `cap_reached`) y `aborted` si se cortó por `timeout`/`cli_error`/`images_not_read` (con campos ya colocados, también sin IA). `requests` puede ser 0. `onStage('asking', n)` da el número de llamada dentro del PDF.

## Huecos de escritura
En formularios sin campos AcroForm el fallo típico es **dónde** va el valor: en B el hueco pasa de estar debajo de la etiqueta a su derecha, o las casillas cambian de separación. Para colocar sobre el dibujo real y no con «ancla + desplazamiento de A», `readPdf` (`tools/ai-phase0/pdf.mjs`) devuelve además `slots: [{ page, kind: 'line' | 'box', x, y, w, h }]` en puntos PDF (origen abajo-izquierda, como los textos), sacados de `page.getOperatorList()` con la matriz actual (save/restore, `cm`, formularios XObject). Las reglas puras viven en `tools/ai-phase0/slots.mjs` (tests en `slots.test.mjs`, también con PDF generados con pdf-lib). Desde la rc.4 las usan el pase sin IA y la resolución de las respuestas (`tools/ai-phase0/place.mjs`).
- **Línea** (`line`): trazo horizontal ≥ 20 pt y ≤ 3 pt de grosor, rectángulo relleno muy bajo o borde inferior de un recuadro alargado (≤ 30 pt de alto, marcado `frame`). `y` = altura del trazo, `h` = grosor; los trozos contiguos se unen y las discontinuas llevan `dashed`.
- **Casilla** (`box`): rectángulo casi cuadrado de 5–20 pt (trazado, relleno o con cuatro trazos sueltos); las concéntricas se cuentan una vez.
- **Línea escrita con caracteres** (`line` con `fromText: true`, `slotsFromTexts`): textos de `readPdf` hechos de guiones bajos o puntos (≥ 3 `_` o ≥ 4 `.`, cada `…` vale 3, con como mucho un espacio entre ellos), solos («________») o dentro de un texto («Nombre: ________»: el hueco empieza donde empiezan los guiones). Sin más detalle de pdf.js, su posición dentro del texto se estima repartiendo el ancho `w` del texto según el ancho aproximado de cada carácter (Helvetica). `y` queda 2 pt bajo la línea base, así el punto de escritura cae en la línea base del texto. Mínimo 20 pt; si ya hay una raya dibujada en el mismo sitio, no se repite. No cuentan «Etc...», «Sr. D.» ni importes.
- `nearestSlot(ancla, slots, opciones)`: para un texto `{ page, x, y, w? }` devuelve la línea a su derecha en la misma línea base o justo debajo (radio 200 pt; `prefer: 'auto' | 'right' | 'below' | 'above' | 'left'`, y `strict: true` para no aceptar otro lado), o con `kind: 'box'` la casilla a la izquierda del texto de la opción (`boxSide`). Con `texts` descarta huecos con otro texto en medio y, debajo/encima, las líneas con su propia etiqueta a la izquierda (son el hueco de otro dato); los textos que son solo relleno no cuentan como «otro texto», y un ancla con su propio relleno («Nombre: ____») mide desde el final de la etiqueta, así ese relleno es su hueco a la derecha. El pase sin IA compara etiquetas sin su relleno («Nombre: ____» = «Nombre: ________»). Da `{ slot, side, distance, point }`; `point` es donde se escribiría (inicio de la línea 2 pt por encima, o centro de la casilla).
- **Límites:** la posición de un relleno dentro de un texto es una estimación (unos pocos pt de error con fuentes muy distintas de Helvetica); no ve puntos sueltos muy separados (más de un espacio), rellenos con guiones (`-----`), curvas ni casillas redondas, huecos sin dibujo (solo espacio en blanco) ni páginas giradas; en tablas, cada celda baja puede salir como línea y una raya separadora larga puede confundirse con «debajo». Los textos de `readPdf` traen su ancho `w` (el de pdf.js); sin él, el ancla mide desde su inicio.

### Anclar en B y encajar en el hueco (rc.4)
**Respuesta de la IA por campo:** `{ id, found, page, anchorB, side?, anchorA?, dx?, dy?, absent?, confidence, reason }`. Con `found`, `page` y `anchorB` son obligatorios; **`anchorA` es opcional**: la IA puede usar cualquier etiqueta de B que signifique lo mismo que el campo (`label` = `mapField`, `type`), aunque en A no hubiera etiqueta cerca. `side` ∈ `right` · `below` · `above` · `left` · `box-left` · `box-right` (dónde está el hueco respecto a la etiqueta de B; uno desconocido se ignora). `dx`/`dy` solo como último recurso. `absent: true` (con `found:false`) = el dato no existe en B.

**Cómo se coloca** (`resolveProposal` en `lib.mjs`, reglas en `place.mjs`): check/radio buscan casilla (`box`; `left`/`right` se leen como `box-left`/`box-right`) y el resto línea (`line`).
1. Con `side`: el hueco de ese lado del ancla de B (`nearestSlot` estricto, con los textos de la página) → `snapped: true`.
2. Sin hueco en ese lado (o sin `side`) y con `anchorA`: ancla B + (campo A − ancla A) + (dx, dy); si a ≤ 15 pt hay un hueco del mismo tipo (`SNAP_DISTANCE`), se ajusta a él.
3. Sin hueco ni `anchorA`: junto al ancla de B según `side` (por defecto a la derecha, o casilla a la izquierda), con confianza ≤ 0,5.

**Convención x,y de la app** (comprobada en `pdf-export.service.ts` y `redrawAllForPage`): para todos los tipos, x,y es el **inicio de la línea base** de lo que se pinta (`drawText(texto, { x, y })`; en el editor `top = alto − y·escala − fontSize·escala`). Un check/radio pinta una «X» con esa regla (Helvetica por defecto). Por eso: en una línea, x,y = inicio de la raya + 2 pt y 2 pt por encima (o la línea base de la etiqueta si la raya está justo debajo de ella, en la misma línea); en una casilla, x = centro − 0,667·fontSize/2 y y = centro − 0,718·fontSize/2 (media «X» de ancho y media altura de mayúscula de Helvetica; `toFieldXY`, `fontSize` 14 si falta). Con otra fuente o un valor distinto de «X» queda casi centrado, no exacto.

**No existe en B:** un campo queda con `why: 'no_existe_en_b'` si la última respuesta dijo `absent` y ya se preguntó por él con **todas** las páginas de B (`askedB` en `runPasses`); si no, `sin_resultado`. El proveedor simulado responde `absent` cuando el texto de A no está en ninguna página de B.

### Colocar sin IA (pase previo)
`tools/ai-phase0/text-first.mjs`, antes de la pasada 1. Por cada campo se miran sus textos cercanos de A con pinta de etiqueta (≥ 3 letras, ≤ 60 caracteres, el más cercano primero). **La primera que tenga una relación clara con el campo decide** (derecha/izquierda en la misma línea, debajo/encima a ≤ 45 pt, o casilla a la izquierda/derecha del texto de la opción): si esa etiqueta aparece **una sola vez** en todo B (normalizada, exacta) —o se repite igual en A y B y el orden de lectura la empareja— se busca con `nearestSlot` el hueco de B en ese mismo lado. Si lo hay: colocado sin IA (`source: 'text'`, confianza 0,75, motivo «Colocado sin IA: etiqueta «X» idéntica y única en B, hueco a la derecha»). Si no hay hueco, o la etiqueta cambió o es ambigua, el campo va a la IA (no se prueba con la etiqueta de otro dato). Lo colocado así no se envía. `AI_HELPER_TEXT_FIRST=0` lo desactiva (para medir la IA sola). En los 6 casos de `sample-plano/` coloca 31 de 45 campos, todos en su página y a 2 pt de la solución conocida.

## Copilot (`copilot -p`) — pendiente de probar
- **Qué usa:** el CLI de GitHub Copilot con la sesión de GitHub de la persona (credenciales del llavero del sistema, o `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN`). La documentación de [planes](https://docs.github.com/en/copilot/get-started/plans) dice que todos incluyen el CLI.
- **Imágenes con `--attachment` (por defecto).** El ayudante añade `--attachment=<A-p1.png>` por cada página de la petición (verificado con un PNG en Copilot CLI 1.0.109; con varios, pendiente de confirmar). `COPILOT_ATTACH_IMAGES=0` lo desactiva y deja los PNG solo en la carpeta. La prueba de lectura sigue detectando si Copilot no las ha leído.
- **Consumo real de Copilot.** El ayudante lanza `copilot -p … --output-format json` y lee el JSONL: tokens (entrada, salida, caché) y créditos de IA (`totalNanoAiu / 1e9`, aproximado) del último `session.usage_checkpoint`, y la respuesta del último `assistant.message`. Si tu versión no emite ese JSON, la ventana lo dice y no inventa cifras.
- **Consumo.** Desde junio de 2026 Copilot cobra en «AI credits» según tokens de entrada, salida y caché y el modelo (no por petición premium). `copilot -p` no documenta un resumen de uso, así que la app no mide créditos con Copilot: se mira en GitHub antes y después.
- **Sin prueba previa propia.** Ya no hay una petición de prueba solo para Copilot: como con Claude, la primera petición del PDF hace de prueba y, si no devuelve los códigos tras sus intentos, se corta con `images_not_read` (el mensaje incluye cómo repetirlo a mano con una copia local de los PNG).
- **Lectura parcial con Copilot.** Con Copilot la prueba acepta 2 de 4 caracteres acertados por código, porque reescala las imágenes y a veces responde «?» en lo que no distingue.
- **Sin terminal.** El ayudante añade `--deny-tool=shell` (la denegación gana a `--allow-all-tools`): Copilot hacía ~12 llamadas `bash` explorando antes de contestar. `COPILOT_ALLOW_SHELL=1` lo quita.
- **Banderas del CLI sin verificar.** El script lanza `copilot -p "<frase fija>" --allow-all-tools` desde la carpeta de trabajo. Si tu versión usa otras, defínelas con la variable `COPILOT_ARGS` (lista JSON; `{{prompt}}` se sustituye por la frase fija), por ejemplo `COPILOT_ARGS='["-p","{{prompt}}","--allow-all-tools"]'`. `--allow-all-tools` da permiso al CLI sobre las herramientas de esa sesión: ejecútalo solo en la carpeta temporal.
- **Imágenes:** la documentación del [SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input) solo admite imágenes (PNG/JPEG recomendados; no PDF ni SVG) y exige un modelo con visión. **Qué modelos tienen visión no está confirmado**: se comprueba al probarlo (`models.list` del SDK). Si el CLI no lee imágenes por ruta, la alternativa es el Copilot SDK en el ayudante local, siempre con la sesión del CLI y sin BYOK.
- **Límites y cuota:** el consumo cuenta contra la cuota del plan (créditos o premium requests con un multiplicador por modelo; las cifras exactas no se pudieron confirmar y la documentación está cambiando). Con BYOK el proveedor factura aparte, pero BYOK está descartado.
- **Políticas de empresa:** los administradores pueden activar o desactivar superficies de Copilot por organización. El cliente da por permitido el CLI con modelos con visión; **confirmar la política vigente el día que se use** y qué retención de datos aplica a lo enviado (el contenido de las páginas).
- **Compatibilidad:** el CLI y el SDK evolucionan rápido (algunas APIs del SDK son experimentales); el adaptador está aislado en `providers.mjs`.

## Medir los créditos reales de Copilot (guion)
Objetivo: poder decir «≈ X créditos por PDF, medido en nuestra prueba» sin inventar cifras. Necesita la cuenta de Copilot de quien lo ejecuta; no puede hacerlo un agente en la nube.
1. Instala y abre sesión en `copilot`; `cd tools/ai-phase0 && npm install && npm run sample`.
2. Apunta el consumo actual de «AI credits» en GitHub → Settings → Copilot → Usage (**antes**).
3. `node run.mjs --provider copilot` (los 6 casos de `sample-plano/`; una petición por par, sin reintento; añade `--timeout 600` si hace falta).
4. Espera unos minutos a que GitHub actualice y apunta el consumo (**después**).
5. `node credits-report.mjs --github-before <antes> --github-after <después>`: tabla por caso con los tokens y créditos que dio el propio CLI, el total y el cociente GitHub/CLI (si ≈ 1, la cifra del CLI es fiable y la app puede mostrarla).
6. Pega la tabla en el hilo del proyecto; con ese dato se cambia el texto del diálogo de «Trasladar con IA» (clave `batch.ai.*`, etiquetado «medido en nuestra prueba») en una PR aparte, con diseño si cambia algo visible.
No mezcles otro uso de Copilot durante la medida, o el «después» no será comparable.

## Cómo medir (fase 0)
`cd tools/ai-phase0 && npm install && npm run sample && npm test`; después `node run.mjs --provider claude` (Windows PowerShell incluido) y, cuando toque, `--provider copilot` o `both`. Resultados en `out/summary.md`. Detalles y formato de casos en el [README de la herramienta](../tools/ai-phase0/README.md). Para medir el motor que usa la app (no la petición única de la fase 0), usa `bench.mjs` (siguiente sección).

## Banco de medida con el motor de la app (`bench.mjs`)
`run.mjs` mide la petición única de la fase 0; **`tools/ai-phase0/bench.mjs` mide el motor que usa la app** (`runProposal` de `tools/ai-helper/pipeline.mjs`: pase sin IA, pasadas por página, anclar en B y huecos). Por defecto ejecuta cada caso **dos veces, con y sin el pase sin IA** (`AI_HELPER_TEXT_FIRST=0`), para ver cuánto ahorra.

**Preparación (una vez):** tener `claude` (o `copilot`) instalado y con la sesión iniciada, y `cd tools/ai-phase0 && npm install`.

**Ejecutar** (igual en macOS/Linux y en Windows PowerShell; en PowerShell las rutas pueden ir con `\` y entre comillas si llevan espacios):
```
cd tools/ai-phase0
npm run bench -- --provider fake                    # prueba sin IA (proveedor simulado), sobre sample-plano/
npm run bench -- --provider claude                  # los 6 casos de sample-plano/ con Claude
npm run bench -- --provider claude --model haiku --cases "C:\Users\yo\Documents\casos-ia"
node bench.mjs --provider copilot --cases ..\..\mis-casos --no-retry
```
| Opción | Qué hace |
| --- | --- |
| `--cases <carpeta>` | Tus casos (por defecto `sample-plano/`). Mismo formato que `run.mjs`: subcarpetas con `A.pdf`, `A.json` (plantilla de A), `B.pdf` y, opcional, `expected.json` (solución conocida: `[{ "id": "p1-f1", "page": 1, "x": 90, "y": 700 }, { "id": "p1-f2", "gone": true }]`); o la carpeta de un solo caso; o archivos planos `A-<caso>.pdf`, `A-<caso>.json`, `B-<caso>.pdf`, `expected-<caso>.json`. El `id` es `p<página>-f<posición en esa página>` según `A.json`. |
| `--provider claude\|copilot\|fake` | CLI con el que preguntar (por defecto `claude`). `fake` = proveedor simulado, sin gastar nada. |
| `--model <id>` | Modelo del CLI (como el desplegable de la app). Sin él, el de la app (`sonnet` con Claude; el del CLI con Copilot). |
| `--no-retry` | Sin re-pregunta ni reintentos (como desmarcar «reintentar» en la app). |
| `--text-first both\|on\|off` | Con y sin pase sin IA (`both`, por defecto), solo con él o solo sin él. Con `off` o `both` se gasta más. |
| `--timeout <s>` · `--max-requests <n>` · `--keep-api-key` · `--out <carpeta>` | Tiempo por petición (300), tope de peticiones por PDF (el de la app), no quitar `ANTHROPIC_API_KEY` y carpeta de salida (`out/`). |

**Qué saca:** `out/bench-<fecha>.md` (tabla por caso y totales, una por modo, y la comparación con/sin pase sin IA) y `out/bench-<fecha>.json` (lo mismo con el detalle por campo). Por caso: campos, colocados, colocados sin IA, «no existe en B», sin colocar por motivo (`ancla_B_no_encontrada`, `sin_resultado`…), página acertada y aciertos a ≤ 5 pt y ≤ 15 pt (solo con `expected`, en la misma página), ausentes bien detectados, peticiones (con «(tope)» si se alcanzó el máximo), tokens y coste/créditos **solo si el CLI los da** («–» si no), y segundos. Si salta el límite de uso, se para y lo dice (no gasta más intentos). Un caso que falla aparece con su código (`images_not_read`, `timeout`…).

**Qué sale del ordenador y qué no.** Como en la app: el CLI elegido recibe las imágenes de las páginas y los textos de las páginas de cada petición (ver «Qué se envía a la IA»); con `fake` no sale nada. Los PDF se preparan en una carpeta temporal que se borra al terminar. El informe (`.md`/`.json`) **no lleva contenido de los PDF**: solo nombres de caso (el nombre de archivo o carpeta), ids de campo, `mapField` de la plantilla, páginas, coordenadas, números y motivos en código; ni textos, ni anclas, ni las explicaciones de la IA, ni los mensajes de error del CLI (esos solo se ven en la consola). `out/` no se sube a git. Para compartir resultados basta con pegar el `.md`.

## Usarla en la app (lote)
1. Instala y abre sesión una vez en `claude` (o `copilot`) desde una terminal.
2. `npm install` y `npm run start:ia`: arranca la app (`http://localhost:4200`) y el ayudante (`127.0.0.1:4310`). La primera vez instala las dependencias de `tools/ai-phase0` (pdf.js y canvas, solo para el ayudante).
3. En el editor de un PDF del lote con versión B y plantilla A: chip «✦ IA» (debe decir que hay conexión) → «Poner plantilla A ▾» → «Copiar y adaptar con IA».
4. Revisa en «Dividida» y pulsa «Aplicar N cambios» (un solo paso de deshacer). B no cambia hasta entonces.

**Cómo está montado.** El navegador no puede lanzar programas, así que `tools/ai-helper/server.mjs` hace de puente: escucha solo en `127.0.0.1`, atiende solo a los orígenes de la app (`AI_HELPER_ORIGINS`), comprueba `Host` (contra DNS rebinding) y exige un token que reparte solo a esos orígenes. Recibe los PDF y la plantilla A, prepara imágenes y textos en una carpeta temporal (que borra al terminar), lanza el CLI con una instrucción fija (nada del PDF va en la línea de comandos) y devuelve una fila por campo. La respuesta de la IA nunca se evalúa: se valida y la app calcula x,y a partir de los textos. Cancelar en la app mata el CLI.

**Cola propia y concurrencia.** El ayudante lleva un semáforo por proveedor: **2 peticiones a la vez con Claude** (`AI_HELPER_CONCURRENCY=1` lo baja a 1; nunca más de 2) y **siempre 1 con Copilot**, para no provocar picos de créditos. `/propose` y el lote comparten los huecos; con todos ocupados `/propose` responde 409 `busy`. `GET /status` añade `slots`, `batches` y `queue: true` (versión 2).

**Lote en el ayudante (`/batch`, todo con `x-ai-token`).** La cola vive en el proceso del ayudante, así que sigue aunque el navegador se recargue o se cierre (hasta que se pare el ayudante; los lotes terminados caducan a las 2 h):
| Ruta | Qué hace |
| --- | --- |
| `POST /batch` `{provider, model?, retry?}` | Crea el lote y devuelve su `id` |
| `POST /batch/:id/items` `{itemId, a, b, template, instructions?, last?}` | Añade un par (uno a uno, para no cargar todos los PDF en una sola petición); `last: true` cierra el lote |
| `GET /batch/:id` · `GET /batch` | Estado: recuentos y estado/etapa por par; `rev` sube con cada cambio |
| `GET /batch/:id/items/:itemId` | Estado del par y su propuesta (`result`) |
| `POST /batch/:id/resume` `{retryFailed?}` | Reanuda tras un límite o el cortacircuitos; opcionalmente reencola los fallidos |
| `POST /batch/:id/cancel` · `DELETE /batch/:id` | Cancela (aborta los CLI en curso) / olvida el lote |

Reglas: un **límite de uso** pausa el lote entero y deja los pendientes «en cola» (no fallidos), con la hora de renovación; **2 fallos seguidos del mismo tipo** (`cli_error`, `timeout`, `missing`) pausan también; un fallo propio del PDF (`images_not_read`…) solo marca ese par. La respuesta de la IA se sigue tratando como no confiable en la app (`sanitizeRow`). La app la usa por defecto (`AiBatchService.runRemote`): sube los pares uno a uno, sondea cada segundo y guarda en `localStorage` (`pdf-annotator.ai.queue`, no confiable) lo necesario para reengancharse tras recargar. Con Copilot y más de 10 PDFs se mantiene la cola del navegador por el tope de peticiones. Pruebas: `npm run test:helper` y los tests de `ai-batch.service.spec.ts`.

**Modelo.** Sin elegir, Claude usa `sonnet` (`--model`) y Copilot el modelo por defecto del CLI. Se eligen en un desplegable (panel del chip «✦ IA» y confirmación del lote) con la **lista real de cada CLI**, que el ayudante lee con `GET /models`: Claude Code por la petición de control `initialize` del modo stream-json (la misma lista que `/model`, sin gastar tokens) y Copilot CLI por su servidor ACP (`copilot --acp`, respuesta de `session/new`). No se escribe a mano. La lista se guarda en este ordenador y se refresca al abrir; si falla, se ofrece la última guardada. Para Copilot hace falta tener la sesión iniciada (`copilot login`). Se recuerda la elección en este ordenador. Un modelo mayor agota antes el límite de 5 h/semanal de Claude; en Copilot cada petición descuenta «premium requests» según el multiplicador del modelo (confirmar con tu administrador las cifras de Business/Enterprise).

**Variables del ayudante:** `AI_HELPER_PORT`, `AI_HELPER_ORIGINS`, `AI_HELPER_TIMEOUT` (segundos, 300), `AI_HELPER_KEEP_API_KEY=1` (por defecto se quita `ANTHROPIC_API_KEY` para usar la suscripción), `COPILOT_ARGS` (banderas de Copilot sin verificar), `AI_HELPER_FAKE=1` (proveedor simulado para los e2e), `AI_HELPER_TEXT_FIRST=0` (desactiva el pase sin IA).

**Seguridad.** El ayudante no entra en Docker ni en el despliegue. La CSP de `nginx.conf` permite `connect-src http://127.0.0.1:4310` solo para que, con el ayudante abierto en tu equipo, la app pueda hablarle; sin él, la opción aparece desactivada y explica cómo arrancarlo.

## Instrucciones para la IA (A6)
Pistas opcionales sobre los documentos (máx. 500 caracteres): «Las casillas van a la izquierda del texto», «El CIF ahora se llama NIF». Se escriben en el popover de «Trasladar con IA» del lote (para todos sus PDF) o en el panel del chip «✦ IA» del editor (solo ese PDF; si no se tocan, se usan las del lote). Las del lote se guardan con el lote (registro `__batch-settings__` de su IndexedDB; en un proyecto de escritorio, en `localStorage` de este ordenador por proyecto) y las de un PDF en su `BatchItem.aiInstructions` (`undefined` = las del lote, `''` = ninguna).

- **Envío:** `instructions` en `POST /propose` y en `POST /batch/:id/items` (por PDF). El ayudante las limpia otra vez (`tools/ai-helper/instructions.mjs`: texto plano, sin caracteres de control ni de dirección, saltos normalizados, ≤ 500).
- **Prompt:** van citadas línea a línea («> ») en una sección «Indicaciones de la persona» (marcador `{{instrucciones}}` de `traslado.md` y `repregunta.md`, antes de la prueba de lectura), que avisa de que no cambian las reglas ni el formato de la respuesta. Sin indicaciones, el prompt es el de siempre byte a byte. `result.details.instructions` = n.º de caracteres enviados (el texto no se repite).
- **Banco:** `npm run bench -- --instructions "<texto>"`; el informe solo dice cuántos caracteres llevaba.

## Ver detalles y consumo
El botón «Ver detalles» (barra de la IA, en carga, error, sin cambios y revisión) abre un modal con los pasos, lo enviado y el consumo. El ayudante emite líneas `{event}` durante la petición y `result.details` al terminar (`tools/ai-helper/pipeline.mjs`; en el navegador `utils/ai-proposal.utils.ts` las trata como no confiables).
- **Claude** corre con `--output-format stream-json --verbose`: da cada paso (qué archivos lee), tokens reales (entrada, salida, caché) y coste equivalente en API. Con suscripción no se cobra aparte.
- **Copilot** no expone uso en `-p` según su documentación: el modal dice «No medible» y solo enseña peticiones enviadas, tamaño de lo enviado y una **estimación de tokens marcada como tal**. Nunca se muestran cifras inventadas.
- **Diagnóstico de «sin cambios»** (`diagnose` en `pipeline.mjs`): A o B sin texto extraíble, permiso denegado a la CLI, tope de peticiones alcanzado (`cap_reached`), respuesta no válida, anclas inexistentes o la IA no encuentra nada. El informe copiable no lleva contenido de los PDF.

## «Igual que en A» (1.17)
Si un campo no tiene en B ninguna etiqueta que lo identifique pero la IA ve su hueco en el mismo sitio que en A, responde `"sameAsA": true` con su página de B (sin `anchorB`). `resolveProposal` lo pone en la posición de A ajustado al hueco (≤ 15 pt) con confianza ≤ 0,6 (`SAME_AS_A_CONFIDENCE`), así que nunca va marcado: la persona lo revisa. El motor no coloca nada en la posición de A por su cuenta. El proveedor simulado lo usa cuando la página de A no tiene ningún texto.
