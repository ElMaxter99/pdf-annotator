# CHANGELOG por ficheros

Cada PR que cambie la app (`src/`, `desktop/`, `tools/`, `public/`, `nginx.conf`, `Dockerfile`) añade **un fichero** en `changelog/unreleased/` en lugar de editar `CHANGELOG.md`; así dos PRs nunca chocan en el mismo sitio. Al subir de versión se juntan en `CHANGELOG.md` y se borran.

## Formato
Nombre: `NNN-resumen-corto.md` (número de PR si lo conoces, o solo `resumen-corto.md`). Contenido:

```
---
type: Added
---
**Título en negrita (mesa P-NN, 1.19):** qué cambia y por qué, en una o varias líneas.
```

- `type`: `Added`, `Changed`, `Fixed`, `Security` o `Removed`.
- `type: none` (sin texto) declara que la PR no necesita entrada (por ejemplo, un refactor sin efecto visible).
- Una PR puede traer varios ficheros. El texto sigue el estilo de `CHANGELOG.md` (en español, en negrita el resumen).

## Comandos
- `npm run changelog:check`: valida los ficheros. En el CI se ejecuta con `-- --base origin/<rama base>` y falla si la PR toca la app y no añade entrada.
- `npm run changelog:preview`: enseña cómo quedaría la próxima sección.
- `npm run changelog:release -- X.Y.Z`: (al subir de versión) escribe la sección `## [vX.Y.Z]` en `CHANGELOG.md`, con lo que hubiera escrito a mano en *Unreleased* más estos ficheros, y los borra.
