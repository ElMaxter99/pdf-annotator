## Unreleased
### Fixed
- **La IA ya no aparece en la web pública (Vercel):** el botón «Trasladar con IA», el chip «✦ IA» del editor, «Copiar y adaptar con IA» y sus paneles solo se ven en local (`localhost`) y en la app de escritorio, porque la IA depende de la CLI (`claude`/`copilot`) de cada persona. Test e2e incluido.
- **Ubuntu/Fedora: el aviso de actualización instala desde la propia tarjeta** (antes, con el `.deb` o el `.rpm`, decía «Descargar» y solo abría la página de descargas). Ahora funciona como en Windows: «Actualizar ahora», barra de progreso y «Reiniciar ahora»; al instalar, el sistema pide la contraseña con su diálogo. Solo cae en manual un Linux sin AppImage/deb/rpm reconocible.

### Changed
- **Panel del lote compacto (mesa P-46):** la cabecera deja solo el progreso, «Trasladar con IA» y «Revisar siguiente»; «Datos de prueba» pasa al menú ⋯ y «Descargar listos» sale en la cabecera en cuanto hay alguno listo (antes de eso está, desactivado, en ⋯). La tira de versiones B es una sola línea («Versiones B añadidas: N» y «Añadir más») y el borde punteado solo aparece al arrastrar archivos encima; en cada fila, «Revisar», «Subir B» y quitar aparecen al pasar el ratón o al enfocarla, y el estado es un punto de color + la palabra. La selección múltiple sigue para la 1.11.
- **«Trasladar con IA» en lote con un panel único (mesa P-42):** el botón abre un popover de una sola decisión («N PDF con A y B · N campos», proveedor y modelo recordados y plegados bajo «Cambiar», con «Qué se envía» dentro) en lugar del menú y del diálogo de ocho bloques; el avance, los fallos («Reintentar N»), Pausar/Parar y «Revisar el primero» viven en un panel lateral no modal que no tapa la lista (se cierra con ✕ o Esc y el trabajo sigue; una píldora lo reabre), y «Detalles ▾» despliega pasos, qué se envía y consumo dentro del mismo panel en vez del modal de pantalla completa. Textos en los 7 idiomas, test unitario y e2e adaptados.
- **Pie de estado y «Acerca de» (mesa P-47):** el pie del editor enseña ahora «Guardado hace N s», el zoom y un botón «Ajustar» (página entera), con la versión y el canal; los créditos («© … Desarrollado por…», licencia) pasan al menú ⋯ → «Acerca de».
- **Al abrir un PDF se ajusta a la página (mesa P-47):** en escritorio el zoom inicial hace que la página entera quepa en el visor sin scroll (antes 150 %). La sesión recuperada conserva su zoom.

## [v1.9.2](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.9.2) - 2026-11-13
### Changed
- **Interfaz más simple a 1080p (mesas P-40 a P-44):** el panel izquierdo del workspace mantiene fijos el botón ⟨ y las pestañas y solo se desplaza su contenido (un único scroll por zona); las coordenadas del cursor pasan al pie; las ayudas fijas bajo botones, casillas y títulos de Avanzado, JSON, plantillas y guías pasan a un icono ⓘ con la explicación al pasar el ratón o con el foco; atajos, tema e idioma van siempre en el menú ⋯ (antes solo por debajo de 1200 px); en el editor del lote la propuesta de la IA flota al pie del visor en vez de apilar una tercera barra y las barras son más bajas; los estados de campo usan un chip neutro con punto de color (ámbar = atención, turquesa = nuevo); «Colocar» y «Descartar» aparecen al pasar el ratón o al enfocar la fila; solo se ve un aviso a la vez, sin repetidos, arriba a la derecha del visor.

## [v1.9.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.9.1) - 2026-11-13
### Fixed
- **El código de verificación de las imágenes salía como recuadros vacíos en algunos equipos** (la fuente `monospace` no tenía las letras): era lo que hacía fallar la lectura con Copilot aunque viera la imagen. Ahora se dibuja con glifos propios (rectángulos), sin depender de ninguna fuente del sistema, con tests que lo leen de vuelta del PNG.
- **Copilot: adjuntos con ruta absoluta** (`--attachment <ruta>`, la forma que se verificó a mano) en vez de `--attachment=nombre` relativo. Si la prueba previa falla, el error incluye un comando reproducible y deja las dos páginas en una carpeta temporal local (`pdf-annotator-ai-debug`) para compararlo a mano con Copilot.
- **Copilot y la prueba de lectura de imágenes**: Copilot reescala las páginas y a veces devuelve «?» en los caracteres que no distingue (p. ej. «?62?» por «V62J»). Con Copilot basta ahora con acertar 2 de los 4 caracteres de cada código (por azar es ~1 entre 200) y el prompt le pide su mejor lectura, nunca «?».
- **«Trasladar con IA» en lote se salta los PDFs marcados como «Listo»** (antes los procesaba igual y gastaba la petición). Además, la franja con el código de verificación va ahora añadida debajo de cada página y es enorme (Copilot reescala las imágenes y solo leía parte del código pequeño), el paso ya no dice «de 2» intentos y el informe del lote no muestra «0 tokens · medido» junto a «consumo no medible».
- **Traslado con IA con Copilot, corte temprano**: antes de la ejecución completa se hace una prueba barata con dos páginas adjuntas (A y B) y, si Copilot no lee sus códigos, se para ahí con un aviso claro en vez de gastar cientos de miles de tokens (`COPILOT_PROBE=0` la desactiva). Con Copilot ya no se reintenta si no lee las imágenes, y el prompt le dice que vienen adjuntas.
- **Copilot en el traslado con IA**: se le deniega la terminal (`--deny-tool=shell`; `COPILOT_ALLOW_SHELL=1` lo permite) porque exploraba con decenas de llamadas `bash` y multiplicaba el consumo, y el prompt le pide abrir cada imagen una sola vez. El error «La IA no ha leído las imágenes» indica ahora qué código devolvió la IA y cuál se esperaba, para diagnosticar el falso positivo.

### Changed
- **El modelo de IA se elige de la lista real del CLI (IA-16, IA-16b):** el ayudante local lee los modelos que ofrece cada CLI, igual que su `/model` (nuevo `GET /models`: Claude Code por la petición `initialize` de su modo stream-json, sin gastar tokens; Copilot CLI por su servidor ACP `copilot --acp`), y el panel «✦ IA» del editor y la confirmación de «Trasladar con IA» en el lote lo muestran en un desplegable (Copilot agrupado por proveedor, con «Automático» arriba). Ya no hay campo de texto ni lista fija Haiku/Sonnet/Opus: no se puede escribir un modelo mal. La lista se guarda en este ordenador (sale al instante y se refresca al abrir), con «Actualizar»; si falla (sin sesión, CLI no encontrado, tiempo agotado) se ofrece la última guardada y «Reintentar»; si el CLI no devuelve nada se usa el modelo por defecto/«Automático»; y si el modelo guardado ya no existe se vuelve a uno válido con un aviso. Textos en los 7 idiomas, con tests unitarios, del ayudante y e2e.

## [v1.9.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.9.0) - 2026-11-13
### Added
- **«Trasladar con IA» sobre todo el lote** (plan en `design/propuestas/traslado-masivo-ia.md`, diseños IA-09 a IA-13): botón en el panel con menú (todos / solo los fallidos), confirmación con estimación de pares, campos, peticiones y privacidad, proveedor en tarjetas (Claude Code / Copilot CLI) y modelo elegido ahí mismo (Haiku / Sonnet / Opus, o «Automático / Elegir…» con Copilot; se comparte con el panel del editor), y cola en serie con progreso por fila, pausa, cancelar uno o todos y reintento de los fallidos. Primero intenta el ajuste por textos sin gastar IA (solo si ambos PDF tienen las mismas páginas y tamaño y el desplazamiento es uniforme); si no, pregunta a la IA. Se detiene al llegar al límite de uso, tras dos fallos seguidos iguales o a las 10 peticiones con Copilot (y espera «Continuar»). Cada fila enseña en qué paso va (con enlace «Ver en vivo», «Ver qué hizo» o «Ver detalles») y la barra tiene «Ver detalles»: el mismo modal que «Copiar y adaptar con IA» de un PDF suelto (resumen, pasos, lo que se envía, consumo), con la lista de PDFs a la izquierda, que sigue al que está en curso, el consumo de todo el lote y informe copiable por PDF o del lote. Cada resultado es una **propuesta guardada** en el lote (`BatchItem.aiProposal`, saneada al leerla) que se revisa PDF por PDF en el editor («Pendientes de revisar», «Siguiente con propuesta»); nunca se aplica en bloque ni «Listo» se marca solo.
- **Release candidates**: «Actions → Release candidate → Run workflow» (en `develop`, con la versión X.Y.Z) etiqueta `vX.Y.Z-rc.N` (N sube solo), compila los instaladores de Windows, macOS y Linux y los publica como **pre-release** de GitHub, para probarlos de verdad antes de la versión final. La versión de los instaladores sale de la etiqueta (`sync-desktop-version.mjs --tag`, sin tocar `package.json` en el repo) y las pre-releases no activan el aviso de actualización de las apps estables. Las notas usan la sección de X.Y.Z del CHANGELOG con un aviso de «versión de prueba». 
- **App de escritorio: canal de actualizaciones «Estable / Pruebas» (RC-01, RC-02)**: selector en el pie del editor (solo en la app instalada). «Pruebas» pide confirmación y, además de las versiones finales, ofrece las pre-releases `X.Y.Z-rc.N`; la tarjeta de actualización lleva la insignia «Prueba» y las notas de la prueba. Estando en una prueba, la versión final se ofrece cuando sale; volver a «Estable» no baja de versión (el aviso lo explica y enlaza GitHub para instalarla a mano). El canal se guarda en la carpeta de datos de la app y por defecto es «Estable». Textos en los 7 idiomas, con tests (`update-logic`, servicio y e2e).

## [v1.8.4](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.8.4) - 2026-11-12
### Fixed
- **App de escritorio: los botones del aviso de actualización («Qué hay de nuevo», «Actualizar ahora») no hacían nada.** El proceso principal comprobaba que el mensaje viniera de `app://pdf-annotator` con `new URL(...).origin`, que en Node vale `null` para esquemas propios, así que rechazaba todas las órdenes de la web (también las de nuevo ventana/navegación de enlaces). Ahora se compara esquema y host (`desktop/trusted-origin.mjs`, con tests).

## [v1.8.3](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.8.3) - 2026-11-12
### Fixed
- La app de escritorio mostraba el icono genérico de Electron (en Linux, Windows y macOS) porque el empaquetado no tenía iconos. Ahora usa el logo de PDF Annotator: PNG de 16 a 1024 px para Linux (`.deb`/`.rpm`/AppImage), `.ico` multitamaño para Windows, icono para macOS y icono en la ventana. También se fija el nombre de escritorio (`desktopName`) para que el sistema asocie la ventana abierta con su icono del lanzador.

## [v1.8.2](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.8.2) - 2026-11-12
### Added
- Copilot: las páginas se adjuntan por defecto con `--attachment` (`COPILOT_ATTACH_IMAGES=0` lo desactiva) y el ayudante lee el consumo real del JSON de Copilot (tokens y créditos de IA ≈), que se muestra en «Ver detalles». Los textos de consumo de Copilot hablan de créditos de IA por tokens, no de peticiones premium.
- Opción «Reintentar una vez si la respuesta no sirve» en el panel de la IA, por proveedor: activada con Claude y desactivada con Copilot (un reintento cuenta como otra petición premium).
- La IA debe demostrar que ha mirado las imágenes: cada PNG lleva un código aleatorio que la respuesta tiene que devolver; si falta tras dos intentos se descarta con el aviso «La IA no ha leído las imágenes» (en vez de proponer solo con los textos). El informe de «Ver detalles» añade los textos por página, no incluye el mensaje del CLI, el consumo en vivo no cuenta dos veces el mismo mensaje y el modal atrapa el foco y navega las pestañas con las flechas.
- «Ver detalles» en «Copiar y adaptar con IA»: modal con los pasos en vivo, lo enviado, el consumo (tokens y coste equivalente medidos con Claude; con Copilot «No medible» y una estimación marcada) y un diagnóstico cuando la IA no coloca ningún campo (A o B sin texto, permisos, respuesta no válida…). Informe copiable sin contenido de los PDF
- El ayudante de IA recoge los pasos, el uso real de tokens (Claude), lo enviado y un diagnóstico de por qué no se colocó nada, y lo emite como eventos `event` y `result.details` (sin interfaz todavía). La IA ya no se confunde con listas JSON ajenas (`[1]`) en su respuesta
- **Volver al inicio y Atrás / Adelante en el editor**: el logo de la barra del editor lleva a la landing (como ya hacía el del lote) y el historial funciona en los dos sentidos. Recargar `/workspace` reabre la sesión guardada en vez de mandarte a la landing, «Adelante» reabre el PDF que dejaste en esta visita (aunque no tuviera anotaciones) y cada PDF del lote tiene su URL (`/workspace?lote=<id>`), así que recargar o volver con el historial abre ese mismo PDF. En la app de escritorio: `Alt+←` / `Alt+→` (`⌘[` / `⌘]` en macOS), los botones laterales del ratón y el gesto de deslizar
- Guía «Cómo instalar» (`docs/INSTALAR.md`) para Windows, macOS y Linux, enlazada desde el README: qué archivo elegir, avisos de instaladores sin firmar, `libfuse2`, actualizaciones y aviso de que Linux solo tiene paquetes x86_64. Las capturas reales están pendientes (huecos marcados)
- Carpeta `tools/ai-phase0/sample-plano/` con los casos de prueba de la IA en plano (PDF A/B, JSON y esperado por caso) para probar el lote a mano.
### Fixed
- «Ver detalles» de la IA: la prueba de lectura de imágenes ya no da falsos positivos, el consumo se muestra también en peticiones fallidas y «Copiar informe» funciona en la app de escritorio.
- La release de escritorio creaba dos borradores duplicados (los 4 jobs de empaquetado en paralelo creaban cada uno el suyo y los archivos quedaban repartidos); ahora un job previo crea el borrador una sola vez y todos suben a él.

## [v1.8.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.8.1) - 2026-11-12
### Fixed
- La compilación del `.deb` de la app de escritorio fallaba en la release por falta de la página del proyecto (`homepage`) en `desktop/package.json`; la CI de PR ahora genera también el `.deb` y el `.rpm`.
### Added
- **Release con un botón**: `.github/workflows/release.yml` («Actions → Release → Run workflow» sobre `develop`) alinea `develop`/`master`, crea `release/vX.Y.Z` y la etiqueta, compila los instaladores (`desktop-release.yml`, ahora también reutilizable), pone las notas del CHANGELOG en el borrador y la publica (desmarca `publish` para dejarla en borrador). La web sigue a mano: Vercel hace la vista previa de `release/vX.Y.Z` y se promociona a producción tras validarla. `npm run release:deploy -- --yes` salta la pregunta

## [v1.8.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.8.0) - 2026-11-12
### Added
- **App de escritorio (Electron) para Windows, macOS y Linux (AC-01)**: instaladores `.exe` (NSIS), `.dmg`/`.zip` y AppImage/`.deb`/`.rpm` (`desktop/`, `electron-builder`). Lleva la web empaquetada (`app://pdf-annotator`, sin servidor) y arranca sola el ayudante de la IA local, sin terminal; sigue necesitando tu `claude` o `copilot` instalado y con sesión. `npm run start:desktop` la abre en desarrollo y `npm run desktop:pack` genera el instalador de tu sistema
- **Aviso de actualización en la app instalada**: al abrir y cada 6 h consulta las releases de GitHub; si hay una versión más nueva sale una tarjeta con «Actualizar ahora», «Más tarde» y «Qué hay de nuevo», barra de progreso y «Reiniciar ahora / Al cerrar la app». En macOS (sin firma) y en `.deb`/`.rpm` el botón abre la página de descargas. Un punto en el menú recupera el aviso pospuesto
- `.github/workflows/desktop-release.yml`: al empujar una etiqueta `vX.Y.Z` verifica, compila en los tres sistemas y sube los instaladores a una release en **borrador** (publicarla activa el aviso)

### Fixed
- Los menús de la barra del editor por lotes («Poner plantilla A», avisos y panel «✦ IA») se cierran al pulsar fuera.

## [v1.7.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.7.1) - 2026-11-12
### Fixed
- **No more «local network access» prompt on the deployed site**: the editor probed the local AI helper (127.0.0.1:4310) on load, so Chrome asked public-site users for permission. Now it only probes on its own when the app is served from localhost; elsewhere it waits until the user opens the «✦ IA» panel or asks for «Copiar y adaptar con IA»

## [v1.7.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.7.0) - 2026-11-12
### Changed
- **«Copiar y ajustar por textos» is a notice like the others**: the floating panel that covered B is gone. The proposal is a strip under the bar (summary, «Propuesta | Original», «Aplicar N cambios», «Campos ▾», «Cancelar», ✕) and the list of fields and texts opens in the flow, pushing the viewer down. ✕ sends the notice to the bell (the proposal stays drawn and can be applied or cancelled from there); Esc closes the notice instead of cancelling
- **Better preview of the proposal**: arrow and distance for the field under the pointer or selected; highlight in the list, on A and on B at once; «Original» (or hold `P`) shows the fields where they are in A; five clear looks (proposed, estimated, manual, low reliability, unticked); a card on click with the shift, the texts used and a shift typed by hand; «Ver anclas» pins the texts on both pages; a legend under the bar

### Added
- **«Copiar y adaptar con IA» en el lote (IA-01 a IA-05)**: nueva opción en «Poner plantilla A ▾» que pide a tu `claude` o `copilot` (con tu suscripción, sin tokens de pago) que recoloque los campos de A en B, también si cambian de página o de redacción. Un chip «✦ IA» junto a la campana comprueba el ayudante y deja elegir proveedor; la propuesta se revisa en «Dividida» con motivo y confianza por campo y se aplica en un solo paso de deshacer (los de confianza baja o sin colocar solo si los marcas). Aviso de privacidad la primera vez, cancelación, errores y límite de suscripción con salida «Usar ajuste por textos». Solo en local: `npm run start:ia` arranca la app y el ayudante (`tools/ai-helper`, 127.0.0.1:4310). Modelo por defecto económico (Claude: `sonnet`). `docs/IA-LOCAL.md` explica qué se envía, límites y términos
- **IA en local, fase 0 (herramienta de prueba, no visible en la app)**: `tools/ai-phase0/` ejecuta `claude -p` o `copilot -p` sobre pares A/B para medir si la IA propone bien las coordenadas de B (anclas por texto, la app calcula x/y). Incluye seis casos sintéticos con solución conocida y `docs/IA-LOCAL.md` (qué se envía, límites, usos y términos de cada proveedor)
- **Export asks about sample values (Z-01)**: «Descargar PDF» stamps the value or the mapField text by default; when some annotations would paint a sample, a dialog asks whether to stamp the samples instead (with «Recordar mi elección en esta sesión»). It replaces the warning toast after exporting. Batch editing has its own view, «Mapeo» by default (`pdf-annotator.previewModeBatch`)
- **Origin of what is painted (M-01)**: «Mostrar origen» in the viewer legend puts a chip on each annotation (valor / dato / muestra / sin dato) with per-page counters; the choice is remembered (`pdf-annotator.showOrigin`)
- **Test data in the batch panel (M-02)**: «Datos de prueba» button (load / remove a JSON) in the `/lote` panel header; the same global settings apply when editing each PDF
- **Closed notices bell (M-03)**: informative notices (export with sample values, annotations without data) can be shown again from a 🔔 in the editor header; errors have no bell. In batch editing the existing notices bell is used
- **Release scripts**: `npm run release:notes` (prints the CHANGELOG section of a version for the GitHub release), `npm run release:guide` (step-by-step guide with the commands filled in) and `npm run release:deploy` (no arguments needed: it switches to `develop`, pulls, checks everything, asks you to type the version and then aligns `develop` and `master` (fast-forward, or merging `master` into `develop` when they diverged; never forced), creates and pushes `release/vX.Y.Z` and the tag `vX.Y.Z`; `--dry-run` only checks; `bump X.Y.Z` edits the version files locally). Vercel is still deployed by hand

## [v1.6.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.6.0) - 2026-11-11
### Fixed
- **«Alternar» now does something visible**: it shows a «Ver B / Ver A» switch that swaps the page between the PDF of B and the PDF of A (before it only hid the dashed fields of A, which looked like nothing when A had no fields). The three modes have a tooltip explaining them
- **A new batch starts from zero**: opening the panel of a new batch now replaces the one saved in the browser instead of adding to it (two new PDFs after an unrecovered batch of two used to show four). «Dividida» also no longer leaves A empty when two renders overlap

### Added
- **Closable notices and a bell in the batch editor**: the informative notices («A no tiene plantilla», «Distinto número de páginas», «A se ve ajustada / se muestra tal cual») have a ✕; the notice that asks you to choose stays. Closing only hides it (the fit or the comparison do not change). A 🔔 next to the modes counts the closed ones and opens a panel to show one again, show them all or (for the fit) switch it. They are remembered per PDF while the batch is open and come back if the situation changes (another B)
- **A and B of a different page size: choose whether to fit A to B**: the notice in the batch editor (any mode) offers «Ajustar las coordenadas de A a B» or «Dejarlas como están». Fitting scales x and y of A by the width and height ratios (font size by the smaller one) when showing A (Encima, Alternar, Dividida; A's PDF is stretched to B's page) and when copying with «Poner plantilla A» (a checkbox in that menu is the same switch, with a toast); A's JSON never changes. The choice is remembered per PDF and can be switched at any time; it is approximate when the page turns or changes proportion. New helper `utils/page-scale.utils` with tests
- **«Copiar y ajustar por textos»** in the batch editor (the third option of «Poner plantilla A», no longer «pronto»): it reads the text of A and B with pdf.js, pairs the equal texts as anchors, measures how far each one moved and proposes a new place for every field of A, following its nearest anchors (or the typical shift of the page, marked «Estimado»). The proposal is reviewed in «Dividida» (original place in grey, proposed place in amber, numbered anchors) with a side panel: fields with their shift and reliability, an «Textos» tab to exclude anchors, and «Según los textos cercanos» / «Igual para todos». Nothing changes in B until «Aplicar N cambios» (one undo step); fields B already has are kept. With no common texts or a scanned PDF it explains why and offers «Copiar tal cual»
- **Compare A and B without a template A**: «Encima», «Alternar» and «Dividida» now need a new version (B), not fields in A. With no template, «Dividida» shows the PDF of A on the left and B on the right, and holding «A» swaps the page for A's PDF; only «Poner plantilla A» stays disabled, and the notice becomes a hint. When A and B have a different number of pages the bar says so («B 3 de 14 · A 3 de 12»)
- **Simpler batch start**: the third step «Todo listo para empezar» and its «con su plantilla / tengo versiones B» question are gone; step 2 shows the summary and opens the panel. The panel always shows a «Versiones nuevas (B)» strip: dropped PDFs are paired by name, and those that match nothing wait there to be assigned by hand or discarded instead of being lost in a toast
- **«Dividida» view in the batch editor**: a third mode next to «Encima» and «Alternar» shows A (read only, with its fields) on the left and B (edited, with its own) on the right, with the same page and zoom (the zoom fits both pages when entering it). Without fields in template A the three modes and «Poner plantilla A» are disabled and a notice offers to add it in «Documento»; pasted or uploaded JSON without fields is refused instead of counted as loaded; the field under the pointer is highlighted in both panes; the chosen mode is remembered
- **«Documento» in a batch completes the PDF**: inside a batch the tab no longer offers «¿Quieres empezar de cero?» (it swapped the batch's PDF by accident). It shows the PDF card with «Reemplazar…» (asks first, keeps the annotations) and two optional layers: the template of the original (A: upload or paste its JSON) and the new version (B: add, change or remove, with confirmation). Annotations already placed become template A when B is added. «Anotaciones» points to «Documento» while a PDF has no template
- **PDF thumbnails in the batch**: the first page of each PDF is drawn in step 1 and in the panel (grid and list), with a skeleton while it renders and a generic page icon only if it cannot be drawn
- **Paste JSON templates** in step 2 of the batch: paste an array, one document or several in a row (e.g. an extraction from Mongo; `ObjectId(..)`/`ISODate(..)` and extra fields are ignored). Each template is matched to its PDF by `pdfName` (then `name`, `fileName`, `type`); the leftovers can be assigned by hand. Syntax errors point to the line
- **Workspace toolbar redesign**: one row that never wraps (icons with tooltips, only «Descargar PDF» keeps its text), shortcuts/theme/language fold into a ⋯ menu below 1200 px, «Limpiar» asks for confirmation, zoom shows a percentage, and the batch bar is a thin strip under it
- **Batch of documents** (landing → `/lote`): dropping one PDF opens the usual editor; dropping several starts two steps (upload PDFs, optional JSON templates with the summary) and then a panel showing every PDF as a grid or a list with search and state filters. Each PDF opens in the same editor, with a bar to go back to the panel, move to the previous/next PDF and mark it ready; ready ones download as one JSON each (a `.zip` when several). Without a new version a PDF is edited with its own template. Optionally upload new versions (B) from the panel, paired by name (`factura.pdf` ↔ `factura-nuevo.pdf`) so the migration below applies
- **Batch template migration** (new versions B): drop the new versions (B), which are paired by name (`factura.pdf` ↔ `factura-nuevo.pdf`; any other can be assigned from its row in the list view). «Revisar siguiente» opens the usual editor on B with A as a read-only grey layer (modes «Encima» and «Alternar», hold `A` to see only A). Every field of B shows its state against A (same, moved, renamed, new, missing in B); «Poner plantilla A» copies A's fields in (all or only the missing ones, one undo step); «Listo» needs no field missing in B; ready PDFs download as one JSON each (a `.zip` when several). The batch is kept in IndexedDB and never leaves the browser
- Pure helpers with tests: `migration.utils` (field states, pairing by name) and `zip.utils` (stored ZIP writer); `BatchStoreService`, `pages/batch` and the `migration` components of the workspace; `e2e/batch.spec.ts`
- **Sample values**: annotations without `value` now paint a short sample per type instead of the full `mapField` (text `XXXXX`, checkbox and radio `X`, number `00000`), so a long mapping no longer breaks the layout. Editable in *Advanced → Sample values* (global browser setting, up to 12 characters, per-type reset); decimals and appender still apply to numbers. A field's own `value` always wins
- **Test data**: paste or load a JSON in *Advanced → Test data* and every `mapField` (`holder[0].fullname`, `generalData.month`) is resolved against it; missing data falls back to the sample value. Reports resolved/total fields and the unresolved paths, and shows the line and column of a syntax error
- **View mode** `Sample / Mapping / Data` in the toolbar (`Mapping` paints the `mapField` as before); the choice is remembered in the browser
- The exported PDF paints the same text as the preview and warns with a toast when some fields were stamped with sample values
- Design boards `P-11` to `P-15` (approved) in `design/canvas/`

### Documentation
- Context docs for people and agents: `docs/PRODUCT.md`, `DOMAIN.md`, `DECISIONS.md`, `ROADMAP.md`, `TESTING.md` and `WORKFLOW.md` (design-first flow); `PROPUESTA_MEJORAS.md` moved to `docs/archive/`
- Design canvas created (link in `design/README.md`) with the design tokens board and 1:1 captures of the current app (`V-01` to `V-19`: landing, resumable session, invalid file toast, workspace tabs, saved template, editors, selection, shortcuts, errors, toasts, guides, JSON tree; dark, light and 1280; desktop only) and the batch re-layout proposal boards (`P-01` to `P-10`: upload, list, template, side-by-side and overlay compare, page size mismatch, PDF size/storage, ZIP or loose download), pending approval; plus `design/tools/` to regenerate them. Designs are desktop only (decision 11)
- `design/` folder (outside the build and the Docker image) for approved designs; `AGENTS.md` and `CLAUDE.md` updated (real size of `workspace.page.ts`, design-first section)

### Security
- `e2e/static-server.mjs` (test/dev helper, not part of the build): listens only on `127.0.0.1`, confines files to the served folder with `path.relative`, answers 400 on malformed URLs and 404 on read errors

## [v1.5.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.5.0) - 2026-10-21
### Added
- **Multi-selection**: Shift/Ctrl+click or a rubber band (drag on an empty area; Shift adds) to pick annotations, Ctrl+A for the whole page (locked ones excluded), group drag, arrow-key nudging (Shift ×10), Delete, Ctrl+C / Ctrl+V / Ctrl+D (offset copies) and a selection bar with six align actions (left, centre, right, top, middle, bottom), distribute horizontally/vertically (3+), duplicate, delete and clear. Each action is one undo step; held arrow keys merge into one (`AnnotationStore` coalescing)
- **Session recovery**: the last PDF, its annotations, page and zoom are autosaved in the browser (IndexedDB, nothing leaves the device); the landing page offers to continue or discard them
- Opening or reloading `/workspace` without a PDF redirects to the landing page (`workspaceGuard`) instead of leaving an empty editor
- **Sidebar tabs** (Document, Annotations with a count badge, Templates, Advanced) with keyboard navigation; they scroll horizontally on very narrow screens
- **JSON feedback**: validity line under the editor (valid + annotation count / syntax error with line and column / missing `pages`), import errors that say where the problem is (`LooseJsonError`) and a warning toast after an explicit apply/import listing what was skipped or looks wrong (invalid fields or pages, annotations outside the page, pages missing from the PDF, font sizes outside 8–72, opacities outside 0.1–1); nothing in the import result changes and live typing stays silent
- Non-blocking toast notifications (`ToastService` + `app-toast-host`) replace every `alert()`; the import/export error messages that were hard-coded in Spanish are now translated
- Quality: Playwright end-to-end suite (`npm run e2e`, 62 tests), GitHub Actions CI (build + i18n check, unit tests, e2e on PRs and pushes to `develop`/`master`), `npm run test:ci` (headless, no sandbox) and `karma.conf.cjs`; 80 unit tests
- All new texts are translated in the 7 languages and listed in the shortcuts dialog where relevant

### Changed
- Refactor of `workspace.page.ts` (~4,300 → ~3,340 lines, no behaviour change): `AnnotationEditorComponent` (create/edit forms merged), `PdfExportService`, `FontCatalogService`, `AnnotationStore` (annotations + undo/redo), `AnnotationImportService` and pure utilities (`color`, `number`, `download`, `annotation-pages`, `annotation-fields`, `alignment`)

### Fixed
- JSON import ignored `locked` and `hidden`, so an advanced export lost them on re-import
- Zooming quickly (e.g. holding `-`) could start overlapping renders on the same canvas and leave the PDF badly drawn; renders are now serialized and coalesced
- The old copy of the annotations that `annotation-templates.service` wrote to `localStorage` (`pdf-annotator.last-coords`, never read back) is no longer written and is deleted on startup

## [v1.4.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.4.1) - 2026-10-20
### Changed
- Light theme: sidebar cursor box, thumbnails, template inputs now follow the theme
- Redesigned `/landing`: first screen focused on the action (title, centered drop zone, sample document, compact feature strip), full editor preview below, top bar with GitHub link, theme and language, and a compact open-source footer; fully responsive

### Added
- "Try with a sample document" button on the landing page

## [v1.4.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.4.0) - 2026-10-20
### Added
- Replace legal notice with MIT license referencing the GitHub repository
- Show read-only PDF coordinates in the annotation edit modal
- Keyboard shortcuts (page navigation, zoom, fit to width, sidebar toggle) with an in-app help dialog (`?`)
- "Fit to width" zoom button and shortcut hints in toolbar tooltips

### Changed
- Workspace layout: single-row compact toolbar, fixed-viewport shell with independent sidebar/viewer scroll, slim footer and a stacked layout below 960px
- Footer text is now translated in every language

### Changed (branding)
- Redesigned the social preview image (`og-image`, 1200×630; metadata now points to the PNG, since crawlers ignore SVG)
- Regenerated the logo as a high-resolution SVG (gradients, folded corner and coordinate marker) with matching PNG/ICO favicons, Apple touch icon and PWA icons; web manifest now has name and theme colour

### Fixed
- Importing a JSON file now refreshes the JSON editor (it kept showing the previous content)
- Viewer no longer clips the left side of the page when it is wider than the viewport; PDFs fit to width on small screens
- Language selector and JSON view toggle contrast in light theme

### Documentation
- New `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md` and `docs/ARCHITECTURE.md`; rewritten README with screenshots and workflows; `examples/` with a sample PDF and annotations; improved issue/PR templates

### Security
- Pasted/imported JSON is parsed with a non-evaluating parser; `Function(...)` evaluation removed (arbitrary code execution)
- JSON imports are limited to 5 MB
- nginx: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and `server_tokens off`

## [v1.3.3](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.3) - 2026-04-09
### Added
- Refine the workspace navbar with hierarchy and spacing #122

## [v1.3.2](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.2) - 2026-04-09
### Added
- fix: use PDF coordinates by default for guide inputs #118
- feat: add collapsible JSON panel in workspace sidebar #119
- Export JSON: show minimal fields by default and add advanced-fields toggle #120

## [v1.3.1](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.1) - 2025-11-27
### Added
- Add French, Italian, Portuguese, and German translations #100
- Add PDF cursor coordinate indicator #101
- Add legal notice to landing footer #111
- Add light/dark theme toggle #113
  
### Dev
- [Snyk] Upgrade pdfjs-dist from 5.4.296 to 5.4.394 #108

## [v1.3.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.3.0) - 2025-11-07
### Added
- Add page thumbnails sidebar #92
- Add lock and hide controls for workspace annotations #97

### Dev
- Split landing and workspace into routed pages #94
- Refactor landing page into page-scoped components #95
- Refactor workspace page into dedicated layout components #96

## [v1.2.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.2.0) - 2025-11-01
### Added
- Move JSON actions into sidebar panel #64
- Feat: refresh toolbar ui and pdf upload #65
- Persist selected language in local storage #74
- Add tree view option to JSON annotation menu #79
- Add overlay guides and configurable snapping controls #53
- Persist guide profiles with templates #84
- Feat: add advanced typography controls #82
- Feat: auto scroll JSON selection #85

### Dev
- Split landing and workspace into dedicated components #87

## [v1.1.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.1.0) - 2025-10-30
### Added
- docs: Improve branding and add issue templates #40
- Add Vercel speed insights integration and update dependencies #38
- Add annotation type controls and value overrides #47
- Add local annotation templates with auto-restore #52
- Add copy and paste duplication for annotations #57
- Add undo/redo support for annotation history #51
- Add Docker configuration for container deployment #50
- docs: clarify local and docker workflows #63

### Fix
- fix: replace deprecated json import assert #43
- fix: keep annotation editor focus when interacting with fields #47
- Close annotation modals when clicking outside the PDF viewer #56
- Handle annotations targeting non-existent PDF pages on download #58

## [v1.0.1] - 2025-10-28
### Added
- Improving Open Graph
- Expand README usage guide

### Fix
- Fix PDF.js worker selection for older Chrome (Issue in Chrome 113)

## [v1.0.0](https://github.com/ElMaxter99/pdf-annotator/tree/v.1.0.0) - 2025-10-27
### Added
- Add @vercel/analytics integration to enhance tracking capabilities
- Add keyboard shortcuts to confirm, cancel or delete annotation editors
- Add draggable annotations to the PDF viewer
- Add hex color support for annotations
- Refactor appropriate tsconfig.json
- Add i18n support with translation guard
- Clear annotations when loading a new PDF
- Add footer with app details
- Add social media sharing metadata
- Add Download PDF with anotations
- Migrate coordinate JSON format

## [0.2.1] - 2025-09-03
###✨ Added
- Auto-focus en el input de texto al crear una nueva anotación, permitiendo empezar a escribir inmediatamente.
- Mejoras en la UI

## [0.2.0] - 2025-09-03
### ✨ Added
- Capacidad de crear anotaciones al hacer click en el PDF mediante hitbox.
- Panel de edición flotante para editar anotaciones existentes.
- Botón de borrar anotación individual directamente desde el panel de edición.
- Hover sobre anotaciones con cursor text y tooltip que indica “Click para editar”.
- Renderizado de anotaciones sobre `<canvas>` en capa separada (annotations-layer) para evitar conflictos con la creación de nuevas anotaciones.
- Funcionalidad de zoom in/out manteniendo las anotaciones correctamente escaladas.
- Navegación entre páginas del PDF con botones prev/next.
- Exportación de anotaciones en JSON mediante copia al portapapeles o descarga de archivo.
- Limpieza de todas las anotaciones con botón Clear.
- Mejora en la gestión de prioridad de click para que crear nuevas anotaciones no interfiera con la edición de existentes.
### 🐛 Fixed
- Bug donde hacer click en el PDF no creaba nuevas anotaciones correctamente debido a conflicto de capas.
- Bug donde el cursor no indicaba que se estaba sobre una anotación editable.
- Bug en el cálculo de coordenadas al hacer click sobre el PDF con zoom aplicado.

## [0.1.0] - 2025-08-28
### ✨ Added
- Configuración inicial de proyecto Angular 20 con Vite.
- Integración de `pdfjs-dist` para renderizar PDFs.
- Subida de PDF desde el navegador.
- Renderizado de páginas PDF en `<canvas>`.
- Captura de coordenadas mediante click en el PDF.
- Visualización de coordenadas en un panel JSON lateral.
- Input de texto editable para asociar valores a coordenadas.
---