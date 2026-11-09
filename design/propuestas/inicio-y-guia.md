# Propuesta · nueva vista inicial y vista de guía (P-16 a P-23)

**Estado:** pendiente de aprobación. Lienzo: [PDF Annotator · Diseño de la interfaz](https://claude.ai/artifact/AUL7g11U4ZDtLFf3katowh), filas «nueva vista inicial» y «vista de guía».

## Problema
La landing de la PR #154 pone dos tarjetas de modo encima de la zona de carga y empuja el gesto principal («arrastra aquí tu PDF») hacia abajo. Además, quien llega no ve qué puede hacer la app.

## Decisiones propuestas
1. **Inicio (P-16, P-18 claro):** se recupera el cuadrado central del diseño original, mejorado: página de muestra con campos que aparecen, texto «Arrastra aquí tu PDF», botón, enlace al ejemplo y tira «1 Suelta · 2 Coloca · 3 Exporta». Debajo, un aviso discreto «¿Tienes muchos PDF con plantillas? Probar el modo Lotes». Las 4 funciones enlazan a la guía.
2. **Estados (P-17):** arrastrando 1 PDF, arrastrando varios (se avisa que abrirá Lotes), leyendo con barra y contador, archivo no válido, sesión recuperable y lote en curso.
3. **Guía (P-19 a P-22):** enlace «Guía» en la cabecera; índice con buscador, dos caminos (Editor, Lotes), tarjetas con las capturas del README y página de tema con captura numerada, pasos, atajos y anterior/siguiente. Estados en P-21.
4. **Mantenimiento (P-23):** `docs/GUIDE.md` es el inventario; la regla se añade a `AGENTS.md` y `CLAUDE.md`.

## Por decidir
- Ruta de la guía (`/guide` y `/guide/:id`) y si se enlaza también desde el editor (menú de ayuda y diálogo de atajos).
- Si las R-02 (tarjetas de modo) pasan a la guía o se retiran de la landing sin más.
- Si `guide:check` (comprueba ids, claves i18n y capturas) entra en el CI.
- Las capturas de la guía: reutilizar las del README (ahora) o regenerarlas con `design/tools/capture.mjs` en cada versión.

## Actualización: inicio simplificado (P-24 a P-29)
Tras revisar la primera versión (P-16 a P-23), se rechazó por sobrecargada. Se ofrecieron tres variantes (A, B, C) y se aprobó la **A**: zona «arrastra aquí tu PDF» grande y centrada, cabecera con nombre, versión, idioma y tema, una línea de valores y pie con Modo Lotes, Guía y GitHub. La vista previa del editor y las cuatro ventajas pasaron a la guía como primer tema «Así se ve» (`preview`). P-16, P-17 y P-18 quedan sustituidas.
