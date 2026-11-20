# «Trasladar con IA» · modal mínimo con «Más información» a demanda (candidata 1.17)

Mesas **P-112** (antes y después), **P-113** (estados, oscuro 1650) y **P-114** (estados, claro 1280) en «Propuestas». **Estado: propuesta pendiente de aprobación de Maxter. No se programa nada hasta entonces.** Origen: Maxter, tras probar la RC 1.16.0-rc.1: el desplegable «está súper mal planteado», con demasiados mensajes de aviso; que no ocupe nada y que la explicación se vea solo si se pide.

## Problema
El modal de `pages/batch/ai-batch/ai-batch-button` apila hasta **ocho bloques** antes del botón (con Copilot y la primera vez):
1. Resumen («10 PDF con A y B · 270 campos») y debajo la estimación («Hasta 10 peticiones (tope 10)»).
2. Desglose de por qué unos PDF se quedan fuera (título + hasta tres filas con «Ver cuáles»).
3. Línea de omitidos («N de los marcados se omiten: sin versión B, sin campos o ya Listo»), que repite la anterior.
4. Fila del proveedor y modelo («Copilot CLI · Automático · Cambiar»).
5. Con «Cambiar»: tarjetas de proveedor, selector de modelo con su pista y la nota «Qué se envía».
6. Aviso de Copilot sobre créditos por petición («Créditos de IA por petición. El consumo que se muestra es…»), en tono de advertencia aunque no lo es.
7. Casilla «Probar antes con “Ajustar por textos”» con su ⓘ.
8. Nota de privacidad («Se envían los PDF A y B de cada par a tu … local, uno a uno…») y casilla «No volver a preguntar».

Casi todo es información que se lee una vez; la decisión real es una: **qué PDF se envían y con qué proveedor**.

## Propuesta (recomendada)
Modal con **cuatro elementos** y una línea condicional:

```
Trasladar con IA                                    ⓘ
10 PDF con A y B · 270 campos          [4 se omiten · Ver]
Copilot · Automático · Cambiar ▾
☐ Probar antes con «Ajustar por textos» ⓘ
[Cancelar]                       [✦ Trasladar 10 PDF]
```

- **ⓘ del título («Más información»)**: despliega **en el mismo sitio** (acordeón, cerrado por defecto) todo lo explicativo, agrupado y corto:
  - *Peticiones:* «Hasta 10 peticiones (tope 10 por pasada). Con Claude el consumo real se mide y se ve en vivo.»
  - *Créditos* (solo Copilot): «Cada petición descuenta créditos según el modelo.» En tono informativo, no de aviso.
  - *Qué se envía:* «Se envían los PDF A y B de cada par a tu {proveedor} local, uno a uno. Nada se aplica solo: cada propuesta la revisas tú.»
- **Omitidos**: el bloque de desglose y la línea repetida pasan a una **etiqueta de una línea** («4 se omiten · Ver») que, al pulsarla, muestra el desglose actual (tres filas con «Ver cuáles»). Solo aparece si hay omitidos.
- **Cambiar ▾** conserva las tarjetas de proveedor y el modelo, sin párrafos: las pistas de modelo pasan a un ⓘ junto al selector.
- **Casilla de «Ajustar por textos»**: se queda visible (es una decisión real) con su ⓘ.
- **Privacidad, primera vez**: una sola línea con la casilla («Se envían los PDF A y B a tu {proveedor} local. ☐ No volver a avisar»); no vuelve a salir una vez aceptada. El texto largo vive en el ⓘ.
- **Errores accionables** (ayudante apagado, CLI no encontrado): se quedan como están, con «Comprobar de nuevo».

Resultado: de unas ocho piezas apiladas a **cuatro filas** (y una más solo si hay omitidos, errores o primera vez). La altura baja a un tercio y nada se pierde: todo está a un clic.

## Qué no cambia
Las reglas de qué PDF son elegibles, la cola, los reintentos, el tope por pasada, el consentimiento (se sigue pidiendo la primera vez), los atajos (Esc, foco atrapado) y todos los `data-testid` existentes.

## Mesas
- **P-112** · antes y después: captura real del modal actual (con Copilot, primera vez) junto al propuesto.
- **P-113 / P-114** · oscuro 1650 y claro 1280:
  - E1 Reposo (Claude, ya con consentimiento): cuatro filas.
  - E2 Con «Más información» desplegado.
  - E3 Con omitidos («4 se omiten · Ver») y su desglose abierto.
  - E4 Copilot, primera vez: línea de privacidad con casilla.
  - E5 «Cambiar» abierto (tarjetas de proveedor y modelo).
  - E6 Errores: ayudante apagado y CLI no encontrado.

## Preguntas para Maxter
1. **Dónde vive «Más información»:** ⓘ en el título con acordeón en el sitio (**recomendado**) o un enlace «Más información» al pie.
2. **Privacidad la primera vez:** una línea con casilla (**recomendado**, mantiene el consentimiento de la decisión 1 de `DECISIONS`) o quitarla del modal y dejarla solo en ⓘ.
3. **«Ajustar por textos»:** visible en el modal (**recomendado**) o dentro de «Cambiar» como opción avanzada.
4. **Omitidos:** etiqueta de una línea con desglose a demanda (**recomendado**) o mantener el desglose siempre visible.

## Archivos que tocaría (tras la aprobación)
`pages/batch/ai-batch/ai-batch-button.component.html|ts` y `ai-batch.scss`, claves `batch.ai.*` (7 idiomas: título del ⓘ y textos agrupados; se reutilizan los existentes), `e2e/ai.spec.ts` y `e2e/batch*.spec.ts` (testids se conservan), `CHANGELOG`. El panel de progreso (`ai-batch-panel`) y «Ver detalles» no se tocan. Revisar 1650 y 1280 px, oscuro y claro.
