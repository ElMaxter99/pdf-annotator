@AGENTS.md

# Notas específicas para Claude Code

- Contexto: `docs/PRODUCT.md` (para qué y para quién), `docs/DOMAIN.md` (glosario y formato JSON), `docs/DECISIONS.md` (no reabras lo ya decidido) y `docs/ROADMAP.md` (qué toca ahora).
- Cambios visibles: sigue «Diseño primero» (`docs/WORKFLOW.md`, `design/README.md`). Sin diseño aprobado no programes la interfaz; en fase de plan, entrega el plan y espera aprobación.
- Lee `AGENTS.md` (importado arriba) y `docs/ARCHITECTURE.md` antes de tocar `workspace.page.ts`: es un archivo enorme, busca con `Grep` el método concreto en vez de leerlo entero.
- **Publicar versión (RC o final):** lee `docs/RELEASING.md` (Parte B = tu checklist) antes de empezar. Solo se publica (RC, final o Vercel) cuando Maxter lo pide expresamente para esa versión.
- Para verificar cambios visuales: `npm run build`, sirve `dist/pdf-annotator/browser` (fallback SPA a `index.csr.html`/`index.html`) y usa Playwright con `/opt/pw-browsers/chromium` (no ejecutes `playwright install`). Sube a `/landing`, carga `examples/factura-ejemplo.pdf` y comprueba 1600 px y 1280 px (solo escritorio).
- Tests en entornos sin sandbox: `CHROME_BIN=<chromium> ng test --watch=false` con un launcher `ChromeHeadless --no-sandbox`.
- Responde en español salvo que el usuario escriba en otro idioma; el código y los commits siguen el idioma ya usado en `git log`.
- Puedes abrir PRs y arreglar el CI sin preguntar; no hagas push a ramas distintas de la asignada, no fusiones en `develop` ni en `main`, no publiques versiones ni borres cosas sin aprobación.
- Reglas de diseño y formato de cada actualización (**Estado / Hecho por Claude / Necesito de ti**): `docs/WORKFLOW.md`.
- Si cambias texto visible, ejecuta `npm run i18n:check`; si cambias estilos, comprueba el tema claro (`:root.theme-light`).

## Directivas permanentes de Maxter (no negociables)
- **Nunca fusiones (merge) en `develop` ni en `main`/`master`**, ni PRs tuyas ni de otros, ni siquiera de una release. Abre la PR y avisa a Maxter para que revise y fusione él.
- **Nunca publiques una versión (RC, final o promoción de Vercel) por tu cuenta.** Solo cuando Maxter lo pida expresamente para esa versión. Que apruebe un diseño, un cambio o una PR **no** cuenta como permiso para publicar. Disparar `release-candidate.yml` o `release.yml` es publicar.
