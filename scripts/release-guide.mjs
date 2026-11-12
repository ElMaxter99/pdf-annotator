// npm run release:guide [-- X.Y.Z]
// Imprime la guía paso a paso para publicar una versión con los comandos ya
// rellenados. Solo imprime; no ejecuta nada.
import { currentVersion, DEV_BRANCH, MAIN_BRANCH, normalizeVersion, REPO_URL } from './lib/release-utils.mjs';

try {
  const v = normalizeVersion(process.argv[2] ?? currentVersion());
  console.log(`Guía de publicación · v${v}

1. Preparar la versión (PR a ${DEV_BRANCH})
   git switch ${DEV_BRANCH} && git pull
   git switch -c chore/version-${v}
   npm run release:deploy -- bump ${v}     # package.json, badge del README (la cabecera del CHANGELOG, a mano)
   git commit -am "Release v${v}" && git push -u origin chore/version-${v}
   Abre la PR a ${DEV_BRANCH}, espera a «build-and-test» (Snyk y Codex/CodeRabbit pueden fallar
   por límites de cuenta, no por el código) y fusiónala con aprobación.

2. Release automático (recomendado)
   GitHub → Actions → «Release» → Run workflow (rama ${DEV_BRANCH}). Hace todo lo del paso 2 manual, compila los
   instaladores y publica la release con las notas puestas (desmarca «publish» para dejarla en borrador).

2b. Release a mano (alternativa; con la versión ya fusionada en ${DEV_BRANCH}; vale desde cualquier rama con el árbol limpio)
   npm run release:deploy                  # cambia a ${DEV_BRANCH}, hace pull, comprueba, pide escribir v${v},
                                           # alinea ${DEV_BRANCH} y ${MAIN_BRANCH} (avance rápido o merge de ${MAIN_BRANCH} en ${DEV_BRANCH}),
                                           # crea y sube la rama release/v${v} y el tag v${v}
   npm run release:deploy -- --dry-run     # solo comprueba y cuenta qué haría
   Si ya hay una PR ${DEV_BRANCH} → ${MAIN_BRANCH} abierta, fusiónala antes o ciérrala: el script nunca fuerza pushes.
   Si npm dice «Missing script», estás en una rama sin los scripts (p. ej. ${MAIN_BRANCH} antigua): git switch ${DEV_BRANCH} && git pull.

3. Desplegar y publicar
   Despliegue en Vercel: a mano, o automático si existe el secreto VERCEL_DEPLOY_HOOK_URL.
   npm run release:notes                   # notas de v${v} desde el CHANGELOG
   ${REPO_URL}/releases/new?tag=v${v}   → pega las notas y publica.

Nada se empuja sin confirmación explícita ni se fuerza ningún push.`);
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}
