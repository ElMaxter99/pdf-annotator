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

2. Release (con la versión ya en ${DEV_BRANCH})
   git switch ${DEV_BRANCH} && git pull
   npm run release:deploy                  # simulacro: comprueba y muestra qué haría
   npm run release:deploy -- --execute     # pide escribir v${v}; alinea ${DEV_BRANCH} y ${MAIN_BRANCH} (avance rápido),
                                           # crea y sube la rama release/v${v} y el tag v${v}
   Si ya hay una PR ${DEV_BRANCH} → ${MAIN_BRANCH} abierta, fusiónala antes o ciérrala: el script alinea solo por avance rápido.

3. Desplegar y publicar
   Despliegue en Vercel: a mano.
   npm run release:notes                   # notas de v${v} desde el CHANGELOG
   ${REPO_URL}/releases/new?tag=v${v}   → pega las notas y publica.

Nada se empuja sin confirmación explícita ni se fuerza ningún push.`);
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}
