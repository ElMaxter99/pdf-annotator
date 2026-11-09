# Flujo de trabajo: diseño primero

Todo cambio en lo que ve el usuario (pantallas, flujos, textos de pantalla) se **diseña antes de programarse**, y la persona responsable lo aprueba. Lo que no se ve (motor, tests, rendimiento, docs) avanza sin esperar. Es el mismo flujo que se usa en pugIDE.

## Pasos
1. **Diseñar** en el lienzo de claude.ai (artifact *Design (canvas)*, «PDF Annotator · Diseño de la interfaz»). Su enlace vive en `design/README.md`. Es único: no se crea otro.
2. **Entregar** el enlace con una lista corta de decisiones por tomar y la recomendación.
3. **Aprobar.** Hasta entonces no se programa la interfaz.
4. **Registrar el diseño aprobado** en `design/`: copia de `canvas.json` y de los `*.dc.html` en `design/canvas/`, tabla de mesas en `design/README.md` y nota en `CHANGELOG.md`, en la misma PR que el código o antes.
5. **Implementar.** La PR enlaza la mesa que implementa. Si hay que apartarse del diseño, primero se corrige el lienzo.

## Reglas del lienzo
- Una mesa por pantalla o estado, con id estable: `V-NN` para pantallas ya existentes y `P-NN` para propuestas. No se renumera ni se reutiliza.
- Una fila por versión o propuesta, solo con las mesas que cambian.
- Tokens de `src/styles.scss` (`--bg --panel --accent --danger --text --muted`); no inventar colores ni tipografías.
- Esta app es responsive: dibujar **tres anchos** (≥1650, ~1280 y <960 px) y ambos temas cuando cambie el layout.
- Datos ficticios realistas (nada de lorem ipsum), contraste AA, `<button>` y `<a href>` reales.

## Carpeta `design/` (fuera del build)
`design/README.md` (enlace, convención y tabla de mesas), `design/canvas/` (copia exacta de lo publicado), `design/propuestas/<tema>.md` (texto de cada propuesta). No está en `src/` ni la lee `angular.json`, y `.dockerignore` la excluye de la imagen. Sirve para que cualquier sesión de Claude tenga el contexto del diseño aprobado.

## Ramas y PR
Rama por tarea (`feat/…`, `fix/…`, `docs/…`). Commits cortos en imperativo. Antes del PR: build, `test:ci` y e2e (ver `docs/TESTING.md`). Rellena la plantilla de PR y actualiza `CHANGELOG.md` y los docs afectados.
