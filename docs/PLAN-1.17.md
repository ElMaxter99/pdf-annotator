# Plan de la 1.17 · «IA medible y pulido»

Estado (2026-11-20): **ola 1 fusionada** (A1, A3, A4, B2, B3; #308 y #309) y **ola 2 hecha** (B1, C1, C2, D2, B4 y `heading-order`, sin mesas por decisión de Maxter; D3 ya estaba resuelto). A6 hecho tras la RC1 (aprobado por Maxter sin mesas). Pendiente: A2 (con los PDF de Maxter), A5 (créditos de Copilot), D1 (Docker en el equipo de Maxter). Pensado, como el de la 1.16, para lanzar agentes en paralelo: cada tarea dice sus archivos, dependencias, si necesita diseño y su criterio de hecho.

La 1.16.0 está publicada (doble clic del visor, espacio de trabajo ampliado, modal mínimo de «Trasladar con IA», motor por partes, anclar en B, huecos de escritura, colocación sin IA y «no existe en B»). Lo pendiente que sale de ella es sobre todo **comprobar la IA con datos reales** y cerrar lo que quedó a medias.

## 0. Reglas (las mismas de la 1.16)
1. Nadie fusiona en `develop` ni en `main`/`master`; nadie publica versiones (RC, final, Vercel) sin petición expresa de Maxter para esa versión.
2. **Diseño primero** para lo visible, salvo que Maxter diga «sin mesas» para esa tarea.
3. Una PR por tarea o, si Maxter lo prefiere, una PR que las reúna (lo que se ha hecho en la 1.16).
4. «Hecho» por PR: `npm run build`, `npm run test:ci`, `npm run e2e`; `cd tools/ai-phase0 && npm test` y `npm run test:helper` si se toca la IA; 7 idiomas si cambia un texto; CHANGELOG en la sección de la versión que se vaya a publicar; 1650 y 1280 px en ambos temas si cambia algo visible.

## 1. Mapa

| Tarea | Qué | Visible | Depende de | Paralelo con |
| --- | --- | --- | --- | --- |
| **A1** | Banco de medida de la IA con el motor nuevo | No | — | todo |
| **A2** | Ajustes del motor con los resultados reales | No | **A1 + pruebas de Maxter** | B*, C*, D* |
| **A3** | Huecos escritos con texto («____», «.....») | No | — | todo menos A2 |
| **A4** | No perder lo colocado sin IA si falla la lectura de imágenes | No | — | todo menos A2 |
| **A5** | Créditos reales de Copilot y texto del diálogo | Un texto | **Maxter** (su cuenta) | todo |
| **A6** | Instrucciones por lote o por PDF para la IA | **Sí** | **decisión de Maxter** | — |
| **B1** | Contraste del acento como fondo en tema claro | **Sí** | mesa o «sin mesas» | B2, C*, A* |
| **B2** | `h1` oculto y utilidad `.sr-only` | No (solo lectores de pantalla) | — | todo |
| **B3** | Colores sueltos → tokens (mismos valores) | No | — | todo menos B1 a la vez en `styles.scss` |
| **B4** | Auditoría axe en el CI (job opcional) | No | B1, B2 | — |
| **C1** | Margen y «Centrar» también en «Dividida» desenlazada | **Sí** | mesa o «sin mesas» | A*, B2 |
| **C2** | Barra horizontal del visor más discreta en reposo | **Sí** | decisión de Maxter | A*, B2 |
| **D1** | Docker: build completo en la máquina de Maxter | — | **Maxter** | todo |
| **D2** | Vercel Insights solo cuando se despliega en Vercel | No | decisión de Maxter | todo |
| **D3** | Limpieza de ramas viejas del remoto | — | **aprobación de Maxter** | todo |

## 2. Tareas

### A1 · Banco de medida de la IA (invisible, lo primero)
- **Por qué:** hoy no hay cifras de acierto con el motor nuevo; `tools/ai-phase0/run.mjs` sigue usando la petición única de la fase 0.
- **Hacer:** que `run.mjs` (o un `bench.mjs` nuevo) ejecute el **flujo de la app** (`runProposal`: pase sin IA, pasadas, anclar en B, huecos) sobre `sample-plano/` y sobre una carpeta de casos que Maxter pueda llenar en su equipo, y saque una tabla por caso: colocados, a menos de 5 pt, «no existe en B», sin colocar, colocados sin IA, peticiones, tokens/créditos y segundos. Que compare con `AI_HELPER_TEXT_FIRST=0` para ver cuánto ahorra el pase sin IA.
- **Archivos:** `tools/ai-phase0/` (+ `docs/IA-LOCAL.md`).
- **Hecho:** informe en Markdown generado por el script; pruebas con el proveedor simulado.

### A2 · Ajustes con resultados reales (invisible)
- **Depende** de que Maxter pruebe la 1.16.0 con su CLI (modelo pequeño) y pase «Ver detalles» o la salida de A1 de los casos que fallen.
- Ajustes probables: umbrales de huecos (`slots.mjs`), etiquetas «con pinta de etiqueta» del pase sin IA, texto de los prompts, tope de peticiones.

### A3 · Huecos escritos con texto (invisible)
- Detectar como hueco los textos hechos de guiones bajos o puntos («Nombre: ________», «Fecha: ....») y usarlos igual que las líneas dibujadas.
- **Archivos:** `tools/ai-phase0/slots.mjs`, `pdf.mjs` y pruebas.

### A4 · No perder lo colocado sin IA (invisible)
- Hoy, si la primera petición falla con `images_not_read`, se pierde el PDF entero, también lo colocado sin IA. Devolver un **parcial** con lo colocado y el diagnóstico.
- **Archivos:** `tools/ai-helper/pipeline.mjs` y pruebas; la app ya admite parciales.

### A5 · Créditos reales de Copilot (Maxter)
- Guion en `docs/IA-LOCAL.md` («Medir los créditos reales de Copilot»); con A1 se puede repetir con el motor nuevo. Con la cifra, se cambia el texto del ⓘ «Más información» del diálogo.

### A6 · Instrucciones por lote o por PDF (hecho)
- **Hecho:** fila plegada «Instrucciones para la IA (opcional)» en el popover del lote y en el panel del chip «✦ IA» del editor (solo ese PDF, hereda las del lote); se envían al ayudante y van citadas en los prompts. Detalle en `docs/IA-LOCAL.md` («Instrucciones para la IA»).
- Un texto libre opcional por lote («las casillas van a la izquierda», «el CIF se llama NIF») que se añade al prompt. Visible: necesita mesa. **Recomendación:** esperar a A1/A2; puede que no haga falta.

### B1 · Contraste del acento en tema claro (visible)
- La auditoría axe mide 3,44:1 con texto blanco sobre `--accent` (`#0f9b8e`) en botones primarios y segmentos activos. Propuesta: un fondo `#0b7d72` (≈ 5,0:1) solo en tema claro, o texto oscuro sobre el acento.
- **Archivos:** `src/styles.scss` (tokens del tema claro). Revisar 1650 y 1280 en claro.

### B2 · `h1` oculto (invisible a la vista)
- Utilidad `.sr-only` y un `h1` oculto en el editor y en los pasos del lote (lo pide axe). Sin cambio visual.

### B3 · Colores sueltos → tokens (invisible)
- La auditoría cuenta ≈ 290 `rgba()` y ≈ 215 hex fuera de los tokens; `#fbbf24` aparece 47 veces. Pasar a tokens (`--warning`, `--on-accent`…) **sin cambiar ningún valor**. Comparar capturas antes/después (deben ser idénticas).

### B4 · axe en el CI
- Job opcional o semanal con `npm run a11y` que falle con impacto serio o crítico, cuando B1 y B2 lo dejen limpio.

### C1 · «Dividida» desenlazada con margen y «Centrar» (visible)
- Hoy el panel A desenlazado tiene su propio desplazamiento sin margen. Hace falta envolver el contenido del panel A en un elemento propio para que las capas de referencia no se desalineen.
- **Archivos:** `workspace-viewer.component.html`, `styles.scss`, `workspace.page.ts` (`splitAPane`, `centerPane`) y e2e.

### C2 · Barra horizontal en reposo (decisión)
- Desde la 1.16 el visor siempre desplaza en horizontal y se ve la barra. Opciones: dejarla, hacerla fina/translúcida, o mostrarla solo al pasar el ratón.

### D1 · Docker (Maxter)
- Ejecutar el guion de 6 pasos de `docs/TESTING.md` (el build completo no se pudo probar en la nube).

### D2 · Vercel Insights solo en Vercel (decisión)
- `src/main.ts` inyecta siempre los scripts de Vercel; en Docker o en local dan errores de MIME en la consola. Propuesta: inyectarlos solo cuando la app se sirve desde Vercel.

### D3 · Ramas viejas (aprobación)
- Quedan en el remoto `claude/t2-docker`, `claude/t4-onpush` y `claude/t5-axe` (ya fusionadas en la #299). Borrarlas necesita tu visto bueno.

## 3. Orden sugerido
1. **Ola 1 (ya, en paralelo, todo invisible):** A1, A3, A4, B2, B3.
2. **Mientras:** Maxter prueba la 1.16.0 con su CLI (y A1 en su equipo cuando esté) → **A2**.
3. **Ola 2 (con tu decisión o mesa):** B1, C1, C2, D2.
4. **Después:** B4, A5, A6 si sigue haciendo falta.
5. **Cierre:** subida a 1.17.0 y RC solo con tu petición.

## 4. Riesgos
- Sin datos reales, A2 es a ciegas: por eso A1 va primero y las pruebas de Maxter marcan el ritmo.
- B3 toca muchos estilos: comparar capturas para que no cambie ni un píxel.
- C1 cambia el DOM del visor: los e2e de «Dividida» son la red de seguridad.
