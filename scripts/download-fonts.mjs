#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(
  ROOT_DIR,
  'src',
  'app',
  'config',
  'fonts',
  'font-registry.json'
);
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'fonts');
const GOOGLE_FONTS_CSS_API = 'https://fonts.googleapis.com/css2';
const GOOGLE_FONTS_METADATA_API = 'https://fonts.google.com/metadata/fonts';

const CSS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/css,*/*;q=0.1'
};

const METADATA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  Referer: 'https://fonts.google.com/',
  Origin: 'https://fonts.google.com'
};

const FONT_FILE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: '*/*'
};

const HELP_MESSAGE = `Usage: node scripts/download-fonts.mjs [options]

Downloads the font binaries declared in src/app/config/fonts/font-registry.json
using the public Google Fonts endpoints.

Options:
  --font <id|label>    Limit the download to a specific font. May be repeated.
  --fonts <list>       Comma separated list of font identifiers or labels.
  --output <dir>       Destination directory for the \"fonts\" folder (default: public/fonts).
  --subset <list>      Comma separated list of subsets to request (default: latin).
  --formats <list>     Preferred formats (default: truetype,opentype).
  --force              Overwrite existing files instead of reusing them.
  --dry-run            Show the operations without performing downloads.
  --help               Display this help message.
`;

const WEIGHT_KEYWORDS = new Map([
  ['thin', 100],
  ['extralight', 200],
  ['ultralight', 200],
  ['light', 300],
  ['book', 350],
  ['normal', 400],
  ['regular', 400],
  ['text', 400],
  ['medium', 500],
  ['semibold', 600],
  ['demibold', 600],
  ['bold', 700],
  ['extrabold', 800],
  ['ultrabold', 800],
  ['black', 900],
  ['heavy', 900]
]);

let metadataCache = null;

function printHelp() {
  process.stdout.write(HELP_MESSAGE);
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

function encodeGoogleFamily(name) {
  return name
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, '').trim())
    .filter(Boolean)
    .join('+');
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseCliArgs(argv) {
  const options = {
    fonts: new Set(),
    outputDir: DEFAULT_OUTPUT_DIR,
    subsets: ['latin'],
    formats: ['truetype', 'opentype'],
    force: false,
    dryRun: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--help':
        options.help = true;
        return options;
      case '--font':
        if (index + 1 < argv.length) {
          options.fonts.add(argv[index + 1]);
          index += 1;
        }
        break;
      case '--fonts':
        if (index + 1 < argv.length) {
          const tokens = normalizeList(argv[index + 1]);
          tokens.forEach((token) => options.fonts.add(token));
          index += 1;
        }
        break;
      case '--output':
        if (index + 1 < argv.length) {
          options.outputDir = path.resolve(ROOT_DIR, argv[index + 1]);
          index += 1;
        }
        break;
      case '--subset':
        if (index + 1 < argv.length) {
          const subsets = normalizeList(argv[index + 1]);
          options.subsets = subsets.length ? subsets : options.subsets;
          index += 1;
        }
        break;
      case '--formats':
        if (index + 1 < argv.length) {
          const formats = normalizeList(argv[index + 1]).map((item) => item.toLowerCase());
          options.formats = formats.length ? formats : options.formats;
          index += 1;
        }
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        break;
    }
  }

  if (!options.formats.length) {
    options.formats = ['truetype', 'opentype'];
  }

  return options;
}

async function loadFontRegistry() {
  const raw = await readFile(REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Font registry must be an array.');
  }

  return parsed;
}

function normalizePdfSources(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
  }
  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }
  return [];
}

function parseVariantFromFileName(fileName) {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const normalized = withoutExt.replace(/([a-z])([A-Z])/g, '$1-$2');
  const tokens = normalized
    .split(/[-_]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  let style = 'normal';
  let weight = null;

  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (token === 'italic' || token === 'oblique') {
      style = 'italic';
      continue;
    }
    if (WEIGHT_KEYWORDS.has(token)) {
      weight = WEIGHT_KEYWORDS.get(token);
      break;
    }
    const numeric = Number.parseInt(token, 10);
    if (!Number.isNaN(numeric) && numeric >= 100 && numeric <= 900) {
      weight = numeric;
      break;
    }
  }

  return {
    weight: weight ?? 400,
    style
  };
}

function createFontTargets(registry, options) {
  const filters = new Set(Array.from(options.fonts).map((item) => item.trim().toLowerCase()).filter(Boolean));
  const targets = [];

  for (const entry of registry) {
    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    if (!id || !label) {
      continue;
    }

    if (filters.size) {
      const normalizedId = id.toLowerCase();
      const normalizedLabel = label.toLowerCase();
      if (!filters.has(normalizedId) && !filters.has(normalizedLabel)) {
        continue;
      }
    }

    const pdfSources = normalizePdfSources(entry.pdf);
    if (!pdfSources.length) {
      continue;
    }

    const variants = [];
    let folder = null;

    for (const source of pdfSources) {
      const normalized = source.replace(/\\/g, '/').replace(/^\/+/g, '');
      const segments = normalized.split('/').filter(Boolean);
      if (segments.length < 2) {
        continue;
      }
      const fileName = segments[segments.length - 1];
      const parent = segments[segments.length - 2];
      folder = folder ?? parent ?? id;
      const variant = parseVariantFromFileName(fileName);
      variants.push({
        weight: variant.weight,
        style: variant.style,
        outputFile: fileName,
        outputPath: path.join(options.outputDir, folder, fileName)
      });
    }

    if (!variants.length) {
      continue;
    }

    targets.push({
      id,
      label,
      family: typeof entry.googleFamily === 'string' && entry.googleFamily.trim()
        ? entry.googleFamily.trim()
        : typeof entry.family === 'string' && entry.family.trim()
          ? entry.family.trim()
          : label,
      folder: folder ?? id,
      variants
    });
  }

  return targets;
}

function buildFamilyQuery(family, variants) {
  const encodedFamily = encodeGoogleFamily(family);
  if (!variants.length) {
    return encodedFamily;
  }

  const normalWeights = new Set();
  const italicWeights = new Set();

  for (const variant of variants) {
    if (variant.style === 'italic') {
      italicWeights.add(variant.weight);
    } else {
      normalWeights.add(variant.weight);
    }
  }

  const normalList = Array.from(normalWeights).sort((a, b) => a - b);
  const italicList = Array.from(italicWeights).sort((a, b) => a - b);

  if (italicList.length) {
    const tokens = [];
    if (normalList.length) {
      for (const weight of normalList) {
        tokens.push(`0,${weight}`);
      }
    }
    for (const weight of italicList) {
      tokens.push(`1,${weight}`);
    }
    const joined = tokens.join(';');
    return `${encodedFamily}:ital,wght@${joined}`;
  }

  if (normalList.length) {
    const joined = normalList.join(';');
    return `${encodedFamily}:wght@${joined}`;
  }

  return encodedFamily;
}

async function fetchFamilyCss(familyQuery, subsets) {
  const params = new URLSearchParams();
  params.set('family', familyQuery);
  params.set('display', 'swap');
  if (Array.isArray(subsets) && subsets.length) {
    params.set('subset', subsets.join(','));
  }

  const url = `${GOOGLE_FONTS_CSS_API}?${params.toString()}`;
  const response = await fetch(url, { headers: CSS_HEADERS });
  if (!response.ok) {
    throw new Error(`Failed to fetch CSS for ${familyQuery} (${response.status})`);
  }
  return response.text();
}

function detectFormatFromUrl(url) {
  const lower = url.split('?')[0]?.toLowerCase() ?? '';
  if (lower.endsWith('.woff2')) {
    return 'woff2';
  }
  if (lower.endsWith('.woff')) {
    return 'woff';
  }
  if (lower.endsWith('.otf')) {
    return 'opentype';
  }
  if (lower.endsWith('.ttf')) {
    return 'truetype';
  }
  return 'auto';
}

function extractSourcesFromCss(css) {
  if (typeof css !== 'string' || !css.length) {
    return [];
  }

  const sources = [];
  const faceRegex = /@font-face\s*{[^}]+}/gi;
  const blockMatches = css.match(faceRegex) ?? [];

  for (const block of blockMatches) {
    const weightMatch = /font-weight\s*:\s*(\d+)/i.exec(block);
    const styleMatch = /font-style\s*:\s*(normal|italic)/i.exec(block);
    const weight = weightMatch ? Number.parseInt(weightMatch[1], 10) : 400;
    const style = styleMatch ? styleMatch[1].toLowerCase() : 'normal';

    const urlRegex = /url\(([^)]+)\)\s*format\(['"]?([^'"\)]+)['"]?\)/gi;
    let match = urlRegex.exec(block);
    while (match) {
      const rawUrl = match[1].trim().replace(/^['"]|['"]$/g, '');
      const format = match[2].trim().toLowerCase();
      sources.push({
        url: rawUrl,
        format,
        weight,
        style
      });
      match = urlRegex.exec(block);
    }
  }

  return sources;
}

function extensionForFormat(format) {
  switch (format) {
    case 'opentype':
      return '.otf';
    case 'truetype':
      return '.ttf';
    case 'woff2':
      return '.woff2';
    case 'woff':
      return '.woff';
    default:
      return '';
  }
}

function formatMatchesOutput(format, outputFile) {
  const lower = outputFile.toLowerCase();
  if (lower.endsWith('.ttf')) {
    return format === 'truetype';
  }
  if (lower.endsWith('.otf')) {
    return format === 'opentype';
  }
  return true;
}

async function loadMetadataMap() {
  if (metadataCache) {
    return metadataCache;
  }

  try {
    const response = await fetch(GOOGLE_FONTS_METADATA_API, { headers: METADATA_HEADERS });
    if (!response.ok) {
      throw new Error(`Metadata request failed with status ${response.status}`);
    }
    const text = await response.text();
    const sanitized = text.replace(/^\)\]\}'\s*/, '');
    const data = JSON.parse(sanitized);
    const list = Array.isArray(data?.familyMetadataList)
      ? data.familyMetadataList
      : Array.isArray(data?.fonts)
        ? data.fonts
        : Array.isArray(data?.items)
          ? data.items
          : [];
    const map = new Map();
    for (const item of list) {
      const key =
        (typeof item?.family === 'string' && item.family.trim()) ||
        (typeof item?.name === 'string' && item.name.trim()) ||
        (typeof item?.id === 'string' && item.id.trim()) ||
        null;
      if (!key) {
        continue;
      }
      map.set(key.toLowerCase(), item);
    }
    metadataCache = map;
  } catch (error) {
    console.warn('[fonts] No se pudo cargar la metadata de Google Fonts.', error?.message ?? error);
    metadataCache = new Map();
  }

  return metadataCache;
}

async function getFamilyMetadata(family) {
  const map = await loadMetadataMap();
  const key = family.trim().toLowerCase();
  return map.get(key) ?? null;
}

function buildMetadataVariantKeys(weight, style) {
  const keys = [];
  const suffix = style === 'italic' ? 'italic' : '';
  if (weight === 400 && !suffix) {
    keys.push('regular');
  }
  if (weight === 400 && suffix === 'italic') {
    keys.push('italic');
  }
  const numericKey = `${weight}${suffix}`;
  keys.push(numericKey);
  if (suffix && weight === 400) {
    keys.push('italic');
  }
  return keys;
}

function getMetadataSources(metadata, weight, style) {
  if (!metadata) {
    return [];
  }
  const files = metadata.files ?? metadata.variants ?? metadata.fonts ?? null;
  if (!files || typeof files !== 'object') {
    return [];
  }

  const entries = [];
  const keys = buildMetadataVariantKeys(weight, style);

  for (const key of keys) {
    if (!(key in files)) {
      continue;
    }
    const value = files[key];
    if (typeof value === 'string') {
      entries.push({ url: value, format: detectFormatFromUrl(value) });
    } else if (value && typeof value === 'object') {
      const url =
        typeof value.url === 'string'
          ? value.url
          : typeof value.ttf === 'string'
            ? value.ttf
            : typeof value.otf === 'string'
              ? value.otf
              : typeof value.woff2 === 'string'
                ? value.woff2
                : typeof value.woff === 'string'
                  ? value.woff
                  : null;
      if (url) {
        const format = typeof value.format === 'string' ? value.format.toLowerCase() : detectFormatFromUrl(url);
        entries.push({ url, format });
      }
    }
  }

  return entries;
}

function selectVariantSource(metadata, cssSources, variant, options) {
  const preferredFormats = options.formats.map((item) => item.toLowerCase());
  const priority = new Map(preferredFormats.map((format, index) => [format, index]));

  const cssCandidates = cssSources
    .filter((source) => source.weight === variant.weight && source.style === variant.style)
    .filter((source) => preferredFormats.includes(source.format) && formatMatchesOutput(source.format, variant.outputFile))
    .sort((a, b) => (priority.get(a.format) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.format) ?? Number.MAX_SAFE_INTEGER));

  if (cssCandidates.length) {
    return { ...cssCandidates[0], origin: 'css' };
  }

  const metadataCandidates = getMetadataSources(metadata, variant.weight, variant.style)
    .filter((source) => preferredFormats.includes(source.format) && formatMatchesOutput(source.format, variant.outputFile))
    .sort((a, b) => (priority.get(a.format) ?? Number.MAX_SAFE_INTEGER) - (priority.get(b.format) ?? Number.MAX_SAFE_INTEGER));

  if (metadataCandidates.length) {
    return { ...metadataCandidates[0], origin: 'metadata' };
  }

  return null;
}

async function downloadFontSource(url) {
  const response = await fetch(url, { headers: FONT_FILE_HEADERS });
  if (!response.ok) {
    throw new Error(`Descarga fallida (${response.status}) para ${url}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function processFont(target, options) {
  const familyQuery = buildFamilyQuery(target.family, target.variants);

  let cssSources = [];
  try {
    const css = await fetchFamilyCss(familyQuery, options.subsets);
    cssSources = extractSourcesFromCss(css);
  } catch (error) {
    console.warn(`[fonts] No se pudo obtener la hoja de estilos de ${target.label}:`, error?.message ?? error);
  }

  const metadata = await getFamilyMetadata(target.family);

  for (const variant of target.variants) {
    const source = selectVariantSource(metadata, cssSources, variant, options);
    if (!source) {
      console.warn(`[fonts] No hay fuentes disponibles para ${target.label} (${variant.weight}${variant.style === 'italic' ? 'i' : ''}).`);
      continue;
    }

    await ensureDir(path.dirname(variant.outputPath));

    if (!options.force && (await pathExists(variant.outputPath))) {
      console.log(`✓ ${variant.outputFile} (ya existe)`);
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${variant.outputFile} ← ${source.url}`);
      continue;
    }

    try {
      const bytes = await downloadFontSource(source.url);
      await writeFile(variant.outputPath, bytes);
      const formatExt = extensionForFormat(source.format) || path.extname(variant.outputFile);
      console.log(`→ ${variant.outputFile} (${source.origin}) [${source.format}${formatExt ? ` · ${formatExt}` : ''}]`);
    } catch (error) {
      console.warn(`[fonts] Error al descargar ${target.label}:`, error?.message ?? error);
    }
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  let registry;
  try {
    registry = await loadFontRegistry();
  } catch (error) {
    console.error('[fonts] No se pudo leer el registro de fuentes:', error?.message ?? error);
    process.exitCode = 1;
    return;
  }

  const targets = createFontTargets(registry, options);
  if (!targets.length) {
    console.error('[fonts] No se encontraron fuentes para descargar.');
    process.exitCode = 1;
    return;
  }

  console.log('Descargando fuentes desde Google Fonts...');

  for (const target of targets) {
    console.log(`\n=== ${target.label} (${target.family}) ===`);
    await processFont(target, options);
  }

  console.log('\nProceso completado.');
}

main().catch((error) => {
  console.error('[fonts] Error inesperado:', error?.message ?? error);
  process.exitCode = 1;
});
