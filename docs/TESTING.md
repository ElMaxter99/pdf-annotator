# Pruebas

| Comando | Qué hace |
| --- | --- |
| `npm run test:ci` | Karma/Jasmine headless sin sandbox (unitarias, ~80). |
| `npm run build` | `i18n:check` + `ng build`. Los e2e usan este build. |
| `npm run e2e` | Playwright contra `dist/pdf-annotator/browser` servido por `e2e/static-server.mjs` (127.0.0.1:4300). |

## En un entorno sin Chrome instalado (cloud)
- Chromium está en `/opt/pw-browsers/chromium`. No ejecutes `playwright install`.
- e2e: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run e2e -- --trace off`.
- Unitarias: `CHROME_BIN=/opt/pw-browsers/chromium npm run test:ci` (el launcher `ChromeHeadlessCI` ya usa `--no-sandbox`).

## Qué cubre cada e2e (`e2e/*.spec.ts`)
Un fichero por área: `landing`, `editor`, `history`, `import`, `fonts`, `export`, `selection`, `session` y `sidebar` (incluye móvil). Mira `test(` de cada uno para el detalle.

## Fixtures y helpers
`examples/factura-ejemplo.pdf` y `examples/anotaciones-ejemplo.json` (se regeneran con `node scripts/generate-example.mjs`). `e2e/helpers.ts`: `openWorkspace`, `openSidebarTab` (pestañas `Documento | Anotaciones | Plantillas | Avanzado`) y `stubAnalytics`.

## Reglas
- Antes de cerrar una tarea: build, `test:ci` y e2e en verde. Si tocas editor, historial, importación, fuentes o exportación, ejecuta los e2e antes y después y añade casos.
- Lógica pura (`utils/*.ts`, servicios) con `.spec.ts` al lado.
- Cambios visuales: captura a 1600 y 1280 px (solo escritorio), en oscuro y claro.
