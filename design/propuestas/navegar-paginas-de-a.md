# Navegar las páginas de A en el traslado (1.14)

Mesas P-74 a P-77 en «Propuestas» del lienzo. **Aprobado por Maxter con lo recomendado (incluida la pregunta 1).**

## Problema
En el editor del lote solo se navega por las páginas de B. Con A de 2 páginas y B de 1, la página 2 de A no se puede ver para comparar. Hoy hay un único `pageIndex` común; A se dibuja con `min(pageIndex, páginas de A)` (si B tiene más páginas, A repite su última sin avisar); el aviso «Distinto número de páginas» solo informa; el zoom desenlazado (#246) separa zoom y scroll pero no la página; la rueda al borde pasa página solo en el rango de B; el ajuste por textos, la IA y «Poner plantilla A» solo trabajan las páginas comunes.

## Opciones
1. **Un solo paginador con rango ampliado:** de 1 a máx(A, B); el panel que no tiene esa página muestra «B no tiene la página N». Simple, pero no corrige un desfase (portada nueva en A).
2. **Paginador propio para A («páginas libres»):** chip «Páginas enlazadas / libres» junto al de zoom; en libres cada panel tiene su ‹ n/N ›.
3. **Tabla de correspondencia página a página:** resuelve todo, pero exige diseño, estado en el lote y cambios en «Poner plantilla A». Se deja para más adelante.

## Recomendación
Opción 1 por defecto (enlazadas, como hoy, con rango hasta la última página de A o B) + opción 2 cuando el desfase importe. Mismo patrón y lugar que el chip de zoom.

- **Emparejado con distinto número:** enlazadas → rango máx(A, B) y panel vacío con texto; libres → cada panel su rango. En «Superpuesta»/«Alternar» sin página de A se ve solo B con la etiqueta «A sin página N». Al volver a enlazadas manda B (con «Deshacer» 10 s).
- **Atajos y rueda:** ←/→ y PgUp/PgDn cambian la página común (en libres, la del panel con foco); `Mayús + ←/→` mueve solo A y pasa a libres (con anotaciones seleccionadas, las flechas siguen moviéndolas); la rueda al borde actúa sobre el panel bajo el cursor y su indicador dice «A 2 / 2» o «B 1 / 1».

## Preguntas para Maxter
1. «Poner plantilla A» con páginas libres: copiar la página de A visible a la de B visible, con confirmación (recomendado), o desactivarlo mientras estén libres.
2. Ajuste por textos e IA: siguen emparejando por número de página y avisan si hay desfase (recomendado); usar el desfase sería la opción 3.
3. «Libres» vale para ese PDF hasta reenlazar o cerrar el editor, como el zoom desenlazado.
