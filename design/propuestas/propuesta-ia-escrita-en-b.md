# La propuesta de la IA se escribe en el JSON de B (candidata 1.18)

Mesas **P-134** (flujo y reglas) y **P-135** (estados, oscuro 1650 y claro 1280) en «Propuestas». **Estado: aprobada por Maxter el 2026-11-23 con lo recomendado en las 4 preguntas. Mesas pintadas en el lienzo (zona «Propuestas»). Implementada en la PR #337.** Origen: Maxter, 2026-11-23, con páginas libres en «Dividida».

## Problema
Hoy la propuesta de la IA vive aparte (`ai.edits` en `workspace-ai.ts`) y solo entra en B al pulsar «Aplicar» (`insertFields`, un paso de historial). Mover o editar una caja de la propuesta no pasa por `applyCoordsChange`, así que **Ctrl+Z / Ctrl+Y no la deshacen**.

## Propuesta
En cuanto la IA responde, las filas válidas se escriben en B como **un solo paso de historial** («Propuesta de la IA»). Desde ahí son anotaciones normales: mover, editar, borrar y Ctrl+Z / Ctrl+Y funcionan con cada cambio.

## Reglas
- **Llega la propuesta:** se insertan todas las filas colocadas (con las marcadas por defecto); las desmarcadas por dudosas no se escriben. Un Ctrl+Z quita toda la propuesta.
- **Revisión:** la barra acoplada sigue mostrando el resumen y la lista en «Anotaciones». Marcar/desmarcar una fila la escribe o la quita de B (un paso de historial por acción).
- **«Aplicar» pasa a «Dar por buena»:** solo cierra la revisión; no cambia B.
- **«Descartar»:** deshace los cambios de la propuesta (quita los campos que escribió; conserva lo que ya había en B). Pide confirmación si hay ediciones hechas sobre ella.
- **«Listo» con la revisión abierta:** da por buena la propuesta (avisa en un toast: «Propuesta de la IA mantenida»).
- **Propuestas del lote (guardadas):** al abrir el PDF **no** se escriben solas: la propuesta sigue sin aplicar hasta pulsar «Revisar» (regla actual de «nunca se aplica en bloque»); entonces se escribe en B y entra en el historial.
- **Guardado:** B ya se guarda con debounce; lo escrito se guarda como cualquier campo.
- **Recargar con revisión abierta:** la sesión guarda B con los campos; la barra de revisión no se recupera (los campos quedan como anotaciones normales).

## Preguntas para Maxter
1. ¿Escribir la propuesta en B nada más llegar (recomendado) o solo al pulsar «Revisar»?
2. ¿«Descartar» quita todo lo que escribió la IA (recomendado) o solo cierra la barra?
3. ¿Las filas desmarcadas se quitan de B (recomendado) o se quedan en gris sin escribir?
4. ¿«Listo» da por buena la propuesta (recomendado)?
