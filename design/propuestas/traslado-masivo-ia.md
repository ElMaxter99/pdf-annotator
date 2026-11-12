# Plan: «Trasladar con IA» en masa sobre el lote

Estado: **plan validado por Maxter el 2026-11-12** (con un cambio: se quita «Aplicar las seguras»). Fase 1 en marcha. Fecha: 2026-11-12.

## 0. Decisiones propuestas (validadas)
1. **Cola en serie en el navegador** para la primera versión (opción A). La cola dentro del ayudante queda para la fase 4.
2. **Revisión siempre documento a documento**: el resultado de cada par es una propuesta que se abre en el editor, se revisa y se acepta o descarta, igual que en individual. **No hay «Aplicar las seguras» ni aplicación en bloque.** Marcar «Listo» es un paso aparte.
3. **Tope por pasada con Copilot: 10 peticiones**, con «Continuar» explícito. Con Claude, sin tope fijo pero con parada por límite de uso.
4. **Cascada en la primera versión como paso opcional, activado por defecto con Copilot**: primero «Copiar y ajustar por textos» (gratis) y la IA solo para los pares con campos sin colocar. Entra en la fase 1 como parte del motor y se muestra en la interfaz de la fase 3.
5. **Fase 1 (motor sin interfaz) arranca en cuanto valides**; el diseño en «Propuestas» va en paralelo y la interfaz solo tras aprobarlo.


## 1. Cómo está hoy (leído del código en `develop`, tras la PR #186)
- Un par A/B = **una** petición: `AiHelperService.propose()` manda A, B y la plantilla en base64 a `tools/ai-helper` (`POST /propose`), que lanza `claude -p` o `copilot -p` y devuelve NDJSON (`stage`, `event`, `result`/`error`).
- El ayudante tiene un cerrojo (`busy`): una sola petición a la vez, la segunda recibe 409.
- Cancelar ya funciona: cerrar la conexión aborta el CLI (`res.on('close')`).
- Reintento: Claude sí (2 intentos), Copilot no (`DEFAULT_RETRY`), según el ajuste del chip.
- Uso: Claude se mide (tokens, coste equivalente); Copilot no expone nada en `-p` («No medible», solo peticiones y tamaño enviado).
- Errores ya clasificados: `limit` (con hora de renovación), `timeout`, `cli_error`, `images_not_read`, `missing`, `aborted`, `busy`.
- Toda la lógica de aplicar (`applyAi`) vive en `workspace.page.ts` y sobre el editor abierto; el lote guarda `aPages/bPages/bJson` por `BatchItem` en IndexedDB.
- El panel ya tiene vista lista/cuadrícula, estados por fila, tira «Versiones nuevas (B)» con emparejado por nombre y plantillas pegadas/importadas por `pdfName`.

## 2. ¿Es viable? Sí, y casi todo ya existe
El masivo es **una cola de N peticiones iguales a la de hoy**, orquestada desde el panel del lote. No hay atajo de coste: N pares = N llamadas (cada par lleva sus imágenes). Lo nuevo es la cola, guardar la propuesta por PDF, poder aplicarla sin abrir el editor y todo el control de consumo.

## 3. Opciones
| | Qué es | Pros | Contras |
|---|---|---|---|
| **A. Cola en el navegador, en serie (recomendada)** | Servicio `AiBatchService` recorre los pares y llama a `propose()` de uno en uno. | Reutiliza ayudante y protocolo tal cual; cancelar/pausar trivial; cero riesgo de picos de consumo. | Si cierras la pestaña, se corta (el CLI se aborta: no hay consumo huérfano). |
| B. Cola en el ayudante (`POST /batch`) | El ayudante lleva la cola y sigue aunque cierres la pestaña. | Sobrevive a recargas. | Protocolo nuevo, estado en el proceso, más superficie de seguridad. Para una fase posterior. |
| C. Concurrencia 2–3 | Varias peticiones a la vez. | Más rápido con Claude. | Cambia el cerrojo a semáforo; riesgo de límites de ritmo; **nunca con Copilot**. Solo opcional y solo Claude. |
| D. API de pago / BYOK | Descartado en `docs/IA-LOCAL.md`. | — | — |

**Alternativa mejor para el consumo: cascada.** Antes de gastar IA, pasar «Copiar y ajustar por textos» (gratis, ya existe, determinista) a cada par y mandar a la IA **solo los pares donde queden campos sin colocar** (y, en un segundo paso, solo esos campos). Los casos fáciles (desplazamiento uniforme) salen gratis; la IA se reserva para páginas movidas, etiquetas cambiadas o anclas ambiguas. Es lo que más reduce créditos con Copilot.

## 4. Diseño del flujo (propuesto)
1. **Botón «Trasladar con IA» en la cabecera del panel** (lista y cuadrícula). Se activa con ≥1 par elegible: tiene B, A con campos y no está ya aplicado. Se puede limitar a la selección.
2. **Diálogo de confirmación con estimación**, antes de gastar nada: nº de pares, campos, páginas, tamaño de imágenes (el ayudante ya calcula `sent`), proveedor y modelo, reintento sí/no.
   - Claude: «≈ N peticiones, estimación de tokens» (marcada como estimación); luego se mide.
   - Copilot: «**N peticiones** × multiplicador del modelo»; sin inventar créditos. Pide confirmar el número. Tope por pasada (p. ej. 10) y «Continuar» explícito.
3. **Cola en serie** con progreso por fila: `Sin B` · `En cola` · `Leyendo` · `Preguntando (intento n)` · `Lista para revisar (x de y campos)` · `Parcial` · `Falló (motivo)` · `Cancelada` · `Aplicada`. Barra global con contador (3 de 6), tiempo transcurrido y restante estimado, y consumo acumulado (tokens en Claude; peticiones enviadas en Copilot).
4. **Controles**: Pausar (termina el par en curso), Cancelar (aborta el CLI al instante), Reanudar, «Reintentar los fallidos» (manual, nunca automático).
5. **Resultado = propuesta, no cambio.** Cada PDF guarda su propuesta (filas + detalles) en el lote. Después se revisa de una en una abriendo el editor con la propuesta ya cargada (la franja `ai-review` de hoy) y se acepta o se descarta. Aceptar es un paso de historial (deshacer). Nada pasa a «Listo» solo.
6. El botón «Copiar y adaptar con IA» del editor se bloquea mientras corre la cola (el ayudante solo atiende una a la vez).
7. El modal «Ver detalles» sirve por fila y se añade un resumen agregado de la pasada.

## 5. Coste, concurrencia, cancelación y fallos
- **Concurrencia 1 por defecto**; con Copilot fija en 1. Claude podría 2 más adelante.
- **Copilot Enterprise**: reintento desactivado y no se puede activar en masivo; 1 par = 1 petición; el diálogo muestra el número exacto. Para calibrar créditos reales: pasar los 6 casos de `sample-plano/` con Copilot y comparar el panel de uso de GitHub antes/después; con ese dato el diálogo puede decir «≈ X créditos» etiquetado como medido en nuestra prueba.
- **Límite alcanzado** (`limit`): se **pausa toda la cola**, se muestra la hora de renovación y los pares restantes quedan «En cola», no «Fallidos».
- **Cortacircuitos**: 2 fallos seguidos del mismo tipo (`cli_error`, `timeout`, `missing`) → pausa y pregunta; no se quema el resto de la cola.
- **Fallos por par** (`images_not_read`, sin texto, sin respuesta): el par queda «Falló» con el motivo ya traducido y la salida alternativa «Copiar y ajustar por textos»; la cola sigue.
- **Cerrar pestaña/recargar**: se aborta el CLI; al volver, el panel dice «Interrumpido: 3 de 6 hechos» y deja reanudar saltando lo ya hecho (el estado por fila se guarda).
- **Memoria**: se leen y codifican los PDF de un par cada vez, nunca los N a la vez.
- **Privacidad**: el consentimiento actual se pide una vez y el diálogo deja claro que se envían N pares.

## 6. Fases
**Fase 1, motor (invisible, sin esperar diseño)**
- `AiBatchService` (cola, estados, pausa/cancelar, cortacircuitos, límites) con tests unitarios.
- Guardado de la propuesta por PDF (para abrirla luego en el editor) + `BatchItem.aiProposal` saneado al leer de IndexedDB (dato no confiable).
- Estimador previo (pares/campos/páginas/bytes) sin llamar a la IA.
- e2e con el proveedor simulado (`AI_HELPER_FAKE=1`) sobre los 6 pares de `sample-plano/`, incluyendo un fallo forzado y cancelación.
- Cascada: ejecutar el ajuste por textos por par y marcar como candidatos a IA solo los que dejen campos sin colocar.
- Script de medición: reutilizar `tools/ai-phase0/run.mjs` con `expected-*.json` para puntuar acierto por caso y proveedor.

**Fase 2, diseño en «Propuestas» del lienzo** (hasta que lo apruebes no se programa interfaz): mesas IA-09.. con botón en la cabecera del panel, diálogo de estimación (Claude y Copilot), cola en marcha (lista y cuadrícula, 1650 y 1280, oscuro y claro), pausa/cancelar, límite alcanzado, fallos, resumen de la pasada y acceso a «Revisar propuesta» por fila, estados vacío/cargando/error/éxito.

**Fase 3, interfaz** fiel al diseño aprobado, en una PR; i18n 7 idiomas, README/CHANGELOG, `build`+`test:ci`+`e2e`.

**Fase 4, opcional**: ayudante con cola propia que sobrevive a recargas, concurrencia 2 con Claude.

## 7. Banco de pruebas
`tools/ai-phase0/sample-plano/` (6 pares, nombres `A-<caso>` / `B-<caso>`) encaja con el emparejado por nombre del lote: subir los 12 PDF y los 6 JSON de A de golpe debería formar 6 pares sin tocar nada. Casos: desplazamiento, otra página, etiquetas cambiadas, A4→Carta, portada nueva y anclas repetidas. Se comprobará en la Fase 1.

## 8. Riesgos
- `workspace.page.ts` no debe crecer: la cola va en servicio nuevo y componentes de `components/migration`.
- La estimación de Copilot es la parte débil (sin medida oficial): por eso se muestra el número de peticiones, no créditos inventados.
- La IA puede colocar mal: de ahí «propuesta, revisar y aplicar», nunca aplicar a ciegas.
