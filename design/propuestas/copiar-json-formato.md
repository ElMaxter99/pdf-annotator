# Copiar el JSON con otro formato (P-130 a P-132)

Mesas **P-130** (flujo y reglas), **P-131** (pantalla, con prueba interactiva) y **P-132** (estados) en «Propuestas». **Estado: aprobada por Maxter el 2026-11-23 con todo lo recomendado; implementada.** Sin mesa en el lienzo (el diseño se hizo como artefacto privado y su contenido está aquí). Origen: Maxter, que a veces necesita pegar el JSON de las anotaciones en código JS/TS y las claves con comillas dobles le estorban.

## Problema
«Copiar JSON» copiaba tal cual el texto del editor: claves y textos con comillas dobles. Para pegarlo en código había que quitarlas a mano.

## Propuesta (aprobada)
- **Botón dividido** en el panel JSON de Anotaciones: «Copiar JSON» sigue copiando con un clic; la flecha ▾ abre «Formato al copiar».
- **Ajustes:** claves con o sin comillas, comillas de los textos (dobles o simples), sangría (2, 4, tab o compacta) y coma final.
- **Atajos:** «JSON» (por defecto, igual que antes), «Objeto JS/TS» (claves sin comillas, comillas simples, coma final) y «Personalizado» (solo indicador).
- **Vista previa** en vivo y etiqueta «JSON válido» / «No es JSON válido · sirve para JS/TS».
- **Se recuerda** en `localStorage` (`pdf-annotator.jsonCopyFormat`), leído como dato no confiable.

## Reglas
- Solo cambia lo que se copia: el editor y «Descargar JSON» siguen siendo JSON válido.
- Con el formato «JSON» se copia el texto del editor tal cual (comportamiento de siempre). Con otro formato se reescribe a partir del texto leído con `parseLooseJson`; si no se puede leer (a mitad de escribir) se copia el texto tal cual.
- Las claves que no son identificadores (`a-b`, `1x`) siguen entre comillas aunque se pida «sin comillas»; los textos se escapan siempre bien.
- Lo copiado se puede volver a pegar en la app: el importador ya lee claves sin comillas, comillas simples y comas finales.
- Aviso al copiar: «JSON copiado · <formato>» (2 s). Si el navegador bloquea el portapapeles: «No se pudo copiar. Selecciona el texto del editor y pulsa Ctrl+C.» (antes el error se ignoraba).
- Teclado: la flecha es un botón con nombre, los ajustes son grupos de botones con `aria-pressed`, Esc y el clic fuera cierran la ventana. Fundido de 150 ms, sin animación con «reducir movimiento».
- Sin anotaciones, copiar y la flecha están desactivados, como antes.

## Estados
Sin anotaciones · copiado · formato que no es JSON válido · preferencia guardada (valores raros vuelven a «JSON») · teclado y movimiento · oscuro/claro a 1650 y 1280 px.
