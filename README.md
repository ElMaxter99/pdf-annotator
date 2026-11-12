<p align="center">
  <img src="./public/logo.svg" alt="PDF Annotator logo" width="120" />
</p>

<h1 align="center">PDF Annotator</h1>

<p align="center">
  <strong>Marca cualquier PDF, obtén las coordenadas exactas en JSON y exporta el documento anotado.</strong><br />
  100 % en tu navegador · sin subir archivos · 7 idiomas · tema claro y oscuro
</p>

<p align="center">
  <a href="CHANGELOG.md"><img src="https://img.shields.io/badge/version-1.7.1-4dd9c0?style=for-the-badge" alt="Versión 1.7.1" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge" alt="Licencia MIT" /></a>
  <img src="https://img.shields.io/badge/Angular-20-dd0031?style=for-the-badge&logo=angular&logoColor=white" alt="Angular 20" />
  <img src="https://img.shields.io/badge/Node-22.12-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node 22" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/i18n-ES%20·%20EN%20·%20CA%20·%20FR%20·%20IT%20·%20PT%20·%20DE-ff9f43" alt="Idiomas" />
  <a href="https://github.com/ElMaxter99/pdf-annotator/stargazers"><img src="https://img.shields.io/github/stars/ElMaxter99/pdf-annotator?style=flat&logo=github" alt="Stars" /></a>
</p>

<p align="center">
  <a href="#%EF%B8%8F-descargar-la-app-de-escritorio">Descargar</a> ·
  <a href="#-qué-es">Qué es</a> ·
  <a href="#-empieza-en-1-minuto">Empieza</a> ·
  <a href="#-tour-de-la-interfaz">Tour</a> ·
  <a href="#-flujos-de-trabajo">Flujos</a> ·
  <a href="#-adaptar-con-ia">Adaptar con IA</a> ·
  <a href="#%EF%B8%8F-atajos-de-teclado">Atajos</a> ·
  <a href="#-formato-json">JSON</a> ·
  <a href="#-despliegue">Despliegue</a> ·
  <a href="AGENTS.md">Para agentes</a>
</p>

<p align="center">
  <img src="./screenshots/workspace.png" alt="Espacio de trabajo de PDF Annotator" width="95%" />
</p>

---

## ⬇️ Descargar la app de escritorio
<p align="center">
  <a href="https://github.com/ElMaxter99/pdf-annotator/releases/latest"><img src="https://img.shields.io/github/v/release/ElMaxter99/pdf-annotator?style=for-the-badge&label=%C3%BAltima%20release&color=4dd9c0" alt="Última release" /></a>
</p>

Instálala como app del sistema y la **IA local funciona sin abrir ninguna terminal**. Los enlaces apuntan siempre a la **última release**; no hay que editar nada aquí al publicar una nueva.

| Sistema | Descarga (en «Assets» de la última release) | Se actualiza |
| --- | --- | --- |
| 🪟 **Windows** | [**Descargar `.exe`**](https://github.com/ElMaxter99/pdf-annotator/releases/latest) | Sola, con aviso |
| 🍎 **macOS** | [**Descargar `.dmg`**](https://github.com/ElMaxter99/pdf-annotator/releases/latest) (`arm64` para Apple Silicon, `x64` para Intel) | El aviso abre la descarga |
| 🐧 **Linux** | [**Descargar `.AppImage`, `.deb` o `.rpm`**](https://github.com/ElMaxter99/pdf-annotator/releases/latest) | AppImage sola; `.deb`/`.rpm` con descarga manual |

> Mientras no haya una release con instaladores publicada, esa página no los tendrá todavía. La app sigue funcionando en el navegador. Detalles, avisos del sistema (instaladores sin firmar) y desarrollo: [App de escritorio](#%EF%B8%8F-app-de-escritorio-windows-macos-y-linux).

---

## 🎯 Qué es
PDF Annotator es un editor visual de **coordenadas sobre PDFs**. Haces clic donde quieres un dato, le das un nombre (`{{cliente.nombre}}`) y la app te devuelve su posición exacta en **puntos PDF**, lista para que tu backend rellene el documento (facturas, contratos, formularios, certificados…). También puede **estampar** los textos en el propio PDF.

**¿Para quién?**
- Desarrolladores que generan PDFs desde plantillas y necesitan saber *dónde* escribir cada campo.
- Equipos de QA/operaciones que quieren rellenar o revisar formularios sin editores pesados.
- Cualquiera que necesite marcar texto, checks o importes sobre un PDF sin tocar el original.

## ✨ Qué puedes hacer
| | |
| --- | --- |
| 🎯 **Colocar** | Clic sobre el PDF para crear textos, *checks*, *radios* o números con formato (decimales y sufijo, p. ej. `1250.50 €`). |
| 🖱️ **Mover y editar** | Selecciona varias con `Shift`+clic y muévelas, selecciónalas también con un recuadro, alinéalas (izquierda, centro, derecha, arriba, medio, abajo) o distribúyelas con huecos iguales, duplícalas o bórralas de una vez. Arrastra anotaciones, edita fuente, tamaño, color (selector/HEX/RGB), opacidad y fondo. Bloquea u oculta las que no quieres tocar o exportar. |
| 📐 **Ser preciso** | Rejilla, reglas, guías de alineación e *imán* a rejilla, márgenes, centros o puntos propios. Coordenadas PDF o de canvas. |
| 🧾 **JSON en vivo** | Editor de texto y vista de árbol sincronizados. Pega, importa, copia o descarga. |
| 🧩 **Plantillas** | Guarda conjuntos de anotaciones y recárgalos en otros documentos. |
| ⬇️ **Exportar** | JSON (`coords.json`) o PDF anotado (`annotated.pdf`) con fuentes estándar o propias (`.ttf/.otf/.woff/.woff2`). |
| ⌨️ **Ir rápido** | Atajos para páginas, zoom, ajuste al ancho, deshacer/rehacer y más. Pulsa `?` para verlos. |
| 🌍 **A tu manera** | Español, inglés, catalán, francés, italiano, portugués y alemán; tema claro/oscuro; pensada para escritorio. |
| 🔒 **Privado** | El PDF no sale de tu navegador. No hay servidor de procesado ni cuentas. |

## 🚀 Empieza en 1 minuto
```bash
git clone https://github.com/ElMaxter99/pdf-annotator.git
cd pdf-annotator
npm install
npm run start:local      # → http://localhost:4200
npm run start:ia         # igual + ayudante de IA local (Claude/Copilot con tu suscripción; ver docs/IA-LOCAL.md)
```
Requisitos: **Node 22.12** y un navegador moderno. ¿Prefieres contenedor? `npm run start:docker` → <http://localhost:4444>.

> 💡 **Pruébalo ya con los ejemplos incluidos:** carga [`examples/factura-ejemplo.pdf`](examples/factura-ejemplo.pdf) y luego **Importar desde archivo** → [`examples/anotaciones-ejemplo.json`](examples/anotaciones-ejemplo.json).

## 🧭 Tour de la interfaz
### 1 · Pantalla de bienvenida
Arrastra un PDF o haz clic para seleccionarlo. El idioma se cambia arriba a la derecha.

<p align="center"><img src="./screenshots/main.png" alt="Pantalla de bienvenida" width="85%" /></p>

### 2 · Espacio de trabajo
<p align="center"><img src="./screenshots/workspace.png" alt="Espacio de trabajo" width="95%" /></p>

| Zona | Qué hay |
| --- | --- |
| **Cabecera** (una fila) | Página anterior/siguiente · zoom `−`/`+`/**Ajustar** · deshacer/rehacer/limpiar · **Descargar PDF** · **Atajos** · tema · idioma. |
| **Panel lateral** (4 pestañas) | Cursor en coordenadas PDF siempre visible, y debajo: **Documento** (cambiar de PDF, miniaturas) · **Anotaciones** (editor JSON en texto o árbol, importar/aplicar, copiar, descargar; con contador) · **Plantillas** · **Avanzado** (fuentes, guías, campos extra del JSON, valores de muestra y datos de prueba). Se navega con ratón o flechas ←/→. Se minimiza con `B`. |
| **Visor** | Página con capa de anotaciones. Clic para crear, clic sobre una anotación para editarla, arrastrar para moverla. Scroll propio. |
| **Pie** | Recordatorio de `?` y versión. |

### 3 · Edita cada anotación
Texto (`mapField`), tipo, bloqueo/ocultar, valor fijo, decimales y sufijo (números), tamaño, opacidad, fuente (buscador), fondo y color. Los botones permiten **duplicar** ⧉, **borrar** 🗑️, confirmar ✅ o cancelar ❌.

<p align="center"><img src="./screenshots/example_use.png" alt="Editor de anotación" width="90%" /></p>

### 4 · Guías y precisión
En **Opciones avanzadas → Activar guías y snapping** aparecen rejilla, reglas en puntos PDF y líneas de alineación.

<p align="center"><img src="./screenshots/guides.png" alt="Guías, reglas y rejilla" width="90%" /></p>

### 5 · JSON en modo árbol
Alterna entre editor de texto y árbol; al seleccionar una anotación en el visor, el editor JSON enfoca su bloque.

<p align="center"><img src="./screenshots/json-tree.png" alt="JSON en árbol" width="90%" /></p>

### 6 · Atajos, tema claro y móvil
<p align="center">
  <img src="./screenshots/shortcuts.png" alt="Diálogo de atajos" width="48%" />
  <img src="./screenshots/light.png" alt="Tema claro" width="48%" />
</p>
<p align="center"><img src="./screenshots/mobile.png" alt="Vista móvil" width="26%" /></p>

## 🔄 Flujos de trabajo
### A · Mapear una factura para tu backend
1. Carga `factura-ejemplo.pdf` (o tu plantilla).
2. Pulsa **`0`** para ajustar al ancho. Haz clic junto a *Cliente*, escribe `{{cliente.nombre}}`, `Enter`.
3. Repite para NIF, fecha, importes. Para importes elige tipo **Número**, 2 decimales y sufijo ` €`.
4. Activa **guías** para alinear campos a la misma línea base.
5. **Descargar JSON** → entrega `coords.json` a tu servicio de generación.

```json
{ "pages": [ { "num": 1, "fields": [
  { "x": 150, "y": 722, "mapField": "{{cliente.nombre}}", "fontSize": 12, "type": "text" },
  { "x": 160, "y": 402, "mapField": "1513.11", "fontSize": 14, "type": "number" }
] } ] }
```

### B · Rellenar un PDF y descargarlo
1. Carga el PDF → crea anotaciones con el **texto final** en *Valor fijo* (o cambia la vista a **Mapeo**; en **Muestra** se pinta `XXXXX`).
2. Marca *checks* para casillas (se pintan como `X`).
3. **Descargar PDF** → `annotated.pdf` con las marcas estampadas. El original no se modifica.

### C · Reutilizar con plantillas
1. Con tus anotaciones hechas, escribe un nombre en **Plantillas reutilizables** → **Guardar plantilla**.
2. En otro PDF similar: selecciona la plantilla → **Cargar**.
3. Ajusta posiciones arrastrando y exporta. (Las plantillas viven en el `localStorage` de tu navegador.)

### D · Editar a mano o desde código
1. Abre el editor JSON, pega coordenadas (acepta JSON "flexible": comillas simples, claves sin comillas, comentarios y comas finales).
2. Se aplican solas tras una pausa, o con **Aplicar JSON** / `Ctrl/⌘ + S`.
3. Usa **Importar desde archivo** para cargar un `.json` completo (máx. 5 MB).

### E · Revisión de un PDF largo
Miniaturas para saltar de página, `←/→` para navegar, `+/−` para zoom, **Deshacer** (`Ctrl/⌘+Z`) ante cualquier error y **Limpiar** para empezar de cero.

## 🤖 Adaptar con IA
Cuando llega una **versión nueva (B)** de un PDF del que ya tienes la plantilla (A), «Copiar y adaptar con IA» recoloca los campos de A en B aunque el texto cambie de redacción, un campo se mueva o pase a **otra página**. Usa **tu propio `claude` o `copilot`** con tu suscripción: sin claves de API, sin tokens de pago y **solo en local** (no existe en el despliegue ni en Docker).

### Cómo funciona
1. Un navegador no puede abrir programas, así que `npm run start:ia` arranca la app **y** un ayudante pequeño (`tools/ai-helper`, `127.0.0.1:4310`). Solo atiende a tu app, en tu equipo, con un token de cada arranque.
2. En el editor de un PDF del lote que tenga versión B y plantilla A, el chip **«✦ IA»** (junto a la campana) dice si hay conexión. Su panel deja elegir proveedor y modelo.
3. **«Poner plantilla A ▾» → «Copiar y adaptar con IA»**. La primera vez avisa de lo que se envía.
4. El ayudante prepara las páginas de A y B (imágenes y textos) y se las pasa a tu CLI. La IA elige, por campo, a qué página va y **junto a qué texto** (el ancla). **La app calcula `x`,`y`** a partir de las posiciones reales de esos textos: la IA nunca da coordenadas.
5. Se revisa en «Dividida»: motivo y confianza por campo, campos que cambian de página y los que no se encontraron. **B no cambia hasta «Aplicar N cambios»** (un solo paso de deshacer). Los de confianza baja o sin colocar solo se aplican si los marcas.
6. Si falla (límite, tiempo, respuesta rara, ayudante cerrado), la franja ofrece reintentar, cambiar de proveedor o **«Usar ajuste por textos»**, que no necesita IA.

### Proveedores válidos
| Proveedor | Programa | Estado | Notas |
| --- | --- | --- | --- |
| **Claude** | [Claude Code](https://docs.claude.com/en/docs/claude-code) (`claude`) con sesión iniciada | Probado (`claude -p`) | Modelo por defecto `sonnet` (económico). Se puede elegir `haiku`, `sonnet` u `opus`. Se quita `ANTHROPIC_API_KEY` del entorno para usar la suscripción |
| **Copilot** | [GitHub Copilot CLI](https://docs.github.com/en/copilot) (`copilot`) con sesión iniciada | Implementado, **sin verificar** contra tu versión | Modelo vacío = el del CLI. Si las banderas no valen, `COPILOT_ARGS` las ajusta. Necesita un modelo con visión |
| Simulado | — | Solo para tests (`AI_HELPER_FAKE=1`) | Lo usan los e2e; no hace falta |

No hay otros proveedores: la app no llama a ninguna API de pago ni a servicios externos.

### Puesta en marcha
```bash
# una vez: instala el CLI y abre sesión (escribe `claude` o `copilot` y entra)
npm install
npm run start:ia        # app en http://localhost:4200 + ayudante en 127.0.0.1:4310
```
En PowerShell es igual. La primera vez instala las dependencias del ayudante (`tools/ai-phase0`). Deja esa terminal abierta mientras uses la IA; sin el ayudante la app funciona igual y el chip dice «sin conectar» con las instrucciones.

### Modelo, coste y límites
- Se elige en el panel del chip (Claude: desplegable; Copilot: texto libre) y se recuerda en este ordenador.
- **Claude**: no hay cobro por token, pero cuenta contra el límite de 5 horas y el semanal de tu plan; un modelo grande lo agota antes. Al llegar al límite la app lo dice con la hora de renovación y ofrece cambiar a Copilot.
- **Copilot**: cada petición descuenta de tus «premium requests» según el multiplicador del modelo; pasada la cuota puede haber coste extra según tu plan.
- Una petición tarda unos 15-40 s por PDF y se puede cancelar.

### Privacidad y seguridad
- Se envía a tu CLI (que lo procesa según las condiciones de tu proveedor): las páginas de A y B como imágenes, sus textos y los campos de la plantilla A (nombre y posición). **No se envían los PDF originales ni los valores de prueba.** Usa solo PDF que puedas enviar.
- El ayudante solo escucha en `127.0.0.1`, comprueba `Host` y origen, exige token y trabaja en una carpeta temporal que borra al terminar. Nada del PDF va en la línea de comandos y la respuesta de la IA se valida y **nunca se evalúa**.
- Variables: `AI_HELPER_PORT`, `AI_HELPER_ORIGINS`, `AI_HELPER_TIMEOUT` (s, 300), `AI_HELPER_KEEP_API_KEY=1`, `COPILOT_ARGS`.

### Problemas frecuentes
| Síntoma | Qué hacer |
| --- | --- |
| Chip «sin conectar» | Arranca con `npm run start:ia` y deja la terminal abierta; pulsa «Volver a comprobar» |
| Chip «no encontrada» | `claude` o `copilot` no está en el PATH: instálalo y abre sesión una vez |
| «Límite de la suscripción» | Espera a la hora indicada o cambia de proveedor |
| Respuesta que no se entiende | Reintenta; si se repite, usa «Usar ajuste por textos» |

Detalle técnico y pruebas de calidad: [`docs/IA-LOCAL.md`](docs/IA-LOCAL.md) y [`tools/ai-phase0/README.md`](tools/ai-phase0/README.md).

## 🖥️ App de escritorio (Windows, macOS y Linux)
Con la app instalada la IA local funciona sin abrir ninguna terminal: arranca sola el ayudante (sigues necesitando `claude` o `copilot` instalado y con sesión iniciada). Descarga el instalador de tu sistema desde la [última release](https://github.com/ElMaxter99/pdf-annotator/releases/latest) (arriba, en «Descargar»).

| | |
| --- | --- |
| **Formatos** | `.exe` (Windows, NSIS), `.dmg`/`.zip` (macOS `arm64` y `x64`), `.AppImage`, `.deb`, `.rpm` (Linux `x64`) |
| **Versión** | La de `package.json`; la etiqueta `vX.Y.Z` de la release debe coincidir |
| **Publicación** | Automática: empujar la etiqueta `vX.Y.Z` compila los tres sistemas y crea una release en **borrador**; al publicarla, los enlaces de «Descargar» y el aviso de las apps instaladas apuntan a ella |
| **Todas las versiones** | [Releases](https://github.com/ElMaxter99/pdf-annotator/releases) |

- **Sin firmar:** Windows muestra SmartScreen («Más información → Ejecutar de todas formas») y macOS pide abrirla con clic derecho → Abrir (si dice «dañada», `xattr -cr "/Applications/PDF Annotator.app"`).
- **Actualizaciones:** al abrir y cada 6 h comprueba si hay una versión nueva y muestra un aviso con «Actualizar ahora» / «Más tarde». Windows y AppImage se actualizan solos; en macOS y con `.deb`/`.rpm` el botón abre la página de descargas.
- **Desarrollo:** `npm run start:desktop` (abre la app con el build) y `npm run desktop:pack` (instalador de tu sistema en `release/`). Versiones: se publican al empujar una etiqueta `vX.Y.Z` (`desktop-release.yml`, release en borrador).

## ⌨️ Atajos de teclado
Pulsa **`?`** (o el botón **Atajos**) para verlos en la app.

| Atajo | Acción |
| --- | --- |
| `←` / `→` · `PgUp` / `PgDn` | Página anterior / siguiente |
| `Home` / `End` | Primera / última página |
| `+` / `−` | Acercar / alejar |
| `0` | Ajustar el PDF al ancho disponible |
| `B` | Mostrar u ocultar la barra lateral |
| `Enter` | Confirmar la anotación en curso |
| `Esc` | Cancelar la tarjeta activa / cerrar la ayuda |
| `Ctrl/⌘ + Z` · `Ctrl/⌘ + Y` | Deshacer / rehacer |
| `Ctrl/⌘ + S` | Aplicar el JSON del editor |
| `Shift + clic` | Añadir o quitar una anotación de la selección |
| Arrastrar en una zona vacía | Seleccionar con un recuadro (con `Shift`, suma a la selección) |
| `Ctrl/⌘ + A` | Seleccionar todas las anotaciones de la página (las bloqueadas no) |
| `←` `↑` `→` `↓` | Mover la selección 1 pt (`Shift`: 10 pt) |
| `Supr` | Eliminar la selección |
| `Ctrl/⌘ + C` · `V` · `D` | Copiar, pegar o duplicar la selección |
| `Esc` | Quitar la selección |

Los atajos de una sola tecla se ignoran mientras escribes en un campo.

## 🧾 Formato JSON
```json
{
  "pages": [
    {
      "num": 1,
      "fields": [
        { "x": 120.5, "y": 450.25, "mapField": "Firma", "fontSize": 14, "type": "text" }
      ]
    }
  ]
}
```
| Campo | Descripción |
| --- | --- |
| `x`, `y` | Puntos PDF. Origen en la **esquina inferior izquierda**. |
| `mapField` | Texto (o clave) que se pinta/mapea. |
| `fontSize` | Puntos (por defecto 14). |
| `type` | `text` · `check` · `radio` · `number`. |
| *avanzados* (opcional) | `color` (`#RRGGBB`), `fontFamily`, `opacity` (0.1–1), `backgroundColor`, `value`, `decimals`, `appender`, `locked`, `hidden`. Actívalos con **Incluir propiedades avanzadas en el JSON**. |

Se acepta también un array directo de páginas. Detalle del modelo en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## 🧰 Stack
| Frontend | PDF | Calidad |
| --- | --- | --- |
| Angular 20 · signals · standalone · SCSS | `pdfjs-dist` (render) · `pdf-lib` + `fontkit` (export) | Karma/Jasmine · i18n check · Prettier |

## 🐳 Despliegue
```bash
npm run build                 # genera dist/pdf-annotator/browser
npm run start:docker          # NGINX en http://localhost:4444
sh scripts/docker-down.sh     # detener
```
`nginx.conf` incluye cabeceras de seguridad (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). Si añades scripts de terceros (p. ej. analíticas), amplía la CSP.

## 🔐 Seguridad y privacidad
- El PDF y las anotaciones **no se envían a ningún servidor**. Se guardan solo en tu navegador: plantillas, idioma y tema (`localStorage`) y la **última sesión** (PDF + anotaciones, `IndexedDB`) para retomarla desde la portada; puedes descartarla con un clic.
- El JSON pegado se interpreta con un parser propio **sin evaluar código**.
- Límites de importación: JSON ≤ 5 MB; solo PDFs y fuentes `.ttf/.otf/.woff/.woff2`.

## 🛠️ Desarrollo
| Comando | Descripción |
| --- | --- |
| `npm run start:local` | Servidor de desarrollo (4200) |
| `npm run build` | Comprueba traducciones y compila |
| `npm test` | Pruebas unitarias (Karma/Jasmine) |
| `npm run test:ci` | Igual, headless y sin sandbox (como en CI) |
| `npm run e2e` | Pruebas end-to-end con Playwright sobre el build de producción |
| `npm run i18n:check` | Claves de los 7 idiomas coherentes |
| `node scripts/generate-example.mjs` | Regenera el PDF de ejemplo |

Estructura, convenciones y trampas conocidas: [`AGENTS.md`](AGENTS.md) (para personas y agentes de IA) y [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Hoja de ruta: [`docs/ROADMAP.md`](docs/ROADMAP.md). Cómo contribuir: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 🧯 Solución de problemas
| Síntoma | Qué hacer |
| --- | --- |
| El PDF no se ve | Comprueba que no esté protegido/corrupto y mira la consola del navegador. |
| Error al importar JSON | Revisa que tenga `pages[].fields[]` con `x`/`y` numéricos y que pese < 5 MB. |
| No puedo mover una anotación | Puede estar **bloqueada**; desbloquéala en su editor. |
| El PDF exportado no abre | Prueba con otra copia del original; la app intenta tres variantes (original, canónica y saneada). |
| Los atajos no responden | El foco está en un campo de texto o botón; haz clic en el visor y vuelve a probar. |
| `ng serve` no encuentra el builder | Ejecuta `npm install` antes de `npm run start:local`. |

## 🗺️ Roadmap
Pestañas en el panel lateral, selección múltiple y alineación, validación por esquema de cada campo y refactor del componente principal. Detalle en [`docs/ROADMAP.md`](docs/ROADMAP.md).

## 🤝 Contribuir
Issues y PRs son bienvenidos: usa las plantillas de [`.github/`](.github) y revisa [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 📝 Licencia
Proyecto público bajo licencia [MIT](LICENSE) © 2025 AlvaroMaxter ([ElMaxter99](https://github.com/ElMaxter99)). Puedes usarlo, modificarlo y redistribuirlo mencionando al autor y enlazando a <https://github.com/ElMaxter99/pdf-annotator>.

<p align="center"><sub>Hecho con ❤️ y Angular · <a href="#pdf-annotator">⬆ Volver arriba</a></sub></p>
