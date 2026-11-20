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
- textsA.json y textsB.json: los textos de esas páginas con su página y posición (x, y en puntos PDF, origen abajo-izquierda; x, y es el inicio del texto en su línea base).
- fields.json: los campos de esa página de A que hay que colocar en B. Cada campo trae "nearby": los textos más cercanos de A con su desplazamiento (dx, dy) hasta el campo.
{{tablaPaginas}}

## Qué hacer con cada campo de fields.json
1. Elige en "nearby" el texto de A que mejor sirve de ancla (normalmente la etiqueta junto a la que se escribe el valor). Cópialo EXACTO en "anchorA".
   Prefiere como ancla el texto **más concreto y que aparezca una sola vez** (por ejemplo, el texto de la opción junto a la casilla, o la etiqueta propia del bloque), no un enunciado, título o pregunta que se repite. Si aun así el texto se repite, el código empareja las apariciones por orden de lectura (la 1.ª de A con la 1.ª de B, y así).
2. Busca ese mismo texto, o el equivalente si cambió de redacción, en B y cópialo EXACTO de textsB.json en "anchorB", junto con su página en "page". El texto puede haberse movido a otra de las páginas de B que tienes aquí.
3. La app calculará la posición final: ancla B + desplazamiento que tenía el campo en A. Si en B el campo ya no está en la misma posición relativa respecto a su etiqueta (se ve en las imágenes), estima la corrección en puntos PDF en "dx" y "dy" (si no cambió, 0 y 0). No calcules coordenadas absolutas.
4. Si el campo no está en estas páginas de B, o no hay forma razonable de colocarlo (por ejemplo, la etiqueta ya no existe), devuelve "found": false con el motivo. No fuerces un ancla distinta: si hace falta, se buscará en otras páginas de B.

{{adjuntas}}Trabaja solo con las imágenes y los JSON de esta carpeta: abre cada imagen una sola vez, no uses la terminal ni escribas archivos.

Mira las imágenes de A y B para confirmar que el ancla es el mismo concepto. No inventes textos: "anchorA" y "anchorB" deben existir literalmente en textsA.json y textsB.json.

## Prueba de lectura de imágenes
Cada imagen lleva, en una franja añadida debajo de la página, un código de 4 caracteres muy grande. Abre TODAS las imágenes de esta petición ({{listaImagenes}}) y copia el código de cada una en "images" (si dudas de un carácter escribe tu mejor lectura; nunca "?"). Sin esos códigos la respuesta se descarta.

## Respuesta
Responde SOLO con un objeto JSON, sin texto antes ni después:
{"images":{{ejemploImagenes}},"fields":[{"id":"p1-f1","found":true,"page":1,"anchorA":"Cliente","anchorB":"Cliente","dx":0,"dy":0,"confidence":0.9,"reason":"una frase"}]}

"fields" lleva un objeto por campo de fields.json. "confidence" va de 0 a 1.
{{aviso}}
