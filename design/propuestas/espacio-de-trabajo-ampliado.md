# Espacio de trabajo ampliado y «Centrar A / B» (candidata 1.17)

Mesas **P-109** (flujo y reglas), **P-110** (estados, oscuro 1650) y **P-111** (estados, claro 1280) en «Propuestas» del lienzo. **Estado: propuesta pendiente de aprobación de Maxter. No se programa nada hasta entonces.** Origen: prueba de la RC 1.16.0-rc.1 (2026-11-20).

## Problema
En «Dividida», al mover el lienzo (botón central, `Espacio` o la barra de desplazamiento) el recorrido acaba justo en el borde de los PDFs: **no se puede centrar el PDF de la derecha (B)**, porque no hay espacio más allá de él, ni el de la izquierda (A) en el otro extremo. Hoy `.viewer--split` es una cuadrícula `auto auto` con 12 px de relleno: el área desplazable mide lo mismo que A + B. En la vista de un solo PDF pasa igual (relleno de 12 px).

## Opciones
1. **Margen de trabajo (recomendada).** Una zona vacía desplazable a izquierda y derecha de los PDFs, de ancho igual a la mitad del visor, para poder llevar cualquiera al centro. Al abrir, cambiar de página, de zoom o de modo, la posición inicial deja los PDFs **como hoy** (sin cambio visible hasta que se mueve el lienzo).
2. **«Centrar A» / «Centrar B».** Atajo directo para llevar un PDF al centro: **doble clic en la etiqueta «A» o «B»** (junto al gesto del doble clic de la 1.16); otro doble clic reencuadra ambos. Necesita la opción 1 (sin margen, B no puede centrarse). Desplazamiento suave de 150–300 ms con `ease-out`; instantáneo con `prefers-reduced-motion`.
3. **Lienzo libre sin límites** (estilo Figma, pan infinito). Descartada de momento: cambia demasiado el modelo del visor.

## Recomendación
Opción 1 + el «Centrar» de la opción 2. Sin controles nuevos en pantalla: el margen es invisible (mismo fondo del visor) y el centrado vive en las etiquetas que ya existen.

## Reglas (a dibujar en P-109)
- **Enlazada:** un solo desplazamiento horizontal del visor; A y B se mueven juntos. El margen va a los extremos del conjunto (izquierda de A, derecha de B).
- **Desenlazada:** cada panel tiene su propio desplazamiento; cada uno tiene su margen y puede centrar su PDF.
- **Zoom y páginas:** al cambiar de zoom (`zoomToScale`) o de página se mantiene la regla actual de anclaje; el margen no cambia las coordenadas del PDF ni la creación de anotaciones.
- **Reencuadre:** `0`, `⇧1`, «ajustar al ancho» y el doble clic de la 1.16 devuelven la posición inicial (desplazamiento horizontal al punto de partida).
- **Guías y reglas** (`viewer--guides-enabled`): las reglas siguen pegadas al PDF y no al margen.
- Sin cambios en el arrastre de anotaciones ni en el recuadro de selección; el margen vacío se comporta como zona vacía (clic crea anotación solo sobre la hoja).

## Mesas
- **P-109** · documento: problema (captura real con la barra de desplazamiento tocando el borde de B), opciones 1 a 3, regla de enlazada/desenlazada y las 4 preguntas.
- **P-110 / P-111** · estados, oscuro 1650 y claro 1280, con el editor del lote en «Dividida»:
  - E1 Reposo, igual que hoy.
  - E2 Lienzo movido hacia la derecha: B centrado, con el margen vacío a su derecha.
  - E3 Lienzo movido hacia la izquierda: A centrado.
  - E4 Doble clic en la etiqueta «B»: B centrado (pie de foto «Centrar B»).
  - E5 Segundo doble clic: reencuadre de ambos.
  - E6 Desenlazada: cada panel con su margen.
  - D1 Fila nueva en el diálogo de atajos: «Doble clic en la etiqueta A o B: centrar ese PDF».

## Preguntas para Maxter
1. **Alcance:** solo «Dividida» o también la vista de un solo PDF. Recomendado: **ambas** (misma regla).
2. **Tamaño del margen:** mitad del ancho del visor a cada lado (**recomendado**, cualquier PDF puede quedar centrado) o fijo (p. ej. 240 px).
3. **Centrar con doble clic en la etiqueta A/B** (**recomendado**) o solo el margen y centrarlo a mano.
4. **Vertical:** margen también arriba y abajo. Recomendado: **no** por ahora (el desplazamiento vertical ya llega a los bordes de la hoja).

## Archivos que tocaría (tras la aprobación)
`src/styles.scss` (`.viewer`, `.viewer--split`), `workspace.page.ts` (posición inicial del desplazamiento y reencuadre; hoy `fitWidth`/`fitSplit`/`zoomToScale`), `components/viewer` (etiquetas A/B), `utils/zoom.utils.ts` (regla pura del centrado, con spec), `shortcuts-dialog`, 7 JSON, README y `e2e/zoom-gestures.spec.ts` + `batch.spec.ts`. Revisar 1650 y 1280 px, oscuro y claro.

## Prompt para el lienzo
> En el lienzo único del proyecto, zona «Propuestas», dibuja tres mesas de escritorio: P-109 (documento: problema con la barra de desplazamiento tocando el borde del PDF B en «Dividida», opciones 1 a 3, reglas y 4 preguntas con la opción recomendada resaltada), P-110 (1650 px, oscuro) y P-111 (1280 px, claro) con los estados E1 a E6 y el recorte D1 descritos arriba. Usa los tokens de `styles.scss` y el editor real del lote en «Dividida» con A y B. El margen de trabajo no se ve (mismo fondo del visor); indícalo con una guía discontinua solo en la mesa de documento. Sin animaciones ni elementos nuevos en pantalla.
