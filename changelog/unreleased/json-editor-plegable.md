---
type: Changed
---
**Editor del JSON con plegado y zona «Anotaciones JSON» más simple (mesas P-200 a P-202, 1.20):** el cuadro de texto pasa a ser un editor de código (CodeMirror 6, cargado solo al abrir el editor) con números de línea, flechas ▾/▸ en el margen para plegar objetos y arrays, «Plegar todo / Desplegar todo» y atajos (Ctrl+Mayús+[ y ], Ctrl+Alt+[ y ]). El plegado es solo visual: copiar una selección que cubra un bloque plegado copia todo su contenido. La línea con el error de sintaxis se marca. La cabecera se reduce a título, «Personalizar» (con un punto si el formato no es el estricto; el detalle va en su tooltip) y ocultar.
