#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, 'public', 'fonts');
const REMOTE_FALLBACK_PATH = path.join(
  ROOT_DIR,
  'src',
  'app',
  'config',
  'fonts',
  'font-remote-fallbacks.json'
);

const HELP_MESSAGE = `Usage: node scripts/download-font-fallbacks.mjs [options]

Downloads the remote fallback font files declared in
src/app/config/fonts/font-remote-fallbacks.json.

Options:
  --font <id>          Download the fallback files for a specific font. May be repeated.
  --fonts <ids>        Comma separated list of font identifiers to download.
  --output <dir>       Directory where the font folders will be created (default: public/fonts).
  --force              Overwrite files even if they already exist.
  --dry-run            Show the actions that would be performed without downloading files.
  --help               Show this help message.
`;

let remoteFallbackManifestCache = null;
let resolvedFallbackMapCache = null;

async function loadRemoteFallbackManifest() {
  if (remoteFallbackManifestCache) {
    return remoteFallbackManifestCache;
  }

  const raw = await readFile(REMOTE_FALLBACK_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Remote fallback manifest is not a valid object.');
  }

  if (parsed.fonts && typeof parsed.fonts !== 'object') {
    throw new Error('Remote fallback manifest is missing a valid "fonts" section.');
  }

  remoteFallbackManifestCache = parsed;
  return remoteFallbackManifestCache;
}

function isAbsoluteUrl(url) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url);
}

function joinBaseUrl(baseUrl, relativePath) {
  if (!relativePath) {
    return null;
  }

  const trimmedPath = relativePath.trim();
  if (!trimmedPath) {
    return null;
  }

  if (isAbsoluteUrl(trimmedPath)) {
    return trimmedPath;
  }

  const candidateBase = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  if (!candidateBase) {
    return trimmedPath;
  }

  const sanitizedBase = candidateBase.endsWith('/') ? candidateBase : `${candidateBase}/`;
  const sanitizedPath = trimmedPath.replace(/^\/+/, '');

  try {
    return new URL(sanitizedPath, sanitizedBase).toString();
  } catch {
    return `${sanitizedBase}${sanitizedPath}`;
  }
}

function resolveManifestEntry(entry, manifest) {
  if (!entry) {
    return null;
  }

  if (typeof entry === 'string') {
    return joinBaseUrl(manifest.baseUrl ?? null, entry);
  }

  if (typeof entry !== 'object') {
    return null;
  }

  const candidateBase = entry.baseUrl ?? manifest.baseUrl ?? null;

  if (typeof entry.url === 'string' && entry.url.trim()) {
    return joinBaseUrl(candidateBase, entry.url);
  }

  if (typeof entry.path === 'string' && entry.path.trim()) {
    return joinBaseUrl(candidateBase, entry.path);
  }

  return null;
}

async function loadResolvedFallbackMap() {
  if (resolvedFallbackMapCache) {
    return resolvedFallbackMapCache;
  }

  const manifest = await loadRemoteFallbackManifest();
  const fonts = manifest.fonts && typeof manifest.fonts === 'object' ? manifest.fonts : {};
  const resolved = {};

  for (const [fontId, entries] of Object.entries(fonts)) {
    if (!Array.isArray(entries) || !entries.length) {
      continue;
    }

    const seen = new Set();
    const urls = [];

    for (const entry of entries) {
      const resolvedUrl = resolveManifestEntry(entry, manifest);
      const trimmed = typeof resolvedUrl === 'string' ? resolvedUrl.trim() : '';
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      urls.push(trimmed);
      seen.add(trimmed);
    }

    if (urls.length) {
      resolved[fontId] = urls;
    }
  }

  resolvedFallbackMapCache = resolved;
  return resolvedFallbackMapCache;
}

function parseArgs(argv) {
  const options = {
    fonts: new Set(),
    outputDir: DEFAULT_OUTPUT_DIR,
    force: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--font':
        {
          const value = argv[i + 1];
          if (!value) {
            throw new Error('Missing value for --font');
          }
          options.fonts.add(value.trim());
          i += 1;
        }
        break;
      case '--fonts':
        {
          const value = argv[i + 1];
          if (!value) {
            throw new Error('Missing value for --fonts');
          }
          value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .forEach((id) => options.fonts.add(id));
          i += 1;
        }
        break;
      case '--output':
        {
          const value = argv[i + 1];
          if (!value) {
            throw new Error('Missing value for --output');
          }
          options.outputDir = path.resolve(ROOT_DIR, value);
          i += 1;
        }
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Unknown option: ${token}`);
        }
        options.fonts.add(token);
        break;
    }
  }

  return options;
}

async function fileExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return false;
    }
    throw error;
  }
}

function normaliseFontId(value) {
  return value.trim().toLowerCase();
}

function selectFonts(requested, fallbackMap) {
  const requestedIds = Array.from(requested)
    .map(normaliseFontId)
    .filter(Boolean);

  if (!requestedIds.length) {
    return Object.keys(fallbackMap).sort();
  }

  const available = new Set(Object.keys(fallbackMap).map(normaliseFontId));
  const valid = [];
  for (const id of requestedIds) {
    if (available.has(id)) {
      valid.push(id);
    } else {
      console.warn(`Ignoring unknown font id: ${id}`);
    }
  }
  return valid;
}

function getFileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    const lastSegment = pathname?.split('/')?.filter(Boolean).pop();
    if (lastSegment) {
      return lastSegment;
    }
  } catch (error) {
    // fall through to basename heuristic
  }

  const sanitized = url.split('?')[0] ?? url;
  return path.basename(sanitized);
}

async function downloadToFile(url, filePath, { force, dryRun }) {
  const alreadyExists = await fileExists(filePath);

  if (dryRun) {
    if (alreadyExists && !force) {
      console.log(`[dry-run] Would keep existing file: ${filePath}`);
      return 'dry-run';
    }
    console.log(`[dry-run] Would download ${url} -> ${filePath}`);
    return 'dry-run';
  }

  if (!force && alreadyExists) {
    console.log(`Skipping existing file: ${filePath}`);
    return 'skipped';
  }

  await mkdir(path.dirname(filePath), { recursive: true });

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'pdf-annotator-font-fetcher/1.0 (+https://github.com/AlvaroMaxter/pdf-annotator)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status} ${response.statusText})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await writeFile(filePath, buffer);
  console.log(`Downloaded ${url} -> ${filePath}`);
  return 'downloaded';
}

async function downloadFont(fontId, urls, options) {
  if (!Array.isArray(urls) || !urls.length) {
    console.warn(`No fallback URLs declared for font '${fontId}'.`);
    return { fontId, downloaded: 0, skipped: 0, dryRun: 0 };
  }

  let downloaded = 0;
  let skipped = 0;
  let dryRun = 0;

  for (const rawUrl of urls) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url) {
      continue;
    }
    const fileName = getFileNameFromUrl(url);
    if (!fileName) {
      console.warn(`Unable to determine filename for ${url}; skipping.`);
      skipped += 1;
      continue;
    }
    const targetPath = path.join(options.outputDir, fontId, fileName);
    const result = await downloadToFile(url, targetPath, options);
    if (result === 'downloaded') {
      downloaded += 1;
    } else if (result === 'dry-run') {
      dryRun += 1;
    } else {
      skipped += 1;
    }
  }

  return { fontId, downloaded, skipped, dryRun };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
    console.log('\n' + HELP_MESSAGE.trim());
    return;
  }

  if (options.help) {
    console.log(HELP_MESSAGE.trim());
    return;
  }

  const fallbackMap = await loadResolvedFallbackMap();
  const selectedFonts = selectFonts(options.fonts, fallbackMap);
  if (!selectedFonts.length) {
    console.log('Nothing to do.');
    return;
  }

  console.log(`Downloading fallback fonts to ${options.outputDir}`);

  const summaries = [];
  for (const fontId of selectedFonts) {
    const urls =
      fallbackMap[fontId] ?? fallbackMap[normaliseFontId(fontId)] ?? fallbackMap[fontId.toLowerCase()];
    const summary = await downloadFont(normaliseFontId(fontId), urls, options);
    summaries.push(summary);
  }

  const totalDownloaded = summaries.reduce((acc, item) => acc + item.downloaded, 0);
  const totalSkipped = summaries.reduce((acc, item) => acc + item.skipped, 0);
  const totalDryRun = summaries.reduce((acc, item) => acc + item.dryRun, 0);

  if (options.dryRun) {
    console.log(
      `\nSummary: would download ${totalDryRun} file(s); skipped ${totalSkipped} existing file(s).`
    );
  } else {
    console.log(`\nSummary: downloaded ${totalDownloaded} file(s), skipped ${totalSkipped} file(s).`);
  }
}

main().catch((error) => {
  console.error('Failed to download fallback fonts:', error);
  process.exit(1);
});
