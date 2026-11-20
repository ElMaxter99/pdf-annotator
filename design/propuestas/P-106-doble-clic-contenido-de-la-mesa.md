# P-106 · Contenido de la mesa «Doble clic para alternar ajustar y 100 %»

Material para dibujar la mesa en el lienzo de claude.ai (único lienzo del proyecto; zona «Propuestas»). Complementa `doble-clic-ajustar-zoom.md` (problema, reglas y preguntas). Escritorio, **1650 y 1280 px, oscuro y claro**; tokens de `styles.scss` (`--bg --panel --accent --danger --text --muted`); estilo sobrio y cálido, sin animación nueva.

## 1. Ids de mesa
Siguiendo el precedente de P-100 a P-102 (documento + oscuro + claro):

| Mesa | Contenido | Ancho y tema |
| --- | --- | --- |
| **P-106** Doble clic del visor · flujo y reglas | Gesto, regla de alternancia, reglas de exclusión, preguntas | documento |
| **P-107** Doble clic del visor · estados (oscuro) | Los estados E1 a E6 de abajo | 1650, oscuro |
| **P-108** Doble clic del visor · estados (claro) | Los mismos estados | 1280, claro |

P-107 y P-108 son ids nuevos (no se reutiliza ninguno). Si prefieres una sola mesa, mete E1 a E6 en P-106.

## 2. Mesa P-106 · flujo y reglas (documento)
**Título:** «Doble clic del visor · alternar ajustar y 100 %»

**Bloque «Gesto» (dos tarjetas):**
1. 🖱 **Doble clic con el botón central** · en cualquier punto del visor.
2. **Ctrl/⌘ + doble clic** · en zona vacía (para ratones y trackpads sin botón central).

**Bloque «Qué hace» (diagrama de dos estados con flechas):**
- `Ajustado al ancho` → *doble clic* → `100 %`
- `Cualquier otro zoom` → *doble clic* → `100 %`
- `100 %` → *doble clic* → `Ajustado al ancho`
- Nota: «El punto bajo el cursor se mantiene fijo al cambiar de zoom.»

**Bloque «No cambia» (lista corta):** `0` sigue siendo ajustar al ancho · `Ctrl/⌘ + 0` sigue siendo 100 % · `⇧1` sigue siendo ajustar a la página · arrastrar anotaciones y el recuadro de selección (>4 px) no cuentan como doble clic.

**Bloque «Se ignora cuando»:** el foco está en un campo de texto · hay un editor de anotación abierto · el puntero está sobre un diálogo.

**Bloque «Preguntas para Maxter» (3, con la opción recomendada resaltada):**
1. `Ctrl/⌘` + clic en zona vacía **no crea anotación** (solo vacía la selección) — *recomendado* — o se deja como hoy y solo el botón central hace el gesto.
2. El segundo estado ajusta al **ancho** (*recomendado*, como `0`) o a la **página** (como `⇧1`).
3. En «Dividida» con zoom desenlazado actúa sobre el panel bajo el puntero (*recomendado*).

## 3. Mesas P-107 / P-108 · estados
Cada estado es un recorte del editor real (visor con la factura de ejemplo, panel izquierdo y pie visibles) con un pie de foto de una línea. Reutiliza el chip de zoom que ya existe (`zoom.hud`), sin añadir elementos nuevos.

| Estado | Qué se ve | Pie de foto |
| --- | --- | --- |
| **E1 · Reposo** | PDF ajustado al ancho; pie con «82 %»; cursor normal sobre zona vacía | «Ajustado al ancho (82 %)» |
| **E2 · Doble clic desde ajustado** | Mismo PDF a 100 %, más grande, con el punto pulsado en el mismo sitio de la pantalla; chip de zoom «100 %» arriba del visor; pie «100 %» | «Doble clic → 100 %, sin perder el punto bajo el cursor» |
| **E3 · Doble clic desde 100 %** | Vuelve al ajuste del ancho; chip «82 %» | «Otro doble clic → ajustar al ancho» |
| **E4 · Ctrl/⌘ + doble clic en zona vacía** | Igual que E2; **sin** anotación nueva ni editor abierto; cursor con la tecla indicada en la leyenda | «Con `Ctrl/⌘`, el primer clic solo vacía la selección» |
| **E5 · Ignorado** | Editor flotante de anotación abierto sobre el visor; el zoom no cambia | «Con un editor abierto, el doble clic no hace nada» |
| **E6 · Dividida, zoom desenlazado** | Dos paneles A y B; chip «B · 100 %» sobre el panel pulsado; el otro panel intacto | «Desenlazado: solo cambia el panel bajo el puntero» (enlazado: chip «100 %» y cambian los dos) |

**Descubrimiento (recorte aparte, mismo tamaño en ambos temas):**
- **D1 · Diálogo de atajos**, sección Vista, fila nueva bajo «Tamaño real (100 %)»: teclas `Ctrl/⌘` + `doble clic` · texto «Alternar ajustar al ancho y 100 % (o doble clic con el botón central)».
- **D2 · Pie**: el «%» del pie con tooltip «Doble clic en el visor: alternar ajustar al ancho y 100 %».

## 4. Textos (es-ES; en los otros 6 idiomas se traducen en la implementación)
| Clave propuesta | es-ES |
| --- | --- |
| `shortcuts.items.zoomToggle` | Alternar ajustar al ancho y 100 % (o doble clic con el botón central) |
| `zoom.menu.toggleHint` | Doble clic en el visor: alternar ajustar al ancho y 100 % |

Sin textos nuevos en el chip: se reutilizan `zoom.hud.value` y `zoom.hud.side`.

## 5. Accesibilidad y movimiento (a anotar en la mesa)
- El gesto es un atajo extra: todo lo que hace ya se puede con teclado (`0`, `Ctrl/⌘ + 0`) y con el menú del «%».
- Con `prefers-reduced-motion` el cambio de zoom es instantáneo, sin transición.
- Foco visible y contraste del chip de zoom como hoy; en tema claro, comprobar el chip con el fondo de la hoja.

## 6. Prompt para pegar en el lienzo
> Dibuja en el lienzo único del proyecto, zona «Propuestas», tres mesas de escritorio: P-106 (documento: gesto, regla de alternancia, exclusiones y 3 preguntas), P-107 (1650 px, oscuro) y P-108 (1280 px, claro) con los estados E1 a E6 y los recortes de descubrimiento D1 y D2 de `design/propuestas/P-106-doble-clic-contenido-de-la-mesa.md`. Usa los tokens de `styles.scss`, el editor real con `examples/factura-ejemplo.pdf` y el chip de zoom existente; no añadas animaciones ni elementos nuevos. Marca en cada pregunta la opción recomendada.

## 7. Qué hay que aprobar
Las tres preguntas de la mesa P-106. Con ellas resueltas se copia el lienzo a `design/canvas/`, se actualiza la tabla de `design/README.md` y se programa T3.
