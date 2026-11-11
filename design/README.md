# Diseño de la interfaz

PDF Annotator se diseña **primero en un lienzo** y después se programa. Reglas completas en [`docs/WORKFLOW.md`](../docs/WORKFLOW.md).

**Lienzo:** [PDF Annotator · Diseño de la interfaz](https://claude.ai/artifact/AUL7g11U4ZDtLFf3katowh) (privado: solo lo abre quien lo tenga compartido). Es el único lienzo del proyecto: no se crea otro.

Esta carpeta está fuera del build: no la compila Angular ni entra en la imagen de Docker.

## Estructura
- `canvas/`: copia exacta de lo publicado (`canvas.json` y `*.dc.html`), solo de diseños aprobados.
- `propuestas/`: un `.md` por propuesta, con el problema, las decisiones y la recomendación.

## Mesas
La app es solo de escritorio: no hay mesas móviles (decisión 11 de `docs/DECISIONS.md`).

| Mesa | Pantalla o estado | Archivo | Componente de la app | Estado |
| --- | --- | --- | --- | --- |
| Tokens de diseño | Paleta del tema oscuro y claro y botones base | [`Main.dc.html`](canvas/Main.dc.html) | `src/styles.scss` | Referencia |
| V-01 Landing | Inicio con hero, dropzone y pie (oscuro) | [`V-01-landing.dc.html`](canvas/V-01-landing.dc.html) | `pages/landing` | Captura 1:1 de la v1.5.0 |
| V-02 Landing claro | V-01 en tema claro | [`V-02-landing-claro.dc.html`](canvas/V-02-landing-claro.dc.html) | `pages/landing` | Captura 1:1 de la v1.5.0 |
| V-03 Landing con sesión recuperable | Aviso «Continuar donde lo dejaste» | [`V-03-landing-con-sesion-recuperable.dc.html`](canvas/V-03-landing-con-sesion-recuperable.dc.html) | `pages/landing` (`.landing__resume`) | Captura 1:1 de la v1.5.0 |
| V-19 Landing · archivo no válido | Toast de error al soltar un archivo que no es PDF | [`V-19-landing-archivo-no-valido-aviso.dc.html`](canvas/V-19-landing-archivo-no-valido-aviso.dc.html) | `pages/landing`, `toast-host` | Captura 1:1 de la v1.5.0 |
| V-04 Workspace · Anotaciones | Editor con PDF de ejemplo y JSON cargado | [`V-04-workspace-anotaciones.dc.html`](canvas/V-04-workspace-anotaciones.dc.html) | `pages/workspace` | Captura 1:1 de la v1.5.0 |
| V-05 Workspace · Documento | Cambiar PDF y miniaturas | [`V-05-workspace-documento.dc.html`](canvas/V-05-workspace-documento.dc.html) | `sidebar`, `page-thumbnails` | Captura 1:1 de la v1.5.0 |
| V-06 Workspace · Plantillas | Pestaña Plantillas vacía | [`V-06-workspace-plantillas.dc.html`](canvas/V-06-workspace-plantillas.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-10 Workspace · Plantilla guardada | Plantilla guardada y nombre de la siguiente | [`V-10-workspace-plantillas-con-plantilla-guardada.dc.html`](canvas/V-10-workspace-plantillas-con-plantilla-guardada.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-07 Workspace · Avanzado | Opciones avanzadas abiertas | [`V-07-workspace-avanzado.dc.html`](canvas/V-07-workspace-avanzado.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-08 Workspace claro | V-04 en tema claro | [`V-08-workspace-anotaciones-claro.dc.html`](canvas/V-08-workspace-anotaciones-claro.dc.html) | igual que V-04 | Captura 1:1 de la v1.5.0 |
| V-09 Workspace 1280 | V-04 a 1280 px | [`V-09-workspace-1280.dc.html`](canvas/V-09-workspace-1280.dc.html) | igual que V-04 | Captura 1:1 de la v1.5.0 |
| V-11 Crear anotación | Editor flotante al hacer clic en el PDF | [`V-11-crear-anotacion-editor-flotante.dc.html`](canvas/V-11-crear-anotacion-editor-flotante.dc.html) | `annotation-editor` (preview) | Captura 1:1 de la v1.5.0 |
| V-12 Editar anotación | Editor flotante sobre una anotación | [`V-12-editar-anotacion-editor-flotante.dc.html`](canvas/V-12-editar-anotacion-editor-flotante.dc.html) | `annotation-editor` (edit) | Captura 1:1 de la v1.5.0 |
| V-13 Selección múltiple | Tres anotaciones y barra de alineación | [`V-13-seleccion-multiple-y-barra-de-alineacion.dc.html`](canvas/V-13-seleccion-multiple-y-barra-de-alineacion.dc.html) | `viewer` | Captura 1:1 de la v1.5.0 |
| V-14 Atajos | Diálogo de atajos | [`V-14-dialogo-de-atajos.dc.html`](canvas/V-14-dialogo-de-atajos.dc.html) | `shortcuts-dialog` | Captura 1:1 de la v1.5.0 |
| V-15 JSON con error | Error de sintaxis bajo el editor | [`V-15-json-con-error-de-sintaxis.dc.html`](canvas/V-15-json-con-error-de-sintaxis.dc.html) | `sidebar` | Captura 1:1 de la v1.5.0 |
| V-16 Aviso de importación | Toast tras importar un JSON dudoso | [`V-16-aviso-de-importacion-toast.dc.html`](canvas/V-16-aviso-de-importacion-toast.dc.html) | `toast-host` | Captura 1:1 de la v1.5.0 |
| V-17 Guías y rejilla | Guías, reglas y snapping activos | [`V-17-guias-y-rejilla-activas.dc.html`](canvas/V-17-guias-y-rejilla-activas.dc.html) | `sidebar`, `viewer` | Captura 1:1 de la v1.5.0 |
| V-18 Árbol JSON | Vista de árbol | [`V-18-arbol-json.dc.html`](canvas/V-18-arbol-json.dc.html) | `json-tree` | Captura 1:1 de la v1.5.0 |
| P-01 Flujo | Los cinco pasos del remaquetado por lotes y decisiones pendientes | [`P-01-flujo.dc.html`](canvas/P-01-flujo.dc.html) | — | Propuesta, pendiente de aprobación |
| P-02 Subir el lote | Vacío, arrastrando, subiendo n de N, avisos | [`P-02-subir-lote.dc.html`](canvas/P-02-subir-lote.dc.html) | `pages/landing` | Propuesta, pendiente de aprobación |
| P-03 Lista del lote | Estados por fila, tamaño de página y peso, filtros | [`P-03-lista-lote.dc.html`](canvas/P-03-lista-lote.dc.html) | nueva página | Propuesta, pendiente de aprobación |
| P-04 Plantilla y PDF sustituto | JSON válido, con error y subida del PDF nuevo | [`P-04-plantilla-pdf-nuevo.dc.html`](canvas/P-04-plantilla-pdf-nuevo.dc.html) | nueva página | Propuesta, pendiente de aprobación |
| P-05 Comparar lado a lado | Original y nuevo con zoom y scroll sincronizados | [`P-05-comparar-lado-a-lado.dc.html`](canvas/P-05-comparar-lado-a-lado.dc.html) | `viewer` | Propuesta, pendiente de aprobación |
| P-06 Comparar superpuesto | Original sobre el nuevo con opacidad | [`P-06-comparar-superpuesto.dc.html`](canvas/P-06-comparar-superpuesto.dc.html) | `viewer` | Propuesta, pendiente de aprobación |
| P-07 Tamaño de página distinto | A4 frente a Letter y cómo colocar los campos | [`P-07-tamano-pagina.dc.html`](canvas/P-07-tamano-pagina.dc.html) | nueva página | Propuesta, pendiente de aprobación |
| P-08 Tamaño de PDF y almacenamiento | Peso por PDF, límite y uso del navegador | [`P-08-peso-almacenamiento.dc.html`](canvas/P-08-peso-almacenamiento.dc.html) | nueva página | Propuesta, pendiente de aprobación |
| P-09 Cierre y descarga | ZIP o sueltos, progreso «26 de 80», lote terminado | [`P-09-cierre-descarga.dc.html`](canvas/P-09-cierre-descarga.dc.html) | nueva página | Propuesta, pendiente de aprobación |
| P-10 Comparar claro | P-05 en tema claro | [`P-10-comparar-lado-a-lado-claro.dc.html`](canvas/P-10-comparar-lado-a-lado-claro.dc.html) | `viewer` | Propuesta, pendiente de aprobación |
| M-01 Qué falla hoy | Diagnóstico del lote actual y principios nuevos | [`M-01-que-falla-hoy.dc.html`](canvas/M-01-que-falla-hoy.dc.html) | — | Aprobado (documento) |
| M-02 Herramientas similares | Comparativa y qué copiar | [`M-02-herramientas-similares.dc.html`](canvas/M-02-herramientas-similares.dc.html) | — | Aprobado (documento) |
| M-03 Propuesta · flujo | Cuatro pasos, capas A/B y estados de campo | [`M-03-propuesta-flujo.dc.html`](canvas/M-03-propuesta-flujo.dc.html) | — | Aprobado (documento) |
| M-04 Bandeja del lote | Lista por necesidad y subida de B | [`M-04-bandeja-del-lote.dc.html`](canvas/M-04-bandeja-del-lote.dc.html) | `pages/batch` | Aprobado, implementado (fase 1) |
| M-05 Editor de B | Editor con A al fondo (oscuro) | [`M-05-editor-de-b-con-a-al-fondo.dc.html`](canvas/M-05-editor-de-b-con-a-al-fondo.dc.html) | `components/migration` | Aprobado, implementado (fase 1) |
| M-06 Modos de vista | Encima, alternar y dividida | [`M-06-modos-de-vista.dc.html`](canvas/M-06-modos-de-vista.dc.html) | `components/migration` | Aprobado; «Dividida» pendiente |
| M-07 Editor de B claro | M-05 en tema claro | [`M-07-editor-de-b-claro.dc.html`](canvas/M-07-editor-de-b-claro.dc.html) | igual que M-05 | Aprobado, implementado (fase 1) |
| M-08 Poner plantilla A y volver | Menú, historial y «Listo» | [`M-08-poner-plantilla-a-y-volver.dc.html`](canvas/M-08-poner-plantilla-a-y-volver.dc.html) | `components/migration` | Aprobado, implementado (fase 1) |
| M-09 Estados | Vacío, cargando, sin B, sin JSON, aviso, todo listo | [`M-09-estados.dc.html`](canvas/M-09-estados.dc.html) | `pages/batch` | Aprobado, implementado (fase 1) |
| M-10 Arquitectura y fases | Piezas, datos y fases | [`M-10-arquitectura-y-fases.dc.html`](canvas/M-10-arquitectura-y-fases.dc.html) | — | Aprobado (documento) |

Convención: `V-NN` pantallas existentes, `P-NN` propuestas. Anchos de escritorio (≥1650 y ~1280 px) y tema oscuro/claro cuando cambie el layout.

## Herramientas (`design/tools/`)
Las mesas `V-NN` no se dibujan a mano: `capture.mjs` abre la app compilada (`npm run build`, servida con `node e2e/static-server.mjs dist/pdf-annotator/browser`) con Playwright, recorre cada estado, convierte el DOM en marcado con estilos en línea y guarda un `*.body.html` por mesa, más el PDF pintado como PNG. `assemble.py` los envuelve en `.dc.html` y genera `canvas.json`; `pboards.py` genera las mesas `P-NN` (propuestas, dibujadas con los mismos tokens). Las imágenes (PDF, logo, previews) se suben como recursos del lienzo y sus ids se anotan en `assemble.py`. Cuando la UI cambia, se regeneran las mesas afectadas.

Diferencias conocidas con la app: las miniaturas de página son cajas grises, no hay estados `:hover` ni `:focus`, no se dibujan pseudo-elementos (`::before`/`::after`) y la tipografía `Segoe UI` se sustituye en Linux por la sans-serif del sistema.
