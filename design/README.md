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
| IA-09 Trasladar con IA en lote · flujo y estimación | Botón en el panel, menú, confirmación con Claude y con Copilot | — (lienzo, zona Propuestas) | `pages/batch`, `components/migration` | Aprobada, implementada |
| IA-10 La cola en marcha | Estados por fila, tiempo y consumo (lista y cuadrícula) | — (lienzo, zona Propuestas) | `pages/batch` | Aprobada, implementada |
| IA-11 Paradas, fallos y final | Límite, fallos seguidos, tope de Copilot, interrupción, final | — (lienzo, zona Propuestas) | `pages/batch` | Aprobada, implementada |
| IA-12 Revisar una propuesta guardada | Editor con la propuesta cargada, sin aplicar en bloque | — (lienzo, zona Propuestas) | `components/migration` | Aprobada, implementada |
| IA-13 La cola · 1280 y claro | IA-10 a 1280 px en tema claro | — (lienzo, zona Propuestas) | `pages/batch` | Aprobada, implementada |
| IA-14 Proveedor y modelo en la confirmación | Tarjetas de proveedor y modelo (Claude segmentado; Copilot Automático / Elegir…), oscuro y claro | — (lienzo, zona Propuestas) | `pages/batch/ai-batch` | Aprobada, implementada |
| L-01 Flujo general | Una sola entrada: 1 PDF = editor tradicional, 2 o más = pasos, panel y editor | [`L-01-flujo-general.dc.html`](canvas/L-01-flujo-general.dc.html) | — | Aprobado (documento) |
| L-02 Primera vista | Landing: la cantidad de PDFs decide el flujo | [`L-02-primera-vista.dc.html`](canvas/L-02-primera-vista.dc.html) | `pages/landing` | Aprobado, implementado |
| L-03 Paso 1 · Subir PDF | Lista con ✕ por archivo y archivos no válidos | [`L-03-paso-1-subir-pdf.dc.html`](canvas/L-03-paso-1-subir-pdf.dc.html) | `pages/batch` | Aprobado, implementado |
| L-04 Paso 2 · Plantillas | JSON por PDF emparejado por nombre, errores y «Saltar» | [`L-04-paso-2-plantillas.dc.html`](canvas/L-04-paso-2-plantillas.dc.html) | `pages/batch` | Aprobado, implementado |
| L-05 Paso 3 · Empezar | Resumen y opción de subir versiones B (sustituido por R-01..R-03) | [`L-05-paso-3-empezar.dc.html`](canvas/L-05-paso-3-empezar.dc.html) | `pages/batch` | Aprobado, implementado |
| L-06 Panel · cuadrícula | Todos los PDFs con estado, buscador y filtros | [`L-06-panel-cuadricula.dc.html`](canvas/L-06-panel-cuadricula.dc.html) | `pages/batch` | Aprobado, implementado |
| L-07 Panel · lista | Mismos datos en tabla | [`L-07-panel-lista.dc.html`](canvas/L-07-panel-lista.dc.html) | `pages/batch` | Aprobado, implementado |
| L-08 Editor de un PDF | Editor original con barra del lote y A como capa | [`L-08-editor-de-un-pdf.dc.html`](canvas/L-08-editor-de-un-pdf.dc.html) | `components/migration` | Aprobado, implementado |
| L-09 Editor (claro) | L-08 en tema claro | [`L-09-editor-claro.dc.html`](canvas/L-09-editor-claro.dc.html) | igual que L-08 | Aprobado, implementado |
| L-10 Poner plantilla A, volver y listo | Menú, guardado automático y «Listo» | [`L-10-poner-plantilla-volver-listo.dc.html`](canvas/L-10-poner-plantilla-volver-listo.dc.html) | `components/migration` | Aprobado, implementado |
| L-11 Estados | Carga, error, todo listo y lote guardado | [`L-11-estados.dc.html`](canvas/L-11-estados.dc.html) | `pages/batch` | Aprobado, implementado |
| N-01 Barra · qué falla hoy | Diagnóstico de la barra superior y principios | [`N-01-barra-que-falla-hoy.dc.html`](canvas/N-01-barra-que-falla-hoy.dc.html) | — | Aprobado (documento) |
| N-02 Barra · un PDF | Una fila a 1650, 1280 y 1100 px | [`N-02-barra-un-pdf.dc.html`](canvas/N-02-barra-un-pdf.dc.html) | `components/header` | Aprobado, implementado |
| N-03 Barra · lote | Barra + tira de contexto del lote | [`N-03-barra-lote.dc.html`](canvas/N-03-barra-lote.dc.html) | `components/header`, `components/migration` | Aprobado, implementado |
| N-04 Barra · menú, claro y estados | Menú ⋯, «Limpiar» con confirmación, tooltips | [`N-04-barra-menu-claro-estados.dc.html`](canvas/N-04-barra-menu-claro-estados.dc.html) | `components/header` | Aprobado, implementado |
| N-05 Paso 2 · pegar JSON | Pestaña «Pegar JSON» y emparejado por `pdfName` | [`N-05-paso-2-pegar-json.dc.html`](canvas/N-05-paso-2-pegar-json.dc.html) | `pages/batch` | Aprobado, implementado |
| N-06 Pegar JSON · casos | Formatos, emparejado y avisos | [`N-06-pegar-json-casos.dc.html`](canvas/N-06-pegar-json-casos.dc.html) | `pages/batch` | Aprobado, implementado |
| O-01 Documento en lote · qué falla | «Empezar de cero» y capas A/B que faltan en el editor | [`O-01-documento-en-lote-que-falla.dc.html`](canvas/O-01-documento-en-lote-que-falla.dc.html) | — | Aprobado (documento) |
| O-02 Propuesta 1 · ficha en Documento | Ficha del PDF y tarjetas de capas (plantilla A, versión B) | [`O-02-propuesta-1-ficha-documento.dc.html`](canvas/O-02-propuesta-1-ficha-documento.dc.html) | `components/batch-document` | Aprobado, implementado |
| O-05 Comparativa y recomendación | Las tres propuestas lado a lado (se eligió la 1) | [`O-05-comparativa-y-recomendacion.dc.html`](canvas/O-05-comparativa-y-recomendacion.dc.html) | — | Aprobado (documento) |
| Q-01 Vista A/B · qué falla | Botones sin efecto sin plantilla A y falta de la vista dividida | [`Q-01-vista-a-b-que-falla.dc.html`](canvas/Q-01-vista-a-b-que-falla.dc.html) | — | Aprobado (documento) |
| Q-02 Dividida · 1650 | A (solo lectura) a la izquierda, B (se edita) a la derecha | [`Q-02-dividida-1650.dc.html`](canvas/Q-02-dividida-1650.dc.html) | `components/viewer`, `components/migration` | Aprobado, implementado |
| Q-03 Dividida · 1280 y claro | Ajuste de zoom, tema claro y panel plegado | [`Q-03-dividida-1280-claro.dc.html`](canvas/Q-03-dividida-1280-claro.dc.html) | `components/viewer` | Aprobado, implementado |
| Q-04 Dividida · estados | Sin plantilla A, B vacía y tamaños distintos | [`Q-04-dividida-estados.dc.html`](canvas/Q-04-dividida-estados.dc.html) | `components/migration` | Aprobado, implementado |
| R-01 Flujo sin paso 3 | Lote en 2 pasos, panel directo | [`R-01-flujo-sin-paso-3.dc.html`](canvas/R-01-flujo-sin-paso-3.dc.html) | `pages/batch` | Aprobado, implementado |
| R-02 Paso 2 y panel | Resumen en el paso 2 y tira «Versiones nuevas (B)» | [`R-02-paso-2-y-panel.dc.html`](canvas/R-02-paso-2-y-panel.dc.html) | `pages/batch` | Aprobado, implementado |
| R-03 Tira B · estados | Sin B, con B y archivos sin pareja | [`R-03-tira-b-estados.dc.html`](canvas/R-03-tira-b-estados.dc.html) | `pages/batch` | Aprobado, implementado |
| S-01 Comparar sin plantilla A | Los modos dependen de B, no de la plantilla A (sustituye la regla de Q-04) | [`S-01-comparar-sin-plantilla-a.dc.html`](canvas/S-01-comparar-sin-plantilla-a.dc.html) | `components/migration` | Aprobado, implementado |
| T-01 Ajustar coordenadas a B | Aviso con elección cuando A y B miden distinto (preguntar, ajustado, tal cual) | [`T-01-ajustar-coordenadas-a-b.dc.html`](canvas/T-01-ajustar-coordenadas-a-b.dc.html) | `components/migration` | Aprobado, implementado |
| T-02 Poner plantilla con ajuste | Casilla «Ajustar al tamaño de B» en el menú «Poner plantilla A» | [`T-02-poner-plantilla-con-ajuste.dc.html`](canvas/T-02-poner-plantilla-con-ajuste.dc.html) | `components/migration` | Aprobado, implementado |
| W-01 Avisos cerrables y campana | ✕ en los avisos informativos y campana con el panel de cerrados | [`W-01-avisos-cerrables-y-campana.dc.html`](canvas/W-01-avisos-cerrables-y-campana.dc.html) | `components/migration` | Aprobado, implementado |
| P-11 Avanzado · valores de muestra | Valores de muestra por tipo (texto, casilla, opción, número) | [`P-11-avanzado-valores-de-muestra.dc.html`](canvas/P-11-avanzado-valores-de-muestra.dc.html) | `sidebar` (Avanzado) | Aprobada, implementada |
| P-12 Prioridad | `value` → dato de prueba → valor de muestra; antes y después | [`P-12-prioridad-y-comparacion.dc.html`](canvas/P-12-prioridad-y-comparacion.dc.html) | `workspace.page.ts` | Aprobada, implementada |
| P-13 Datos de prueba | JSON de datos y modo Muestra / Mapeo / Datos | [`P-13-datos-de-prueba.dc.html`](canvas/P-13-datos-de-prueba.dc.html) | `sidebar`, `header` | Aprobada, implementada |
| P-14 Datos de prueba · estados | Vacío, error, incompleto y éxito | [`P-14-datos-de-prueba-estados.dc.html`](canvas/P-14-datos-de-prueba-estados.dc.html) | `sidebar` | Aprobada, implementada |
| P-15 Datos de prueba claro | P-13 en tema claro | [`P-15-datos-de-prueba-claro.dc.html`](canvas/P-15-datos-de-prueba-claro.dc.html) | `sidebar`, `header` | Aprobada, implementada |
| M-01 Origen de lo que se pinta | Chips valor/dato/muestra/sin dato, leyenda y contadores | [`M-01-previsualizacion-origen-de-cada-campo.dc.html`](canvas/M-01-previsualizacion-origen-de-cada-campo.dc.html) | `viewer` | Aprobada, implementada |
| M-02 Datos de prueba en el lote | Botón en la cabecera del panel `/lote` | [`M-02-lote-previsualizar-con-datos-de-prueba.dc.html`](canvas/M-02-lote-previsualizar-con-datos-de-prueba.dc.html) | `batch` | Aprobada, implementada |
| M-03 Campana de avisos | Avisos informativos recuperables | [`M-03-avisos-previsualizacion-y-copiar-ajustar.dc.html`](canvas/M-03-avisos-previsualizacion-y-copiar-ajustar.dc.html) | `header`, `toast` | Aprobada, implementada |
| M-04 Estados y tema claro | Sin JSON, nada resuelto, Mapeo, claro | [`M-04-origen-estados-claro.dc.html`](canvas/M-04-origen-estados-claro.dc.html) | `viewer` | Aprobada, implementada |
| Z-01 Export y comparación con muestras | Diálogo al descargar PDF y vista de lote en Mapeo por defecto | [`Z-01-lote-export-y-comparacion-con-muestras.dc.html`](canvas/Z-01-lote-export-y-comparacion-con-muestras.dc.html) | `workspace`, `header` | Aprobada, implementada (sin diálogo de ZIP: el ZIP solo lleva JSON) |
| IA-01 La IA en el lote | Cómo encaja «Copiar y adaptar con IA» y por qué hace falta un ayudante local | [`IA-01-ia-en-el-lote-flujo.dc.html`](canvas/IA-01-ia-en-el-lote-flujo.dc.html) | — | Aprobada, implementada |
| IA-02 Conectar la IA | Chip «✦ IA», panel de conexión, proveedor y modelo (Claude o Copilot) | [`IA-02-conectar-la-ia-estados.dc.html`](canvas/IA-02-conectar-la-ia-estados.dc.html) | `components/migration` (`migration-bar`) | Aprobada, implementada |
| IA-03 Pedir y revisar · 1650 | Opción del menú y franja de revisión con motivo y confianza por campo | [`IA-03-pedir-y-revisar-1650.dc.html`](canvas/IA-03-pedir-y-revisar-1650.dc.html) | `components/migration` (`ai-review`) | Aprobada, implementada |
| IA-04 Estados de la petición | Privacidad, carga, errores, límite de suscripción y resultado parcial | [`IA-04-estados-de-la-peticion.dc.html`](canvas/IA-04-estados-de-la-peticion.dc.html) | `components/migration` (`ai-review`) | Aprobada, implementada |
| IA-05 Pedir y revisar · 1280 y claro | IA-03 en 1280 px y tema claro | [`IA-05-1280-claro.dc.html`](canvas/IA-05-1280-claro.dc.html) | igual que IA-03 | Aprobada, implementada |
| IA-06 Ver detalles · en vivo | Modal grande con pasos, lo enviado y consumo medido (Claude) | [`IA-06-ver-detalles-en-vivo.dc.html`](canvas/IA-06-ver-detalles-en-vivo.dc.html) | `components/migration/ai-details` | Aprobada, implementada |
| IA-07 Ver detalles · sin cambios | Resultado «sin cambios» con diagnóstico y lo enviado | [`IA-07-ver-detalles-sin-cambios.dc.html`](canvas/IA-07-ver-detalles-sin-cambios.dc.html) | `components/migration/ai-details` | Aprobada, implementada |
| IA-08 Ver detalles · Copilot | Consumo no medible (peticiones y estimación marcada), 1280 y claro | [`IA-08-ver-detalles-copilot-claro.dc.html`](canvas/IA-08-ver-detalles-copilot-claro.dc.html) | `components/migration/ai-details` | Aprobada, implementada |
| AC-01 Aviso de actualización (app de escritorio) | Tarjeta de aviso de nueva versión en la app de escritorio | [`AC-01-aviso-de-actualizacion.dc.html`](canvas/AC-01-aviso-de-actualizacion.dc.html) | `components/update-card`, `services/desktop-update.service.ts` | Aprobada, implementada |

Convención: `V-NN` pantallas existentes, `P-NN` propuestas. Anchos de escritorio (≥1650 y ~1280 px) y tema oscuro/claro cuando cambie el layout.

## Herramientas (`design/tools/`)
Las mesas `V-NN` no se dibujan a mano: `capture.mjs` abre la app compilada (`npm run build`, servida con `node e2e/static-server.mjs dist/pdf-annotator/browser`) con Playwright, recorre cada estado, convierte el DOM en marcado con estilos en línea y guarda un `*.body.html` por mesa, más el PDF pintado como PNG. `assemble.py` los envuelve en `.dc.html` y genera `canvas.json`; `pboards.py` genera las mesas `P-NN` (propuestas, dibujadas con los mismos tokens). Las imágenes (PDF, logo, previews) se suben como recursos del lienzo y sus ids se anotan en `assemble.py`. Cuando la UI cambia, se regeneran las mesas afectadas.

Diferencias conocidas con la app: las miniaturas de página son cajas grises, no hay estados `:hover` ni `:focus`, no se dibujan pseudo-elementos (`::before`/`::after`) y la tipografía `Segoe UI` se sustituye en Linux por la sans-serif del sistema.
