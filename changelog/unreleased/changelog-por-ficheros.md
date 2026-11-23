---
type: Changed
---
**CHANGELOG por ficheros (1.19, invisible):** cada PR añade un fichero en `changelog/unreleased/` (tipo y texto; `type: none` si no necesita entrada) en lugar de editar *Unreleased*, así dos PRs no chocan. `npm run changelog:check` (en el CI valida que una PR que toque la app traiga su entrada), `changelog:preview` y `changelog:release -- X.Y.Z`, que al subir de versión juntan los ficheros en `CHANGELOG.md` y los borran. Formato en `changelog/README.md`; `AGENTS.md`, `docs/RELEASING.md` y `docs/WORKFLOW.md` actualizados.
