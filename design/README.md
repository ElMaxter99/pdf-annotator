# Diseño de la interfaz

PDF Annotator se diseña **primero en un lienzo** y después se programa. Reglas completas en [`docs/WORKFLOW.md`](../docs/WORKFLOW.md).

**Lienzo:** [PDF Annotator · Diseño de la interfaz](https://claude.ai/artifact/AUL7g11U4ZDtLFf3katowh) (privado: solo lo abre quien lo tenga compartido). Es el único lienzo del proyecto: no se crea otro.

Esta carpeta está fuera del build: no la compila Angular ni entra en la imagen de Docker.

## Estructura
- `canvas/`: copia exacta de lo publicado (`canvas.json` y `*.dc.html`), solo de diseños aprobados.
- `propuestas/`: un `.md` por propuesta, con el problema, las decisiones y la recomendación.

## Mesas
| Mesa | Pantalla o estado | Archivo | Componente de la app | Estado |
| --- | --- | --- | --- | --- |
| Tokens de diseño | Paleta del tema oscuro y claro (`--bg --panel --accent --danger --text --muted`) y botones base | [`Main.dc.html`](canvas/Main.dc.html) | `src/styles.scss` | Referencia, generada de `styles.scss` |

Convención: `V-NN` pantallas existentes, `P-NN` propuestas. Tres anchos (≥1650, ~1280, <960 px) y tema oscuro/claro cuando cambie el layout.
