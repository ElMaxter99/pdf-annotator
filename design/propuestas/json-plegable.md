# Simplificar el JSON de anotaciones y plegar bloques (P-200 a P-202)

Mesas **P-200** (flujo y reglas), **P-201** (antes y después, oscuro 1650) y **P-202** (estados, claro 1280). **Estado: aprobada por Maxter el 2026-11-25 con todo lo recomendado; implementada en la 1.20.** Origen: Maxter copia el objeto de anotaciones a VS Code para plegar `pages` y copiar solo unas líneas.

## Decisiones
- Cabecera de la zona reducida a título, «Personalizar» (modal de la PR 374; punto ámbar si el formato no es el estricto, con el detalle en el tooltip) y ocultar.
- El textarea pasa a **CodeMirror 6** (carga diferida con `import()`, unos 60 KB gzip; un textarea no puede ocultar líneas y hacerlo a mano arriesga teclado, IME y lectores de pantalla). Componente `components/json-code-editor`.
- Margen con números de línea y flechas ▾/▸, cuadro «…», «Plegar todo / Desplegar todo» (deja el objeto raíz abierto), línea del error marcada.
- Plegado inicial: todo desplegado. Sin «Copiar bloque». El plegado es solo visual: copiar una selección que cubra un bloque plegado copia el texto completo.
- Atajos: Ctrl+Mayús+[ / ] (bloque) y Ctrl+Alt+[ / ] (todo); sin acordes Ctrl+K (chocan con la paleta). Tab saca el foco (no se captura).
- Ctrl+Z/Y siguen el comportamiento heredado.
