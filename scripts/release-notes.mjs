// npm run release:notes [-- X.Y.Z] [--out fichero]
// Imprime las notas de versión (la sección de CHANGELOG.md) listas para pegar
// en «Create release» de GitHub. Solo lee; no cambia nada.
import { writeFileSync } from 'node:fs';
import { changelogSection, currentVersion, normalizeVersion, REPO_URL, takeOption } from './lib/release-utils.mjs';

try {
  const args = process.argv.slice(2);
  const out = takeOption(args, '--out');
  const version = normalizeVersion(args[0] ?? currentVersion());
  const section = changelogSection(version);
  if (!section) throw new Error(`CHANGELOG.md no tiene sección para v${version}.`);
  const notes = `${section.body}\n\n**Cambios completos**: ${REPO_URL}/blob/master/CHANGELOG.md\n`;
  if (out) {
    writeFileSync(out, notes);
    console.error(`Notas de v${version} escritas en ${out}`);
  } else {
    process.stdout.write(notes);
  }
} catch (e) {
  console.error(`✖ ${e.message}`);
  process.exit(1);
}
