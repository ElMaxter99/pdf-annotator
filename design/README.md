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
| V-01 Landing | Página de inicio con hero, dropzone y pie (oscuro) | [`V-01-landing.dc.html`](canvas/V-01-landing.dc.html) | `pages/landing` | Captura 1:1 de la v1.5.0 |
| V-02 Landing claro | V-01 en tema claro | [`V-02-landing-claro.dc.html`](canvas/V-02-landing-claro.dc.html) | `pages/landing` | Captura 1:1 de la v1.5.0 |
| V-03 Landing móvil | Landing a 430 px | [`V-03-landing-movil.dc.html`](canvas/V-03-landing-movil.dc.html) | `pages/landing` | Captura 1:1 de la v1.5.0 |
| V-04 Workspace · Anotaciones | Editor con el PDF de ejemplo y el JSON cargado, pestaña Anotaciones | [`V-04-workspace-anotaciones.dc.html`](canvas/V-04-workspace-anotaciones.dc.html) | `pages/workspace`, `header`, `sidebar`, `viewer` | Captura 1:1 de la v1.5.0 |
| V-05 Workspace · Documento | Pestaña Documento (cambiar PDF, miniaturas) | [`V-05-workspace-documento.dc.html`](canvas/V-05-workspace-documento.dc.html) | `sidebar`, `page-thumbnails` | Captura 1:1 de la v1.5.0 |
| V-06 Workspace · Plantillas | Pestaña Plantillas | [`V-06-workspace-plantillas.dc.html`](canvas/V-06-workspace-plantillas.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-07 Workspace · Avanzado | Pestaña Avanzado con las opciones abiertas | [`V-07-workspace-avanzado.dc.html`](canvas/V-07-workspace-avanzado.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-08 Workspace claro | V-04 en tema claro | [`V-08-workspace-anotaciones-claro.dc.html`](canvas/V-08-workspace-anotaciones-claro.dc.html) | igual que V-04 | Captura 1:1 de la v1.5.0 |
| V-09 Workspace 1280 | V-04 a 1280 px | [`V-09-workspace-1280.dc.html`](canvas/V-09-workspace-1280.dc.html) | igual que V-04 | Captura 1:1 de la v1.5.0 |
| V-10 Workspace móvil | V-04 a 430 px (una columna) | [`V-10-workspace-movil.dc.html`](canvas/V-10-workspace-movil.dc.html) | igual que V-04 | Captura 1:1 de la v1.5.0 |
| V-11 Crear anotación | Editor flotante al hacer clic en el PDF | [`V-11-crear-anotacion-editor-flotante.dc.html`](canvas/V-11-crear-anotacion-editor-flotante.dc.html) | `annotation-editor` (modo preview) | Captura 1:1 de la v1.5.0 |
| V-12 Editar anotación | Editor flotante sobre una anotación existente | [`V-12-editar-anotacion-editor-flotante.dc.html`](canvas/V-12-editar-anotacion-editor-flotante.dc.html) | `annotation-editor` (modo edit) | Captura 1:1 de la v1.5.0 |
| V-13 Selección múltiple | Tres anotaciones seleccionadas y barra de alineación | [`V-13-seleccion-multiple-y-barra-de-alineacion.dc.html`](canvas/V-13-seleccion-multiple-y-barra-de-alineacion.dc.html) | `viewer` (`.selection-bar`) | Captura 1:1 de la v1.5.0 |
| V-14 Atajos | Diálogo de atajos de teclado | [`V-14-dialogo-de-atajos.dc.html`](canvas/V-14-dialogo-de-atajos.dc.html) | `shortcuts-dialog` | Captura 1:1 de la v1.5.0 |
| V-15 JSON con error | Estado de error de sintaxis bajo el editor JSON | [`V-15-json-con-error-de-sintaxis.dc.html`](canvas/V-15-json-con-error-de-sintaxis.dc.html) | `sidebar` (`.json-status`) | Captura 1:1 de la v1.5.0 |
| V-16 Aviso de importación | Toast de aviso tras aplicar un JSON dudoso | [`V-16-aviso-de-importacion-toast.dc.html`](canvas/V-16-aviso-de-importacion-toast.dc.html) | `toast-host` | Captura 1:1 de la v1.5.0 |
| V-17 Guías y rejilla | Guías y snapping activados en Avanzado | [`V-17-guias-y-rejilla-activas.dc.html`](canvas/V-17-guias-y-rejilla-activas.dc.html) | `sidebar`, `viewer` | Captura 1:1 de la v1.5.0 |
| V-18 Árbol JSON | Vista de árbol del JSON | [`V-18-arbol-json.dc.html`](canvas/V-18-arbol-json.dc.html) | `json-tree` | Captura 1:1 de la v1.5.0 |

Convención: `V-NN` pantallas existentes, `P-NN` propuestas. Tres anchos (≥1650, ~1280, <960 px) y tema oscuro/claro cuando cambie el layout.

## Herramientas (`design/tools/`)
Las mesas `V-01` a `V-18` no se dibujan a mano: `capture.mjs` abre la app compilada (`npm run build`, servida con `node e2e/static-server.mjs dist/pdf-annotator/browser`) con Playwright, recorre cada estado, convierte el DOM en marcado con estilos en línea y guarda un `*.body.html` por mesa, más el PDF pintado como PNG. `assemble.py` los envuelve en `.dc.html` y genera `canvas.json`. Las imágenes (PDF, logo, previews) se suben como recursos del lienzo y sus ids se anotan en `assemble.py`. Cuando la UI cambia, se regeneran las mesas afectadas.

Diferencias conocidas con la app: las miniaturas de página son cajas grises, no hay estados `:hover` ni `:focus`, no se dibujan pseudo-elementos (`::before`/`::after`) y la tipografía `Segoe UI` se sustituye en Linux por la sans-serif del sistema.
