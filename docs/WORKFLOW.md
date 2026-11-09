# Flujo de trabajo: diseño primero

Todo cambio en lo que ve el usuario (pantallas, flujos, textos de pantalla) se **diseña antes de programarse**, y la persona responsable lo aprueba. Lo que no se ve (motor, tests, rendimiento, docs) avanza sin esperar. Es el mismo flujo que se usa en pugIDE.

## Pasos
1. **Diseñar** en el lienzo de claude.ai (artifact *Design (canvas)*, «PDF Annotator · Diseño de la interfaz»). Su enlace vive en `design/README.md`. Es único: no se crea otro.
2. **Entregar** el enlace con una lista corta de decisiones por tomar y la recomendación.
3. **Aprobar.** Hasta entonces no se programa la interfaz.
4. **Registrar el diseño aprobado** en `design/`: copia de `canvas.json` y de los `*.dc.html` en `design/canvas/`, tabla de mesas en `design/README.md` y nota en `CHANGELOG.md`, en la misma PR que el código o antes.
5. **Implementar.** La PR enlaza la mesa que implementa. Si hay que apartarse del diseño, primero se corrige el lienzo.

## Reglas de diseño (fijadas por el autor, 2026-11-09)
1. **Diseñar antes de programar** cualquier vista, flujo o cambio visible, como artefacto: tableros con cada vista y sus estados (vacío, cargando, error, éxito) y los flujos paso a paso, animados cuando aporte.
2. **No programar hasta la aprobación.** Aprobado, se implementa fiel al diseño en una PR.
3. **Respetar la identidad del proyecto**: logo/hero, paleta, tipografía y espaciado (`public/logo.svg`, tokens de `styles.scss`). Si falta algo, proponer un pequeño sistema de diseño (tokens de color, tipografía, radios, sombras y reglas de movimiento) y pedir validación.
4. **Estilo:** limpio, sobrio y cálido, con mucho aire y jerarquía clara, como la interfaz de Claude. Animaciones suaves de 150–300 ms con `ease-out` y respeto a `prefers-reduced-motion`.
5. **Siempre feedback:** esqueletos al cargar, barras de progreso con contador en operaciones largas, estados por fila y confirmaciones claras al terminar.
6. **Accesibilidad:** buen contraste, foco visible y uso completo con teclado.

## Autonomía
- **Sin preguntar:** investigar, diseñar, programar en ramas, abrir PRs y arreglar el CI.
- **Con aprobación:** fusionar en `main`, publicar versiones, borrar cosas y decisiones de producto.

## Formato de cada actualización
Termina siempre con: **Estado** (dónde está el trabajo), **Hecho por Claude** (con enlaces) y **Necesito de ti** (lista numerada de lo que hay que validar o responder y dónde; si nada: «Nada, sigo solo»). Idioma: español.

## Reglas del lienzo
- Una mesa por pantalla o estado, con id estable: `V-NN` para pantallas ya existentes y `P-NN` para propuestas. No se renumera ni se reutiliza.
- Una fila por versión o propuesta, solo con las mesas que cambian.
- Tokens de `src/styles.scss` (`--bg --panel --accent --danger --text --muted`); no inventar colores ni tipografías.
- Esta app es responsive: dibujar **tres anchos** (≥1650, ~1280 y <960 px) y ambos temas cuando cambie el layout.
- Datos ficticios realistas (nada de lorem ipsum), contraste AA, `<button>` y `<a href>` reales.

## Carpeta `design/` (fuera del build)
`design/README.md` (enlace, convención y tabla de mesas), `design/canvas/` (copia exacta de lo publicado), `design/propuestas/<tema>.md` (texto de cada propuesta). No está en `src/` ni la lee `angular.json`, y `.dockerignore` la excluye de la imagen. Sirve para que cualquier sesión de Claude tenga el contexto del diseño aprobado.

## Ramas y PR
Se pueden abrir PRs sin pedir permiso; fusionar en `main` y publicar versiones requiere aprobación. Rama por tarea (`feat/…`, `fix/…`, `docs/…`). Commits cortos en imperativo. Antes del PR: build, `test:ci` y e2e (ver `docs/TESTING.md`). Rellena la plantilla de PR y actualiza `CHANGELOG.md` y los docs afectados.
