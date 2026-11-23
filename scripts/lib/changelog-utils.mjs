// Reglas puras del CHANGELOG por ficheros (sin tocar disco): ver docs/RELEASING.md y changelog/README.md.

/** Tipos válidos, en el orden en que salen en cada versión. */
export const TYPES = ['Added', 'Changed', 'Fixed', 'Security', 'Removed'];

/**
 * Lee un fichero de `changelog/unreleased/`: cabecera `---` con `type: Added|Changed|...`
 * (o `type: none` para «esta PR no necesita entrada») y, debajo, el texto de la entrada.
 * Devuelve { type, text } o lanza un Error con el motivo.
 */
export function parseEntry(raw, name = 'entrada') {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(raw).trimStart());
  if (!match) {
    throw new Error(`${name}: falta la cabecera «---» con «type:».`);
  }
  const header = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z]+):\s*(.*)$/.exec(line.trim());
    if (pair) {
      header[pair[1].toLowerCase()] = pair[2].trim();
    }
  }
  const type = header['type'];
  if (type === 'none') {
    return { type: 'none', text: '' };
  }
  const known = TYPES.find((candidate) => candidate.toLowerCase() === String(type).toLowerCase());
  if (!known) {
    throw new Error(`${name}: «type» debe ser ${TYPES.join(', ')} o none (llegó «${type ?? ''}»).`);
  }
  const text = match[2].trim();
  if (!text) {
    throw new Error(`${name}: el texto de la entrada está vacío.`);
  }
  return { type: known, text: text.startsWith('- ') ? text.slice(2).trim() : text };
}

/** Parte el cuerpo de una sección en { Added: ['- ...'], ... } conservando el orden de aparición. */
export function splitSections(body) {
  const sections = new Map();
  let current = null;
  let bullet = null;
  const flush = () => {
    if (current && bullet) {
      sections.get(current).push(bullet.join('\n').trimEnd());
    }
    bullet = null;
  };
  for (const line of String(body).split('\n')) {
    const heading = /^### (.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1];
      if (!sections.has(current)) {
        sections.set(current, []);
      }
    } else if (current && /^- /.test(line)) {
      flush();
      bullet = [line];
    } else if (current && bullet && (line.startsWith(' ') || line.trim() === '')) {
      bullet.push(line);
    }
  }
  flush();
  return sections;
}

/** Une las entradas sueltas con lo que ya hubiera escrito a mano en `## Unreleased`. */
export function buildBody(existingBody, entries) {
  const sections = splitSections(existingBody);
  for (const entry of entries) {
    if (entry.type === 'none') {
      continue;
    }
    if (!sections.has(entry.type)) {
      sections.set(entry.type, []);
    }
    sections.get(entry.type).push(`- ${entry.text}`);
  }
  const names = [
    ...TYPES.filter((type) => sections.has(type)),
    ...[...sections.keys()].filter((name) => !TYPES.includes(name)),
  ];
  return names
    .filter((name) => sections.get(name).length > 0)
    .map((name) => `### ${name}\n${sections.get(name).join('\n')}`)
    .join('\n\n');
}

/** CHANGELOG nuevo: `## Unreleased` vacío y, debajo, la sección de la versión con todo lo pendiente. */
export function releaseChangelog(changelog, version, date, entries, repoUrl) {
  const lines = String(changelog).split('\n');
  const start = lines.findIndex((line) => /^## Unreleased\s*$/.test(line));
  if (start === -1) {
    throw new Error('CHANGELOG.md no tiene «## Unreleased».');
  }
  let end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  if (end === -1) {
    end = lines.length;
  }
  const body = buildBody(lines.slice(start + 1, end).join('\n'), entries);
  if (!body) {
    throw new Error('No hay nada que publicar: «Unreleased» y changelog/unreleased/ están vacíos.');
  }
  const heading = `## [v${version}](${repoUrl}/tree/v.${version}) - ${date}`;
  return [
    ...lines.slice(0, start),
    '## Unreleased',
    '',
    heading,
    body,
    '',
    ...lines.slice(end),
  ].join('\n');
}

/** Rutas cuyo cambio exige una entrada (la comprobación del CI). */
export const NEEDS_ENTRY = /^(src\/|desktop\/|tools\/|public\/|nginx\.conf$|Dockerfile$)/;

export const touchesProduct = (files) => files.some((file) => NEEDS_ENTRY.test(file));
