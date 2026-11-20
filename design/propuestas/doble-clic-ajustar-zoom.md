# Doble clic para alternar «ajustar» y 100 % (1.16 · T3)

Mesa **P-106** (siguiente libre tras P-105) en «Propuestas» del lienzo: escritorio 1650 y 1280, oscuro y claro. **Estado: el gesto (opción A) lo eligió Maxter el 2026-11-20; falta dibujar la mesa y que la apruebe. No se programa nada hasta entonces.**

## Problema
Para volver a «ajustar al ancho» o a 100 % hay que usar el teclado (`0`, `Ctrl/⌘ + 0`, `⇧1`) o el menú del «%» del pie. No hay un gesto directo sobre el visor. Un doble clic normal choca con crear anotaciones: **hoy cualquier clic en zona vacía, también con `Ctrl/⌘`, crea una anotación y abre el editor** (`onHitboxClick`).

## Gesto elegido (opción A)
- **Doble clic con el botón central** sobre el visor (zona vacía o anotación).
- **`Ctrl/⌘` + doble clic** en zona vacía, para ratones y trackpads sin botón central.

Ni el botón central ni sus dobles clics hacen nada hoy salvo arrastrar para mover el lienzo (`onPanPointerDown`), así que no hay colisión con él.

## Qué hace
Alterna con regla pura (`utils/zoom.utils.ts`, con spec):
- Si el zoom actual es ≈100 % → **ajustar al ancho** (igual que `0`).
- En cualquier otro caso → **100 %**, manteniendo bajo el cursor el punto pulsado (todo pasa por `zoomToScale(escala, ancla)`).

No se reasignan atajos: `0` sigue siendo ajustar al ancho, `Ctrl/⌘ + 0` sigue siendo 100 % y `⇧1` ajustar a la página.

## Feedback y descubrimiento (a dibujar en la mesa)
- Feedback: el chip de zoom «NN %» que ya aparece al hacer zoom. Sin animación nueva; con `prefers-reduced-motion` el salto es instantáneo.
- Descubrimiento: fila nueva en el diálogo de atajos («Doble clic central · `Ctrl/⌘` + doble clic: alternar ajustar y 100 %»), tooltip del «%» del pie y fila en la tabla de atajos del README.

## Reglas
- Se ignora con el foco en un campo de texto o con un editor de anotación abierto.
- No cambia el arrastre de anotaciones ni el recuadro de selección (un arrastre >4 px no cuenta como doble clic).
- En vista «Dividida» con zoom desenlazado actúa sobre el panel bajo el puntero (A o B); enlazado, sobre los dos.

## Preguntas para Maxter
1. **`Ctrl/⌘` + clic en zona vacía:** para que `Ctrl/⌘` + doble clic funcione, el primer `Ctrl/⌘` + clic **no debería crear una anotación** (hoy la crea). Recomendado: con `Ctrl/⌘` el clic en zona vacía solo vacía la selección y no crea nada; el clic normal sigue igual. Alternativa: dejar `Ctrl/⌘` + clic como está y que solo el botón central haga el gesto (pierden los trackpads).
2. **Alternancia:** ¿ajustar al **ancho** (recomendado, como `0`) o a la **página** (como `⇧1`) en el segundo estado?
3. **Dividida:** ¿correcto que actúe sobre el panel bajo el puntero cuando el zoom está desenlazado?

## Archivos que tocará (tras la aprobación)
`workspace.page.ts` (`onViewerWheel`, `onPanPointerDown`, `onHitboxClick`, `zoomToScale`), `utils/zoom.utils.ts` (+ spec), `utils/shortcuts.utils.ts` (+ spec), `shortcuts-dialog`, claves `shortcuts.items.*` en los 7 JSON, tabla del README y `e2e/zoom-gestures.spec.ts`.
