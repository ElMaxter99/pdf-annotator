# Espacio de trabajo libre (P-127, 1.18)

**Estado: aprobada por Maxter el 2026-11-23 («diseño ok», «ambos diseños»: un PDF y «Dividida»); en las cuatro preguntas, lo recomendado. Implementada.** Origen: petición de Maxter al probar el traslado (poder subir los PDF y dejar A en una esquina). Continúa P-109 (margen horizontal).

## Problema
El visor tiene margen vacío a izquierda y derecha (P-109), pero no arriba ni abajo: el PDF solo llega hasta su borde y no se puede subir ni dejar en una esquina.

## Decisiones
1. **Alcance:** un PDF y «Dividida» (enlazada y desenlazada).
2. **Tamaño:** la mitad del alto del visor arriba y abajo (`--work-margin-y`; en el panel A desenlazado, `--a-margin-y`).
3. **Doble clic en la etiqueta A/B:** centra en horizontal y vertical; otro doble clic reencuadra (150–300 ms, `ease-out`; instantáneo con `prefers-reduced-motion`).
4. **Rueda:** con «rueda al borde pasa de página» (por defecto) se detiene en el borde de la hoja y pasa de página; sin ese ajuste recorre también el margen.

## Reglas
- Margen invisible (mismo fondo del visor), sin controles ni textos nuevos.
- Reposo igual que hoy (hoja arriba): al abrir, cambiar de página, de zoom o de modo, y con `0`, `⇧1` o ajustar al ancho.
- Se mueve con Espacio + arrastrar, botón central, barras y trackpad.
- Anotaciones, coordenadas, guías y recuadro de selección no cambian: el margen es zona vacía. Las capas ancladas al visor compensan también el desplazamiento vertical (`--vy`).
