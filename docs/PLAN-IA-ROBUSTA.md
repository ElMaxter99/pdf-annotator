# Plan · «Trasladar con IA» robusto (para la 1.16.0-rc.3)

Estado: **aprobado por Maxter el 2026-11-20** («ponte a desarrollarlo»). Origen: pruebas de la rc.2 con PDF reestructurados (una página que pasa a tres, textos renombrados) y modelos pequeños (Haiku, GPT mini): muchos «Parcial», «no leyó las imágenes» y mucho gasto.

## Objetivo
Que funcione con **modelos pequeños** cuando la estructura cambia, aunque cueste algo más de IA, con el coste **acotado y visible**. Mismo comportamiento con cualquier proveedor.

## Por qué hoy es frágil (verificado en el código)
1. **Una sola petición por PDF** con todas las imágenes de A y de B, todos los textos y todos los campos: demasiado para un modelo pequeño.
2. **Hay que leer el código de todas las imágenes** o se descarta la respuesta entera; más páginas, más probabilidad de fallo.
3. **Los campos sin colocar no se vuelven a preguntar**: el reintento solo salta si el JSON es inválido o faltan códigos.
4. **Copilot no reintenta** cuando no lee las imágenes (Claude sí, una vez).
5. **Se envían todas las páginas de A** aunque los campos solo estén en dos.
6. **El prompt vive dentro de una cadena de JavaScript**: difícil de leer y mantener por una persona.

## Diseño nuevo (motor: `tools/ai-helper/pipeline.mjs` y `tools/ai-phase0/lib.mjs`)

### 0. Preparación (sin IA)
- **Páginas útiles de A** = las que tienen campos en la plantilla. Solo esas se envían (imagen y textos). Un A de 10 páginas con campos en 2 manda 2.
- B se lee entero (en local) para poder elegir candidatas, pero solo se envían las candidatas.

### 1. Páginas candidatas de B para cada página útil de A (sin IA)
- Con **tabla de páginas A↔B**: las páginas de B que apuntan a esa página de A.
- Sin tabla: se ordenan las páginas de B por **palabras compartidas** con esa página de A (normalizadas, ≥ 3 letras, sin números) y se toman las **K = 3** mejores (`CANDIDATE_PAGES`). Si B tiene ≤ 3 páginas, todas.

### 2. Pasada 1 · una petición por página útil de A
- Imágenes: esa página de A + sus candidatas de B. **Solo se exige el código de esas imágenes.**
- Textos: los de esa página de A y los de las candidatas de B. Campos: solo los de esa página, con **8** textos cercanos (hoy 6).

### 3. Pasada 2 · re-pregunta dirigida
- Campos sin colocar tras la pasada 1 (`found:false`, ancla no encontrada, sin respuesta) → una petición más por página de A con **solo esos campos**:
  - con las **páginas de B que aún no se enviaron** (de 3 en 3), o
  - si ya se enviaron todas, con las mismas y una **nota con el motivo** de cada fallo (p. ej. «“Razón social” no existe literalmente en textsB.json: elige un texto que exista»).
- Si un campo sale colocado en varias peticiones, gana el de mayor confianza.

### 4. Reintentos iguales para todos los proveedores
- Cada petición, **hasta 2 intentos** con Claude y con Copilot si: el JSON no vale, menos de la mitad de entradas son válidas o faltan códigos de las imágenes **de esa petición**.
- Se quita la prueba previa propia de Copilot: la **primera petición hace de prueba**. Si tras sus 2 intentos no lee las imágenes, el PDF falla con `images_not_read` y no se gastan más peticiones.
- La opción «reintentar» pasa a estar **activa por defecto con todos los proveedores**.

### 5. Coste acotado
- **Tope de peticiones por PDF: `MAX_REQUESTS_PER_PDF = 8`** (incluye reintentos). Al llegar, se devuelve lo colocado (parcial) con el motivo `cap_reached`.
- Las llamadas de un mismo PDF van en serie; la concurrencia entre PDF no cambia (2 con Claude, 1 con Copilot).

### 6. Errores
- `limit`, `aborted`, `missing`: se lanzan como hoy (pausan o cortan el lote).
- `timeout` / `cli_error` en una petición: si ya hay campos colocados, se devuelve **parcial** con `details.aborted = <código>`; si no, se lanzan como hoy.

### 7. Prompts legibles
- Los textos pasan a archivos Markdown con marcadores `{{…}}` en `tools/ai-helper/prompts/` (`traslado.md`, `repregunta.md`, `reintento-imagenes.md`, `reintento-json.md`). El código solo rellena los marcadores. Cualquiera puede leerlos y editarlos sin tocar JavaScript.

## Contrato con la app (para trabajar en paralelo)
- `onStage('asking', n)`: `n` = número de llamada al CLI dentro del PDF (1, 2, 3…), no «intento».
- `result.details.attempts[]`: **una entrada por llamada** (mismos campos de hoy) más `pass` (1 | 2), `group` (p. ej. `"A-p3"`), `images` (nombres enviados) y `fields` (n.º de campos).
- `result.details.requests` = total de llamadas; `result.details.plan` = `[{ group, candidatesB: ["B-p1", …], fields }]`.
- `notPlaced`, `diagnosis`, `placed`, `sent` como hoy; `diagnosis` admite además `cap_reached`.
- `rows` con el mismo formato.

## App (`src/`)
- **Arreglar «Ver detalles»** en la vista de cuadrícula: el chip vive dentro del botón de la tarjeta y el clic abría el editor. Lo mismo con «Saltar este».
- `batch.ai.state.asking`: «Preguntando · petición {{n}}» (7 idiomas).
- `estimateAiBatch`: mínimo = Σ páginas de A con campos; máximo = Σ mín(8, páginas útiles × 4).
- Reintento por defecto activo con todos los proveedores.

## Fuera de esta entrega (propuestas para decidir)
1. ~~**Colocación por texto exacto antes de la IA**~~: hecho en la rc.4 (ver abajo), sobre el hueco dibujado y no con el desplazamiento de A.
2. **Prompt configurable desde la app** e **instrucciones por lote o por PDF** (para el futuro; dudoso que compense a quien solo maqueta).
3. **Medir el acierto** con casos reales anonimizados antes de pasar a modelos medianos.

## Pruebas
- Unitarias del motor: páginas útiles, candidatas (con y sin tabla), reparto en pasadas, mezcla por confianza, tope, códigos por petición, plantillas de prompt (`npm run test:helper` y `tools/ai-phase0` `npm test`).
- El proveedor simulado (`AI_HELPER_FAKE=1`) recorre el flujo nuevo; los e2e de `e2e/ai.spec.ts` siguen en verde.
- `npm run build`, `npm run test:ci`, `npm run e2e`.

## rc.4 · anclar en B, encajar en el hueco y colocar sin IA (motor)
Origen: respuesta real en un formulario bancario de 17 campos. «NIF» y «domicilio» quedaron sin colocar porque en A no tenían etiqueta cerca y la regla obligaba a elegir `anchorA` entre los textos cercanos de A, aunque B sí tenía «NIF:»; hubo anclas débiles («Y DE OTRA…») con `dy` −48 estimado a ojo cuando B tenía «Nombre y apellidos:»; y 8 de 11 colocados tenían una etiqueta idéntica y única en B.

1. **Anclar en B.** Respuesta por campo `{ id, found, page, anchorB, side?, anchorA?, dx?, dy?, absent?, confidence, reason }`; `anchorA` opcional (`validateProposals`). Los prompts (`traslado.md`, `repregunta.md`) piden la etiqueta de B que signifique lo mismo que el campo (`label`, `type`) y el lado del hueco; `dx`/`dy` solo como último recurso.
2. **Encajar en el hueco** (`place.mjs`, `resolveProposal`): check/radio → casilla, resto → línea. Con `side`, el hueco de ese lado de la etiqueta de B; si no, fórmula de A ajustada al hueco a ≤ 15 pt; sin hueco ni `anchorA`, respaldo con confianza ≤ 0,5. x,y se convierte a la convención de la app (inicio de la línea base; «X» centrada en las casillas). Detalle en [`IA-LOCAL.md`](IA-LOCAL.md) («Anclar en B y encajar en el hueco»).
3. **Colocar sin IA** (`text-first.mjs`): etiqueta de A idéntica y única en B (o repetida igual y emparejada por orden de lectura) con hueco en el mismo lado → colocado sin IA (`source: 'text'`, 0,75). Si todos se colocan, 0 peticiones. `AI_HELPER_TEXT_FIRST=0` lo desactiva.
4. **No existe en B:** `absent: true` en la respuesta + campo ya consultado con todas las páginas de B → `why: 'no_existe_en_b'`.

**Contrato con la app:** las filas colocadas añaden `source: 'text' | 'ai'` y `snapped`; las no colocadas pueden traer `why: 'no_existe_en_b'`; `details.notPlaced` lo cuenta, `details.placedWithoutAi` = n.º de colocados sin IA y `details.requests` puede ser 0. El resto (`attempts[]`, `plan`, `onStage('asking', n)`, `cap_reached`, `aborted`) no cambia.

**Medido sin IA** en los 6 casos de `sample-plano/`: 31 de 45 campos colocados por el pase sin IA, todos en la página correcta y a 2 pt de la solución. En el PDF de ejemplo de los e2e coloca 8 de 10 y los otros 2 siguen yendo al proveedor simulado, así que `e2e/ai.spec.ts` no cambia.

**Riesgos:** el pase sin IA confía en el dibujo: si B tiene una raya en el mismo lado que no es la del dato (tablas, separadores) puede colocar mal; por eso queda en la propuesta para revisar y con confianza 0,75. Huecos sin dibujo (solo espacio en blanco, `____` con caracteres) no se detectan: esos campos siguen yendo a la IA.
