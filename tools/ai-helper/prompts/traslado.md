<!--
Pasada 1 de «Trasladar con IA»: una petición por cada página de A que tiene campos.
El ayudante rellena los {{marcadores}} y guarda el resultado como prompt.md en la carpeta de la petición.
Los comentarios como este no se envían. Marcadores disponibles:
  paginaA, imagenA, imagenesB, totalA, totalB, tamanoA, tamanoB, tablaPaginas, adjuntas,
  listaImagenes, ejemploImagenes (objeto JSON de ejemplo con un código por imagen), aviso
-->
# Tarea: trasladar campos de un PDF A a un PDF B

Esta petición es solo una parte del trabajo: trae **una página de A** (la {{paginaA}} de {{totalA}}) y las páginas de B donde es más probable que estén sus campos.

## Qué hay en esta carpeta
- {{imagenA}}: la página {{paginaA}} del PDF A (imagen).
- {{imagenesB}}: páginas del PDF B, la versión nueva (imágenes). B tiene {{totalB}} páginas; aquí solo van estas.
- Tamaño de página en puntos PDF (ancho × alto): A {{tamanoA}}, B {{tamanoB}}.
- textsA.json y textsB.json: los textos de esas páginas con su página y posición (x, y en puntos PDF, origen abajo-izquierda; x, y es el inicio del texto en su línea base y "w", si viene, su ancho).
- fields.json: los campos de esa página de A que hay que colocar en B: "label" (nombre del dato), "type" (text, number, check o radio) y "nearby" (los textos más cercanos de A con su desplazamiento dx, dy hasta el campo).
{{tablaPaginas}}

## Qué hacer con cada campo de fields.json
1. **Ancla en B (obligatoria).** Busca en textsB.json la etiqueta de B que corresponde a ese campo y cópiala EXACTA en "anchorB", con su página en "page". Usa el nombre del campo ("label", que es su mapField) y su tipo ("type") para saber qué dato es: vale **cualquier etiqueta de B que signifique lo mismo** («NIF:», «Nombre y apellidos:», «Teléfono»…), aunque en A no hubiera ninguna etiqueta cerca del campo o fuera otra. Prefiere la etiqueta **más concreta y que aparezca una sola vez** (el texto de la opción junto a la casilla, la etiqueta propia del dato), no un enunciado, título o frase larga. Si se repite, el código empareja las apariciones por orden de lectura.
2. **Lado del hueco (`side`).** Di dónde se escribe el valor respecto a esa etiqueta de B, mirando la imagen de B: "right" (a su derecha, en la misma línea), "below" (debajo), "above" (encima, p. ej. una línea de firma con el texto debajo), "left" (a su izquierda). Para casillas (type "check" o "radio"): "box-left" si la casilla está a la izquierda del texto de la opción y "box-right" si está a la derecha. El código busca la línea o la casilla dibujada en ese lado y coloca el campo encima.
3. **Ancla en A (opcional).** Si en "nearby" hay un texto de A que es la misma etiqueta, cópialo EXACTO en "anchorA"; si no lo hay, omítelo. Sirve de respaldo cuando en B no hay una línea o casilla dibujada.
4. **"dx" y "dy" solo como último recurso:** una corrección en puntos PDF cuando no hay hueco dibujado y el desplazamiento de A no vale. Normalmente no los pongas. No calcules coordenadas absolutas.
5. **Si no está en estas páginas de B**, devuelve "found": false con el motivo (se buscará en otras páginas). **Si el dato no existe en B** (ni esa etiqueta ni otra que signifique lo mismo, no solo en estas páginas: B ya no lo pide), devuelve "found": false y "absent": true. No fuerces un ancla que no corresponde.

{{adjuntas}}Trabaja solo con las imágenes y los JSON de esta carpeta: abre cada imagen una sola vez, no uses la terminal ni escribas archivos.

Mira las imágenes de B para confirmar el concepto y el lado del hueco. No inventes textos: "anchorB" (y "anchorA" si lo das) deben existir literalmente en textsB.json (y textsA.json).

## Prueba de lectura de imágenes
Cada imagen lleva, en una franja añadida debajo de la página, un código de 4 caracteres muy grande. Abre TODAS las imágenes de esta petición ({{listaImagenes}}) y copia el código de cada una en "images" (si dudas de un carácter escribe tu mejor lectura; nunca "?"). Sin esos códigos la respuesta se descarta.

## Respuesta
Responde SOLO con un objeto JSON, sin texto antes ni después:
{"images":{{ejemploImagenes}},"fields":[{"id":"p1-f1","found":true,"page":1,"anchorB":"Cliente:","side":"right","anchorA":"Cliente","confidence":0.9,"reason":"una frase"},{"id":"p1-f2","found":false,"absent":true,"confidence":0.8,"reason":"B ya no pide el fax"}]}

"fields" lleva un objeto por campo de fields.json. "confidence" va de 0 a 1.
{{aviso}}
