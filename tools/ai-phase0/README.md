# Fase 0: ¿acierta la IA al recolocar los campos de A en B?

Herramienta de prueba, **fuera de la app y del build**. Ejecuta `claude -p` y/o `copilot -p` sobre pares A/B y mide el acierto contra una solución conocida. Contexto, datos enviados, límites y términos: [`docs/IA-LOCAL.md`](../../docs/IA-LOCAL.md).

## Requisitos
- Node 22 y `npm install` dentro de esta carpeta.
- Para Claude: `claude` instalado y con la sesión de la suscripción iniciada (`claude` una vez a mano). **Sin** `ANTHROPIC_API_KEY` en el entorno.
- Para Copilot: `copilot` instalado y con sesión iniciada; revisa las banderas (ver `docs/IA-LOCAL.md`).
- En Windows PowerShell funciona igual (`node run.mjs`). El script busca `claude`/`copilot` en el `PATH` y lanza los `.cmd` con `cmd.exe /d /s /c` sin `shell: true`; solo pasa texto fijo. Si el CLI no responde en 300 s corta con un mensaje (cambia el límite con `--timeout <segundos>`). Los avisos de cada ejecución se imprimen en consola con su motivo.

## Uso
```
npm run sample                      # regenera los casos sintéticos en sample/
npm test                            # tests de la lógica pura
node run.mjs --provider claude      # todos los pares de pairs/ y sample/
node run.mjs --provider copilot --pair sample/factura-desplazada
node run.mjs --provider both
```
Opciones: `--timeout <segundos>` (por defecto 300), `--keep-api-key` (no quitar `ANTHROPIC_API_KEY`), `--keep-work` (no borrar la carpeta con las imágenes enviadas). Resultado: `out/summary.md` y, por par y proveedor, `out/<par>/<proveedor>/` con `result.json`, `B-propuesta.json` (importable en la app) y `raw-*.txt`.

## Casos sintéticos (`sample/`, datos inventados)
| Caso | Qué prueba |
| --- | --- |
| `factura-desplazada` | Bloques desplazados en la misma página, etiqueta que cambia de anchura («Base imponible»→«Base») y un campo que pasa a la página 2 |
| `alta-banco-otra-pagina` | Una sección entera pasa de la página 1 a la 2 |
| `contrato-etiquetas-cambian` | Etiquetas reescritas, una etiqueta (y su campo) desaparece y aparece un campo nuevo en B |
| `parte-a4-a-carta` | A4 (595×842) → Carta (612×792) con la maquetación reescalada |
| `solicitud-portada-nueva` | B tiene una página más al principio (todo pasa a la siguiente) y un campo cambia de sitio |
| `pedido-totales-repetidos` | El texto «Total» aparece dos veces y los dos bloques se mueven (anclas ambiguas) |

Cada caso trae `A.pdf`, `A.json`, `B.pdf`, `B.json` (la plantilla correcta de B, de referencia) y `expected.json` (la solución por campo de A: `{ id, page, x, y }` o `{ id, gone: true }`). Los campos nuevos de B no se miden.

## Casos propios
Crea `pairs/<nombre>/` con `A.pdf`, `A.json` (plantilla de A), `B.pdf` y, para medir, `expected.json`. La carpeta `pairs/` **no se sube a git**. El `id` de un campo es `p<página>-f<posición en esa página>` según `A.json`.

## Qué mide
Campos resueltos, página acertada, error mediano en puntos y cuántos quedan a ≤2 pt y ≤5 pt, ausentes bien detectados, segundos y avisos de formato. Cómo funciona: la IA elige un texto ancla en A y su equivalente en B (con página); el código calcula `x,y = ancla B + (campo A − ancla A) + corrección` con las posiciones de pdf.js.
