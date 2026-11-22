# Pendiente de pintar en el lienzo (deuda de diseño)

Maxter aprobó estos cambios visibles **sin mesas** («ya lo veo yo cuando programas») mientras el lienzo vivía en otra cuenta de Claude. Cuando se retome esa cuenta, **la mesa debe pintar todo lo que ya está en la app** para que el lienzo vuelva a ser la fuente de verdad (`docs/WORKFLOW.md`, «Diseño primero»). Cada fila dice dónde verlo en la app y en qué versión entró. Al pintar una, márcala con su mesa (`P-NN`) y quítala de aquí.

## Ya programado, falta la mesa

| # | Qué | Dónde se ve | Versión | Detalle |
| --- | --- | --- | --- | --- |
| 1 | Doble clic del visor (100 % ↔ ajustar) | Editor, visor | 1.16 | CHANGELOG 1.16.0 |
| 2 | Espacio de trabajo ampliado y «Centrar A/B» | Editor, visor y «Dividida» | 1.16 (P-109 a P-111 solo descritas) | CHANGELOG 1.16.0 |
| 3 | Modal mínimo de «Trasladar con IA» con «Más información» | Lote, botón «✦ Trasladar con IA» | 1.16 (P-112 a P-114 solo descritas) | `design/propuestas/trasladar-con-ia-simplificar.md` |
| 4 | Contraste del acento en tema claro (`--accent-fill`) | Botones primarios y segmentos activos, tema claro | 1.17 · B1 | CHANGELOG 1.17.0 |
| 5 | «Dividida» desenlazada con margen y «Centrar» en A | Editor del lote, «Dividida» desenlazada | 1.17 · C1 | CHANGELOG 1.17.0 |
| 6 | Barras del visor finas en reposo | Editor, visor | 1.17 · C2 | CHANGELOG 1.17.0 |
| 7 | Pestañas del panel lateral a 1280 px (letra menor, «…») | Editor, panel lateral | 1.17 | CHANGELOG 1.17.0 |
| 8 | Instrucciones para la IA (lote y por PDF) | Popover de «Trasladar con IA» y chip «✦ IA» del editor | 1.17 · A6 | CHANGELOG 1.17.0 |
| 9 | Panel «Traslado con IA» sin scroll anidado y vista «Ver detalle» | Lote, panel lateral derecho | 1.17 | CHANGELOG 1.17.0 |
| 10 | Propuesta de la IA editable en B (hover, clic, arrastrar, «editado») | Editor del lote con propuesta | 1.17 | CHANGELOG 1.17.0 |
| 11 | Parejas A↔B con línea, tarjetas que navegan, «Sin pareja» | Editor del lote, «Dividida» y «Anotaciones» | 1.17 | CHANGELOG 1.17.0 |
| 12 | Número de página repetido («repetido en cada página») | Lista de la propuesta | 1.17 | CHANGELOG 1.17.0 |
| 13 | Lista de la propuesta por grupos («De A · seguros», «a revisar», «Nuevos en B»…) y «Marcar solo los seguros» | Pestaña «Anotaciones» con propuesta | 1.17 | CHANGELOG 1.17.0 |
| 14 | «Igual que en A» (etiqueta en la fila) | Lista de la propuesta | 1.17 | CHANGELOG 1.17.0 |
| 15 | Chip del lote «N de M de A · K a revisar · +X nuevos en B» | Lote, columna de estado | 1.17 | CHANGELOG 1.17.0 |
| 16 | Consumo de la IA: créditos de Copilot y tokens sin caché | Panel «Traslado con IA», resumen | 1.17 | CHANGELOG 1.17.0 |
| 17 | Nombres de la propuesta más legibles (10 px, seminegrita) | Editor del lote, capa de la propuesta | 1.17 | CHANGELOG 1.17.0 |
| 18 | Aviso «Pedir la contraseña / el permiso otra vez» tras cancelar una actualización | App de escritorio, aviso de actualización | 1.17 | [`propuestas/actualizar-tras-cancelar-contrasena.md`](propuestas/actualizar-tras-cancelar-contrasena.md) |

## Propuesto, falta la mesa antes de programar

| # | Qué | Propuesta |
| --- | --- | --- |
| A | Apartado «Almacenamiento» de la app de escritorio | [`propuestas/almacenamiento-en-disco.md`](propuestas/almacenamiento-en-disco.md) |
