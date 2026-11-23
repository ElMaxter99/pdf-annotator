# Migración a TypeScript 7 (pendiente de Angular)

Estado a 2026-11-23: **el proyecto sigue en TypeScript `~6.0.x` a propósito.** El código ya está listo para la 7, pero el build no puede usarla hasta que Angular la admita.

## Por qué no se puede migrar hoy
- Angular 22.x declara `typescript >=6.0.0 <6.1.0` ([angular.dev/reference/versions](https://angular.dev/reference/versions)); `@angular/compiler-cli` y `@angular/build` lo repiten en `peerDependencies`.
- TypeScript 7.0 (compilador nativo) no trae la API de compilador de JavaScript que usa `ngc`: con la 7.0.2 forzada, `ngc` falla al arrancar (`ts2.parseCommandLine is not a function`).
- El [roadmap de Angular](https://angular.dev/roadmap) dice que entregarán un compilador compatible con tsgo, sin fecha ni versión.
- Dependabot tiene ignoradas las subidas mayores y menores de `typescript` (`.github/dependabot.yml`); solo llegan parches de 6.0.x.

## Qué sí se hace ya
- `npm run typecheck:ts7`: ejecuta `tsc --noEmit` con TypeScript 7 (versión fijada en `scripts/typecheck-ts7.mjs`, descargada con `npx`, sin tocar `package.json`) sobre `tsconfig.app.json` y `tsconfig.spec.json`. No compila la app ni revisa las plantillas de Angular. Con `--strict` devuelve código 1 si hay errores.
- El CI lo ejecuta en un job aparte (`typecheck-ts7`) con `continue-on-error`: avisa de errores nuevos que la 7 detecte, pero no bloquea nada.
- Estado de partida: 0 errores con TypeScript 7.0.2 en ambos proyectos.

## Mediciones de partida (2026-11-23, contenedor de la nube, 3 pasadas)
| Qué | TypeScript 6.0.3 | TypeScript 7.0.2 |
| --- | --- | --- |
| `tsc --noEmit -p tsconfig.app.json` | 2,8 a 3,1 s | ≈0,6 a 0,9 s |
| `tsc --noEmit -p tsconfig.spec.json` | 3,6 a 3,8 s | ≈0,9 a 1,0 s |
| `npm run build` (`i18n:check` + `ng build`) | 10,6 s, `dist/pdf-annotator/browser` 18 MB | no aplicable |

## Cuándo migrar
Cuando una versión estable de Angular tenga un `peerDependencies.typescript` que incluya la 7.x. Cada vez que salga una versión de Angular:
```
npm view @angular/compiler-cli peerDependencies.typescript
```
Si el rango incluye la 7, abrir la PR de migración:
1. `ng update` de Angular y `typescript` a `~7.x` en la misma PR; revisar `tsconfig*.json` contra la lista de cambios de TypeScript 7.
2. Quitar la regla `typescript` de `.github/dependabot.yml` y el job `typecheck-ts7` (ya no hará falta) y borrar este archivo o dejarlo como histórico.
3. Pasar `npm run build`, `npm run test:ci`, `npm run e2e`, `npm run a11y:ci`, `npm run test:desktop`, `npm run test:helper` y el empaquetado de escritorio; comparar tiempos con la tabla de arriba.
4. Sin `any` ni `@ts-ignore` para tapar errores nuevos. PR propia y revertible.

Si Angular publica un preprocesador propio (ngp) integrado en Angular CLI, evaluarlo aparte; hoy no está publicado en npm ni conectado a `ng build`.
