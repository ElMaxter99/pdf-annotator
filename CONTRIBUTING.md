# Contribuir a PDF Annotator

¡Gracias por querer mejorar el proyecto! Antes de empezar lee [`AGENTS.md`](AGENTS.md) (convenciones, mapa del repo, reglas de seguridad) y [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Flujo
1. Abre un issue (usa las plantillas) o comenta en uno existente.
2. Crea una rama desde `main`: `feat/…`, `fix/…`, `docs/…`.
3. `npm install` y trabaja con `npm run start:local`.
4. Antes del PR: `npm run build` y `npm test` en verde.
5. Abre el PR rellenando la plantilla, con capturas si cambia la UI (oscuro, claro y móvil).

## Reglas rápidas
- Todo texto visible va en los **7 idiomas** (`npm run i18n:check`).
- Nunca evalúes entrada del usuario ni inyectes HTML sin sanear.
- Añade tests cuando cambies lógica (parser JSON, normalización, exportación…).
- Actualiza `CHANGELOG.md` (sección *Unreleased*) y el README si cambia el comportamiento visible.

## Reportar vulnerabilidades
No abras un issue público: escribe por privado al autor (perfil de GitHub [@ElMaxter99](https://github.com/ElMaxter99)) con los pasos para reproducir.
