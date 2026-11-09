# Diseño de la interfaz

PDF Annotator se diseña **primero en un lienzo** y después se programa. Reglas completas en [`docs/WORKFLOW.md`](../docs/WORKFLOW.md).

**Lienzo:** pendiente de crear (un único artifact *Design (canvas)* «PDF Annotator · Diseño de la interfaz»). Cuando exista, pega aquí su enlace.

Esta carpeta está fuera del build: no la compila Angular ni entra en la imagen de Docker.

## Estructura
- `canvas/`: copia exacta de lo publicado (`canvas.json` y `*.dc.html`), solo de diseños aprobados.
- `propuestas/`: un `.md` por propuesta, con el problema, las decisiones y la recomendación.

## Mesas
| Mesa | Pantalla o estado | Archivo | Componente de la app | Estado |
| --- | --- | --- | --- | --- |
| _(vacío)_ | | | | |

Convención: `V-NN` pantallas existentes, `P-NN` propuestas. Tres anchos (≥1650, ~1280, <960 px) y tema oscuro/claro cuando cambie el layout.
