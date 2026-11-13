# IA en local para migrar plantillas A→B

> Estado: **fase 0 (prueba de calidad)**. Todavía no hay nada en la interfaz de la app. Plan completo: «Plan: remaquetado de coordenadas A→B con IA» (documento del proyecto). Código de la prueba: [`tools/ai-phase0/`](../tools/ai-phase0/README.md).

## Decisiones de producto (no reabrir sin hablar con Maxter)
- **Solo en local y con suscripción.** Nada se despliega con esta función. No hay claves de API ni tokens de pago por uso: se descartan la API de pago de Claude, BYOK y GitHub Models (retirado el 30-jul-2026).
- **La IA es el CLI que ya está instalado y con la sesión iniciada** por la persona que usa la app: `claude -p` (Claude Code) o `copilot -p` (Copilot CLI), según lo que decida el cliente. La app nunca toca credenciales.
- **La IA no escribe coordenadas a ojo.** Devuelve página y texto ancla; las coordenadas las calcula el código con las posiciones de pdf.js. La propuesta se revisa en «Dividida» como cualquier otra.
- **Orden de pruebas:** primero todo el desarrollo con Claude; Copilot está implementado pero sin probar hasta que se vaya a usar en el trabajo.

## Qué se envía a la IA
El script (y la futura función) prepara una carpeta temporal y ejecuta el CLI dentro de ella. El CLI lee estos archivos:

| Archivo | Contenido |
| --- | --- |
| `A-p<N>.png`, `B-p<N>.png` | Cada página de A y de B renderizada como imagen (escala 1,5) |
| `textsA.json`, `textsB.json` | Textos del PDF con página y posición (extraídos con pdf.js) |
| `fields.json` | Los campos de la plantilla A: posición, tipo, `mapField` y los textos cercanos |
| `prompt.md` | Las instrucciones y el formato de respuesta |

- **No se envía el PDF original**, solo las páginas como imágenes y sus textos. Esas imágenes y textos **contienen el contenido del documento** (datos personales, importes…): usar solo PDF que el cliente permita enviar a ese proveedor.
- La línea de comandos solo lleva una frase fija («Lee el archivo prompt.md…»); nunca contenido del PDF.
- La carpeta temporal se borra al terminar (salvo `--keep-work`). En `out/` solo quedan las respuestas del CLI y las coordenadas propuestas; `out/` y `pairs/` no se suben a git.
- Los valores de prueba y las anotaciones de B no se mandan; solo la plantilla A.

## Claude (`claude -p`)
- **Qué usa:** el CLI de Claude Code con el inicio de sesión de la suscripción (Pro/Max), en modo no interactivo, con la herramienta de lectura de archivos permitida (`--allowedTools Read`) y `--output-format json`. Sin `--bare` (con `--bare` no usa el login de suscripción).
- **Clave de API:** si existe `ANTHROPIC_API_KEY` en el entorno, el CLI cobra por API sin avisar. El script la quita del entorno del CLI; `--keep-api-key` la conserva (solo para pruebas internas).
- **Límites:** ventana de 5 horas y límite semanal de la suscripción, compartidos con el uso normal de Claude y Claude Code. Cada llamada del script es una sesión del CLI; el script hace **una llamada por par** (un reintento si la respuesta no es JSON válido). El paso a lote usará una llamada por página de destino.
- **Términos (leer antes de ampliar el uso):** la documentación del [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) indica que Anthropic no permite a terceros ofrecer el login de claude.ai ni sus límites en sus productos. Este uso es local y personal: la app ejecuta el `claude` que cada persona instaló y con el que inició sesión, y no maneja credenciales. Es razonable pero **no es una autorización expresa**: no distribuir la función con credenciales, no usar la sesión de otra persona y cada persona usa su propia suscripción. Ver la documentación de [`claude -p`](https://code.claude.com/docs/en/headless) y la de [Claude Code con planes Pro/Max](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan).
- **Imágenes:** el modelo las abre con la herramienta Read desde la carpeta de trabajo (funciona en la fase 0).

## Prueba de lectura de imágenes
Cada PNG que se deja al CLI lleva un código de 4 caracteres en la esquina inferior derecha y el prompt exige devolverlos en `images`. Si faltan tras dos intentos, el ayudante responde `images_not_read` y no se propone nada: así un modelo que no ve imágenes (posible con Copilot) no coloca campos usando solo los JSON. Cuesta una petición extra solo si el primer intento no los devuelve.

## Copilot (`copilot -p`) — pendiente de probar
- **Qué usa:** el CLI de GitHub Copilot con la sesión de GitHub de la persona (credenciales del llavero del sistema, o `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`/`GITHUB_TOKEN`). La documentación de [planes](https://docs.github.com/en/copilot/get-started/plans) dice que todos incluyen el CLI.
- **Imágenes con `--attachment` (por defecto).** El ayudante añade `--attachment=<A-p1.png>` por cada página (verificado con un PNG en Copilot CLI 1.0.109; con varios, pendiente de confirmar). `COPILOT_ATTACH_IMAGES=0` lo desactiva y deja los PNG solo en la carpeta. La prueba de lectura sigue detectando si Copilot no las ha leído.
- **Consumo real de Copilot.** El ayudante lanza `copilot -p … --output-format json` y lee el JSONL: tokens (entrada, salida, caché) y créditos de IA (`totalNanoAiu / 1e9`, aproximado) del último `session.usage_checkpoint`, y la respuesta del último `assistant.message`. Si tu versión no emite ese JSON, la ventana lo dice y no inventa cifras.
- **Consumo.** Desde junio de 2026 Copilot cobra en «AI credits» según tokens de entrada, salida y caché y el modelo (no por petición premium). `copilot -p` no documenta un resumen de uso, así que la app no mide créditos con Copilot: se mira en GitHub antes y después.
- **Banderas del CLI sin verificar.** El script lanza `copilot -p "<frase fija>" --allow-all-tools` desde la carpeta de trabajo. Si tu versión usa otras, defínelas con la variable `COPILOT_ARGS` (lista JSON; `{{prompt}}` se sustituye por la frase fija), por ejemplo `COPILOT_ARGS='["-p","{{prompt}}","--allow-all-tools"]'`. `--allow-all-tools` da permiso al CLI sobre las herramientas de esa sesión: ejecútalo solo en la carpeta temporal.
- **Imágenes:** la documentación del [SDK](https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input) solo admite imágenes (PNG/JPEG recomendados; no PDF ni SVG) y exige un modelo con visión. **Qué modelos tienen visión no está confirmado**: se comprueba al probarlo (`models.list` del SDK). Si el CLI no lee imágenes por ruta, la alternativa es el Copilot SDK en el ayudante local, siempre con la sesión del CLI y sin BYOK.
- **Límites y cuota:** el consumo cuenta contra la cuota del plan (créditos o premium requests con un multiplicador por modelo; las cifras exactas no se pudieron confirmar y la documentación está cambiando). Con BYOK el proveedor factura aparte, pero BYOK está descartado.
- **Políticas de empresa:** los administradores pueden activar o desactivar superficies de Copilot por organización. El cliente da por permitido el CLI con modelos con visión; **confirmar la política vigente el día que se use** y qué retención de datos aplica a lo enviado (el contenido de las páginas).
- **Compatibilidad:** el CLI y el SDK evolucionan rápido (algunas APIs del SDK son experimentales); el adaptador está aislado en `providers.mjs`.

## Cómo medir (fase 0)
`cd tools/ai-phase0 && npm install && npm run sample && npm test`; después `node run.mjs --provider claude` (Windows PowerShell incluido) y, cuando toque, `--provider copilot` o `both`. Resultados en `out/summary.md`. Detalles y formato de casos en el [README de la herramienta](../tools/ai-phase0/README.md).

## Usarla en la app (lote)
1. Instala y abre sesión una vez en `claude` (o `copilot`) desde una terminal.
2. `npm install` y `npm run start:ia`: arranca la app (`http://localhost:4200`) y el ayudante (`127.0.0.1:4310`). La primera vez instala las dependencias de `tools/ai-phase0` (pdf.js y canvas, solo para el ayudante).
3. En el editor de un PDF del lote con versión B y plantilla A: chip «✦ IA» (debe decir que hay conexión) → «Poner plantilla A ▾» → «Copiar y adaptar con IA».
4. Revisa en «Dividida» y pulsa «Aplicar N cambios» (un solo paso de deshacer). B no cambia hasta entonces.

**Cómo está montado.** El navegador no puede lanzar programas, así que `tools/ai-helper/server.mjs` hace de puente: escucha solo en `127.0.0.1`, atiende solo a los orígenes de la app (`AI_HELPER_ORIGINS`), comprueba `Host` (contra DNS rebinding) y exige un token que reparte solo a esos orígenes. Recibe los PDF y la plantilla A, prepara imágenes y textos en una carpeta temporal (que borra al terminar), lanza el CLI con una instrucción fija (nada del PDF va en la línea de comandos) y devuelve una fila por campo. La respuesta de la IA nunca se evalúa: se valida y la app calcula x,y a partir de los textos. Atiende una petición a la vez; cancelar en la app mata el CLI.

**Modelo.** Sin elegir, Claude usa `sonnet` (`--model`) y Copilot el modelo por defecto del CLI. Se cambian en el panel del chip «✦ IA» (Claude: Haiku, Sonnet u Opus; Copilot: texto libre, vacío = el del CLI) y se recuerdan en este ordenador. Un modelo mayor agota antes el límite de 5 h/semanal de Claude; en Copilot cada petición descuenta «premium requests» según el multiplicador del modelo (confirmar con tu administrador las cifras de Business/Enterprise).

**Variables del ayudante:** `AI_HELPER_PORT`, `AI_HELPER_ORIGINS`, `AI_HELPER_TIMEOUT` (segundos, 300), `AI_HELPER_KEEP_API_KEY=1` (por defecto se quita `ANTHROPIC_API_KEY` para usar la suscripción), `COPILOT_ARGS` (banderas de Copilot sin verificar), `AI_HELPER_FAKE=1` (proveedor simulado para los e2e).

**Seguridad.** El ayudante no entra en Docker ni en el despliegue. La CSP de `nginx.conf` permite `connect-src http://127.0.0.1:4310` solo para que, con el ayudante abierto en tu equipo, la app pueda hablarle; sin él, la opción aparece desactivada y explica cómo arrancarlo.

## Ver detalles y consumo
El botón «Ver detalles» (barra de la IA, en carga, error, sin cambios y revisión) abre un modal con los pasos, lo enviado y el consumo. El ayudante emite líneas `{event}` durante la petición y `result.details` al terminar (`tools/ai-helper/pipeline.mjs`; en el navegador `utils/ai-proposal.utils.ts` las trata como no confiables).
- **Claude** corre con `--output-format stream-json --verbose`: da cada paso (qué archivos lee), tokens reales (entrada, salida, caché) y coste equivalente en API. Con suscripción no se cobra aparte.
- **Copilot** no expone uso en `-p` según su documentación: el modal dice «No medible» y solo enseña peticiones enviadas, tamaño de lo enviado y una **estimación de tokens marcada como tal**. Nunca se muestran cifras inventadas.
- **Diagnóstico de «sin cambios»** (`diagnose` en `pipeline.mjs`): A o B sin texto extraíble, permiso denegado a la CLI, respuesta no válida, anclas inexistentes o la IA no encuentra nada. El informe copiable no lleva contenido de los PDF.
