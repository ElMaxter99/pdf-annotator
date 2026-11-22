# Plan de la 1.18 · propuesta

Estado (2026-11-22): **propuesta de Claude; entran Q1, R1, S1, M1, I1 e I2 (pendiente de orden y de la mesa de S1).** D1 y D2 quedan aparcados muy a futuro por decisión de Maxter (§5). La 1.17.0 está publicada (ver `docs/PLAN-1.17.md` y el CHANGELOG). Como los anteriores, pensado para trabajar por tareas en paralelo: cada una dice qué toca, si es visible, de qué depende y cuándo está hecha.

Lo que sale de la 1.17: hay mucho hecho **sin mesas** que el lienzo no tiene, la IA está medida con casos sintéticos pero no con los PDF reales de Maxter, y hubo dos e2e intermitentes que retrasaron RC. Ninguna funcionalidad grande está pedida aún, salvo «Almacenamiento».

## 0. Reglas (las de siempre)
1. Nadie fusiona en `develop` ni en `main`/`master`; nadie publica versiones (RC, final, Vercel) sin petición expresa de Maxter para esa versión.
2. **Diseño primero** para lo visible, salvo que Maxter diga «sin mesas» para esa tarea; lo hecho sin mesas se anota en `design/PENDIENTE-MESAS.md`.
3. «Hecho» por PR: `npm run build`, `npm run test:ci`, `npm run e2e`; `cd tools/ai-phase0 && npm test` y `npm run test:helper` si se toca la IA; `npm run test:desktop` si se toca `desktop/`; 7 idiomas si cambia un texto; CHANGELOG; 1650 y 1280 px en ambos temas si cambia algo visible.

## 1. Mapa

| Tarea | Qué | Visible | Depende de | Recomendación |
| --- | --- | --- | --- | --- |
| **S1** | Apartado «Almacenamiento» de la app de escritorio | **Sí** | **mesa** | Entra (lo pidió Maxter) |
| **M1** | Pintar en el lienzo lo hecho sin mesas (18 puntos) | Lienzo | cuenta del lienzo | Entra, en paralelo |
| **Q1** | e2e sin intermitencias | No | — | Entra (lo primero) |
| **I1** | IA con los PDF reales de Maxter (A2 real) | No | **PDF y pruebas de Maxter** | Entra si Maxter pasa casos |
| **I2** | Créditos reales de Copilot frente a la factura (A5) | Un texto | **cuenta de Maxter** | Opcional |
| **R1** | Mantenimiento: dependencias y `app.ts` en `OnPush` | No | — | Entra |

## 2. Tareas

### S1 · «Almacenamiento» (visible, necesita mesa)
- Análisis cerrado en `design/propuestas/almacenamiento-en-disco.md`: solo escritorio, en el menú ⋯ y con un enlace desde «Proyectos»; tres grupos (tu trabajo, la app, se puede vaciar); solo se vacían las cachés, con confirmación; tamaños en segundo plano; rutas en una lista cerrada del proceso principal.
- **Orden:** mesa (lo que debe pintar está en el §7 de la propuesta) → aprobación → `desktop/storage.mjs` con pruebas, IPC, `components/storage-panel`, e2e con el puente simulado.
- **Hecho:** panel en los 7 idiomas, `test:desktop` con el inventario y el vaciado, e2e, README y `docs/ARCHITECTURE.md` §10b.

### M1 · Lienzo al día (lo hace la cuenta del lienzo)
- Pintar los 18 puntos de `design/PENDIENTE-MESAS.md` copiando lo que ya hay en la app (capturas de la 1.17.0), marcar cada uno con su `P-NN` y quitarlo de la lista. Claude puede preparar las capturas a 1650 y 1280 px en ambos temas para que la mesa solo tenga que copiarlas.

### Q1 · e2e sin intermitencias (invisible)
- En la 1.17 fallaron dos e2e por tiempos (la rueda en «Dividida» y el clic tras crear una anotación; #308 y #317), y una RC cayó por ello.
- **Hacer:** pasar la suite completa 20 veces seguidas (`--repeat-each`) en la nube, apuntar los que fallen alguna vez y arreglarlos con esperas a estados reales (nada de `waitForTimeout` ni de desactivar pruebas). Añadir a `docs/TESTING.md` cómo repetirlo.
- **Hecho:** 20 de 20 en verde con la suite completa.

### I1 · IA con PDF reales (invisible)
- El motor se ajustó con casos sintéticos (`sample-dificil/`: 34-35 de 35 con haiku). Falta ver los PDF de verdad.
- **Maxter:** ejecutar el banco (`cd tools/ai-phase0 && npm run bench -- --provider claude --cases <carpeta>`, guía en `docs/IA-LOCAL.md`) sobre unos pocos pares A/B reales y pasar el informe (no lleva contenido de los PDF), o «Copiar informe» del lote en los que fallen.
- **Claude:** ajustes del motor según lo que salga, con un caso sintético nuevo por cada patrón que falle.

### I2 · Créditos de Copilot (opcional)
- La app ya enseña los créditos que estima Copilot. Para saber si cuadran con la factura de GitHub hace falta la cuenta de Maxter (guion en `docs/IA-LOCAL.md`). Con la cifra, se ajusta el texto del ⓘ «Más información».

### R1 · Mantenimiento (invisible)
- Actualizar dependencias menores (Angular, Playwright, electron, electron-updater, pdf.js, pdf-lib) en una PR con la suite completa y el empaquetado de escritorio en verde.
- `app.ts` sigue en `ChangeDetectionStrategy.Eager`: pasarlo a `OnPush` con su guardia, como el resto (`onpush-idle.spec.ts`).

## 3. Orden sugerido
1. **Ya (invisible):** Q1 y R1, en paralelo.
2. **En paralelo:** M1 (cuenta del lienzo) y la mesa de S1.
3. **Cuando haya mesa:** S1.
4. **Cuando Maxter pase casos:** I1 (e I2 si quiere).
5. **Cierre:** subida a 1.18.0 y RC solo con petición de Maxter.

## 4. Preguntas para Maxter
1. ¿Algo más que te haya salido usando la 1.17?
2. ¿Una PR por tarea o una que las reúna, como en la 1.17?

## 5. Aparcado muy a futuro (decisión de Maxter, 2026-11-22)
No se planifica ni se propone de nuevo salvo que Maxter lo pida.
- **Firmar la app de macOS** (actualización automática en Mac): sin prioridad, nadie usa la app en Mac. Exigiría una cuenta de Apple Developer de pago y secretos en el CI. Si algún día se hace, `latest-mac.yml` ya lista arm64 e Intel.
- **Cifrado opcional de proyectos:** Maxter considera que traería más problemas que ventajas (claves olvidadas, sincronización, soporte).
