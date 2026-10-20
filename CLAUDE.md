@AGENTS.md

# Notas específicas para Claude Code

- Lee `AGENTS.md` (importado arriba) y `docs/ARCHITECTURE.md` antes de tocar `workspace.page.ts`: es un archivo enorme, busca con `Grep` el método concreto en vez de leerlo entero.
- Para verificar cambios visuales: `npm run build`, sirve `dist/pdf-annotator/browser` (fallback SPA a `index.csr.html`/`index.html`) y usa Playwright con `/opt/pw-browsers/chromium` (no ejecutes `playwright install`). Sube a `/landing`, carga `examples/factura-ejemplo.pdf` y comprueba 1600 px, 1280 px y 430 px.
- Tests en entornos sin sandbox: `CHROME_BIN=<chromium> ng test --watch=false` con un launcher `ChromeHeadless --no-sandbox`.
- Responde en español salvo que el usuario escriba en otro idioma; el código y los commits siguen el idioma ya usado en `git log`.
- No crees PRs ni hagas push a ramas distintas de la asignada sin que se pida.
- Si cambias texto visible, ejecuta `npm run i18n:check`; si cambias estilos, comprueba el tema claro (`:root.theme-light`).
