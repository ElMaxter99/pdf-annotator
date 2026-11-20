# Pruebas

| Comando | Qué hace |
| --- | --- |
| `npm run test:ci` | Karma/Jasmine headless sin sandbox (unitarias, ~80). |
| `npm run build` | `i18n:check` + `ng build`. Los e2e usan este build. |
| `npm run e2e` | Playwright contra `dist/pdf-annotator/browser` servido por `e2e/static-server.mjs` (127.0.0.1:4300). |
| `npm run a11y` | Auditoría axe (`scripts/a11y-audit.mjs`, fuera del CI): landing, editor, lote y Proyectos en oscuro/claro y 1650/1280 px; escribe `a11y-audit.json`. Informe en `docs/AUDITORIA-A11Y.md`. Necesita `npm run build` antes. |

## En un entorno sin Chrome instalado (cloud)
- Chromium está en `/opt/pw-browsers/chromium`. No ejecutes `playwright install`.
- e2e: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run e2e -- --trace off`.
- Unitarias: `CHROME_BIN=/opt/pw-browsers/chromium npm run test:ci` (el launcher `ChromeHeadlessCI` ya usa `--no-sandbox`).

## Docker (`npm run start:docker`)
Imagen NGINX sin privilegios (`Dockerfile`: etapa `build` con Node 26 y etapa `runner` con `nginxinc/nginx-unprivileged`), servida en `http://localhost:4444` (`docker-compose.yml`: `4444:8080`; `scripts/docker-up.sh`).

**Verificado en la nube (2026-11-19, daemon `dockerd` arrancado a mano):** la etapa `runner` tal cual (misma imagen base, `sed` de `mime.types`, `nginx.conf`, `USER nginx`) con el `dist` compilado en el host, y `docker compose up` sobre ella. Resultado: puerto publicado `0.0.0.0:4444->8080`; el proceso corre como `uid=101(nginx)`; `/`, `/landing`, `/workspace`, `/lote` y `/proyectos` devuelven la SPA; `.mjs` sale como `application/javascript` y con gzip; cabeceras de seguridad y CSP presentes también en 404; en Chromium, subir `examples/factura-ejemplo.pdf` abre `/workspace`, carga `pdf.worker.min.mjs` (200) y pinta el PDF sin violaciones de CSP.

**No verificado en la nube:** la etapa `build` del `Dockerfile` (`apk add` y `npm install` dentro del contenedor: los contenedores de build no tienen salida a internet en ese entorno) ni `scripts/docker-up.sh` de extremo a extremo (usa `--build`). Eso es lo que cubre el guion siguiente.

**Guion para Maxter (≈5 min, en tu máquina con Docker Desktop abierto):**
1. `npm run start:docker`: debe construir sin errores y acabar con «Stack levantado correctamente». Si el daemon no está, el script lo dice.
2. `docker compose ps`: el servicio `pdf-annotator` en `Up` y `0.0.0.0:4444->8080/tcp`.
3. Abre `http://localhost:4444/landing`, sube `examples/factura-ejemplo.pdf`: debe abrir `/workspace` y pintar la factura (esto prueba el worker de pdf.js y el MIME de `.mjs`).
4. Con una anotación creada, recarga `/workspace` (F5): debe recuperarse la sesión. Sin anotaciones, volver a `/landing` es lo previsto (`workspaceGuard`). Prueba también `/lote` y `/proyectos` pegados en la barra de direcciones: deben cargar la app, no un 404 de nginx.
5. `curl -I http://localhost:4444/assets/pdfjs/pdf.worker.min.mjs`: `Content-Type: application/javascript` y las cabeceras `Content-Security-Policy`, `X-Content-Type-Options: nosniff` y `X-Frame-Options: DENY`. `curl -I http://localhost:4444/no-existe.js` debe dar `404`.
6. `scripts/docker-down.sh` (o `docker compose down`): el puerto 4444 queda libre.

Ruido conocido en la consola de la imagen: `/_vercel/insights/script.js` y `/_vercel/speed-insights/script.js` dan 404 (solo existen en Vercel; los inyecta `src/main.ts`) y el ayudante de IA (`127.0.0.1:4310`) no responde. No son fallos de la imagen.

## Qué cubre cada e2e (`e2e/*.spec.ts`)
Un fichero por área: `landing`, `editor`, `history`, `import`, `fonts`, `export`, `selection`, `session` y `sidebar` (incluye móvil). Mira `test(` de cada uno para el detalle.

## Fixtures y helpers
`examples/factura-ejemplo.pdf` y `examples/anotaciones-ejemplo.json` (se regeneran con `node scripts/generate-example.mjs`). `e2e/helpers.ts`: `openWorkspace`, `openSidebarTab` (pestañas `Documento | Anotaciones | Plantillas | Avanzado`) y `stubAnalytics`.

## Reglas
- Antes de cerrar una tarea: build, `test:ci` y e2e en verde. Si tocas editor, historial, importación, fuentes o exportación, ejecuta los e2e antes y después y añade casos.
- Lógica pura (`utils/*.ts`, servicios) con `.spec.ts` al lado.
- Cambios visuales: captura a 1600 y 1280 px (solo escritorio), en oscuro y claro.
