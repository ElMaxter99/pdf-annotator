# Volver al inicio y Atrás / Adelante en el editor

## Problema
En el editor (`/workspace`) no había una salida clara a la primera vista:
- El logo de la barra no era un enlace (en el lote sí lo es: `batch-bar__brand`).
- Recargar mandaba a la landing aunque hubiera una sesión guardada.
- «Adelante» después de «Atrás» fallaba: el PDF se había consumido y el guard redirigía a la landing.
- En el lote, recargar el editor perdía el PDF abierto (no estaba en la URL).
- En la app de escritorio no hay botones de navegador: sin atajos, la única salida era cerrar la ventana.

## Decisiones
1. **Logo = Ir al inicio**, igual que en la barra del lote ya aprobada (N-03). Sin cambio de layout: solo `cursor`, un fondo suave al pasar (`--accent` al 12 %, 150 ms `ease-out`, sin animación con `prefers-reduced-motion`), foco visible y tooltip «Ir al inicio».
2. **Recargar no saca del editor**: reabre la sesión guardada (la misma que ofrece «Continuar donde lo dejaste»). Sin sesión, va a la landing como antes.
3. **Atrás/Adelante**: «Adelante» reabre el último PDF de la visita con sus anotaciones, página y zoom (solo en memoria).
4. **Cada PDF del lote tiene URL** (`/workspace?lote=<id>`): recargar, Atrás y Adelante reabren ese PDF.
5. **Escritorio**: `Alt+←/→` (Windows, Linux), `⌘[`/`⌘]` (macOS; `⌘←/→` se deja para el cursor en los textos), botones laterales del ratón y gesto de deslizar.

## Pendiente de validar
- Mesa en el lienzo para el estado hover/foco del logo (cambio mínimo, reutiliza el patrón aprobado del lote).
- ¿Guardar la sesión también sin anotaciones para que recargar nunca pierda el PDF? Hoy no se hace para no pisar la sesión anterior (comportamiento ya decidido).
