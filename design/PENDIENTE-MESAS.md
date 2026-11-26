# Pendiente de pintar en el lienzo (deuda de diseño)

Maxter aprobó estos cambios visibles **sin mesas** («ya lo veo yo cuando programas») mientras el lienzo vivía en otra cuenta de Claude. Cuando se retome esa cuenta, **la mesa debe pintar todo lo que ya está en la app** para que el lienzo vuelva a ser la fuente de verdad (`docs/WORKFLOW.md`, «Diseño primero»). Cada fila dice dónde verlo en la app y en qué versión entró. Al pintar una, márcala con su mesa (`P-NN`) y quítala de aquí.

**Regla para cualquier sesión con acceso al lienzo (Maxter, 2026-11-22):** si la sesión de Claude tiene el lienzo, antes de diseñar nada nuevo pinta lo que falte de esta lista (y de `design/PENDIENTE-MESAS.md` en general), marca cada punto con su `P-NN` y quítalo de aquí. Las sesiones sin lienzo (como la que cerró la 1.17) solo lo anotan.

## Ya programado, falta la mesa

| # | Qué | Dónde se ve | Versión | Detalle |
| --- | --- | --- | --- | --- |
| 1 | Tipo de anotación «Fecha»: quinta opción del selector de tipo, campo «Formato» (lista + «Personalizado…» con ayuda de símbolos) y ejemplo «Se verá así»; fila «Fecha» en «Valores de muestra» | Editor de anotaciones (crear y editar) y pestaña Ajustes | 1.20.2 (sin mesas, Maxter 2026-11-25) | [`propuestas/tipo-fecha.md`](propuestas/tipo-fecha.md) |
| 2 | Editor del JSON con el aspecto de VS Code (selección azul, flechas de plegado al pasar el ratón, `⋯` y fondo de la línea plegada, colores Dark+/Light+) y destello al copiar | Pestaña «Anotaciones», editor del JSON | 1.20.2 (sin mesas, Maxter 2026-11-25) | CHANGELOG 1.20.2 |
| 3 | «Colocar a mano» desde A: fantasma del campo de A sin pareja en la página de B que se ve, con «Colocar aquí», «No existe en B» y ✕ | Editor del lote, «Dividida», lista «Falta en B» y tarjetas «De A · sin colocar» | 1.20.2 (sin mesas, Maxter 2026-11-25) | CHANGELOG 1.20.2 |
| 4 | Cuadro de búsqueda del JSON (Ctrl+F) con el aspecto del de VS Code | Pestaña «Anotaciones», editor del JSON | 1.20.2 (sin mesas, Maxter 2026-11-26) | CHANGELOG 1.20.2 |

Hasta la 1.20.1 no quedaba nada: el 2026-11-23 se pintaron en «Definitivo» el editor de la 1.18 (D-18 a D-23: capturas reales, caja de la anotación, lote con barra única, copiar JSON con formato y espacio de trabajo libre) y se movieron ahí las propuestas ya implementadas (P-125 a P-129, P-134, P-135 y P-139 a P-143). El 2026-11-22 se pintaron en el lienzo los 20 puntos que había (P-115 a P-124, capturas reales de la 1.17.0).

| Antes (#) | Qué | Mesa |
| --- | --- | --- |
| 1, 2, 3, 4, 5, 6 | Doble clic del visor, espacio ampliado y «Centrar», «Dividida» desenlazada y barras finas | P-115 y P-116 |
| 7 | Pestañas del panel lateral a 1280 px | P-116 |
| 8, 9, 15, 16, 17 | Instrucciones, panel «Traslado con IA», chip del lote y consumo | P-119 y P-120 |
| 3 (modal), 10 a 14 y 17 | Modal mínimo, propuesta editable, parejas, lista por grupos, «Igual que en A», número repetido y nombres legibles | P-117 a P-120 |
| 4 (acento) | Contraste del acento en claro | P-124 |
| 18 | Aviso tras cancelar la contraseña o el permiso | P-123 |
| nuevo | «No existen en B» (1.16) y prueba de vista previa (1.17) | P-117, P-118, P-121 y P-122 |

Sin captura propia (se describen en la mesa): doble clic del visor, barras finas con el puntero encima, «Igual que en A», número de página repetido, créditos de Copilot y el estado «comprobando» de la prueba de vista.

## Propuesto, mesa aprobada, falta programarlo

| # | Qué | Propuesta | Mesa |
| --- | --- | --- | --- |
| A | Apartado «Almacenamiento» de la app de escritorio | [`propuestas/almacenamiento-en-disco.md`](propuestas/almacenamiento-en-disco.md) | P-125 y P-126 (aprobadas por Maxter el 2026-11-22) |
