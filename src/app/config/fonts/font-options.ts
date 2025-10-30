import fontRegistry from './font-registry.json';
import remoteFallbackRegistry from './font-remote-fallbacks.json';

export interface FontFaceConfig {
  readonly family: string;
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

export interface FontRemoteConfig {
  readonly stylesheet: string;
  readonly pdfSources?: readonly string[];
}

export interface FontAssetSource {
  readonly url: string;
  readonly format?: 'auto' | 'woff2' | 'woff' | 'truetype' | 'opentype';
}

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly searchTerms: readonly string[];
  readonly face?: FontFaceConfig;
  readonly remote?: FontRemoteConfig;
  readonly assets?: readonly FontAssetSource[];
}

interface FontDefinition {
  readonly id: string;
  readonly label: string;
  readonly family?: string;
  readonly keywords?: readonly string[];
  readonly googleFamily?: string;
  readonly pdf?: readonly string[] | string;
}

export const DEFAULT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const DEFAULT_FONT_TYPE = 'system-default';

const FONT_DEFINITIONS = fontRegistry as readonly FontDefinition[];

const REMOTE_FONT_FALLBACKS = remoteFallbackRegistry as Readonly<
  Record<string, readonly string[]>
>;

function sanitizeSearchTerm(term: string): string[] {
  return term
    .split(/[\s_-]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function createSearchTerms(definition: FontDefinition): string[] {
  const terms = new Set<string>();
  terms.add(definition.label.toLowerCase());
  sanitizeSearchTerm(definition.label).forEach((term) => terms.add(term));
  sanitizeSearchTerm(definition.id).forEach((term) => terms.add(term));

  if (definition.family) {
    sanitizeSearchTerm(definition.family).forEach((term) => terms.add(term));
  }
  if (definition.googleFamily) {
    sanitizeSearchTerm(definition.googleFamily).forEach((term) => terms.add(term));
  }

  definition.keywords?.forEach((keyword) => {
    terms.add(keyword.toLowerCase());
    sanitizeSearchTerm(keyword).forEach((term) => terms.add(term));
  });

  return Array.from(terms);
}

function encodeGoogleFamily(name: string): string {
  return name
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, '').trim())
    .filter(Boolean)
    .join('+');
}

function normalizePdfSources(input: FontDefinition['pdf']): readonly string[] | undefined {
  if (!input) {
    return undefined;
  }

  if (Array.isArray(input)) {
    const filtered = input
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0);
    return filtered.length ? filtered : undefined;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : undefined;
  }

  return undefined;
}

function getRemoteFallbackSources(
  definition: FontDefinition
): readonly string[] | undefined {
  const fallback = REMOTE_FONT_FALLBACKS[definition.id];
  if (!fallback?.length) {
    return undefined;
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const raw of fallback) {
    const trimmed = typeof raw === 'string' ? raw.trim() : '';
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    sanitized.push(trimmed);
    seen.add(trimmed);
  }

  return sanitized.length ? sanitized : undefined;
}

function mergePdfSources(
  primary: readonly string[] | undefined,
  secondary: readonly string[] | undefined
): readonly string[] | undefined {
  const seen = new Set<string>();
  const merged: string[] = [];

  if (primary?.length) {
    for (const raw of primary) {
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      merged.push(trimmed);
      seen.add(trimmed);
    }
  }

  if (secondary?.length) {
    for (const raw of secondary) {
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      if (!trimmed || seen.has(trimmed)) {
        continue;
      }
      merged.push(trimmed);
      seen.add(trimmed);
    }
  }

  return merged.length ? merged : undefined;
}

function detectFontFormat(url: string): FontAssetSource['format'] {
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

function isRemoteUrl(url: string): boolean {
  return /^(?:https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:');
}

function createFontAssets(definition: FontDefinition): FontAssetSource[] | undefined {
  const pdfSources = normalizePdfSources(definition.pdf);
  if (!pdfSources?.length) {
    return undefined;
  }

  const assets = pdfSources
    .map((source) => source.trim())
    .filter((source) => source.length > 0 && !isRemoteUrl(source))
    .map((source) => ({ url: source, format: detectFontFormat(source) } as const));

  return assets.length ? assets : undefined;
}

function createRemoteConfig(definition: FontDefinition): FontRemoteConfig | undefined {
  const family = encodeGoogleFamily(
    definition.googleFamily ?? definition.family ?? definition.label
  );
  if (!family) {
    return undefined;
  }

  const pdfSources = normalizePdfSources(definition.pdf);
  const fallbackSources = getRemoteFallbackSources(definition);
  const remoteSources = mergePdfSources(pdfSources, fallbackSources);

  return {
    stylesheet: `https://fonts.googleapis.com/css2?family=${family}:wght@400&display=swap`,
    pdfSources: remoteSources,
  };
}

function createFontOption(definition: FontDefinition): FontOption {
  const familyName = definition.family ?? definition.label;
  const remote = createRemoteConfig(definition);
  const assets = createFontAssets(definition);

  return {
    id: definition.id,
    label: definition.label,
    family: `'${familyName}', ${DEFAULT_FONT_FAMILY}`,
    searchTerms: createSearchTerms(definition),
    face: remote
      ? {
          family: familyName,
          display: 'swap',
        }
      : undefined,
    remote,
    assets,
  };
}

const DEFAULT_FONT_OPTION: FontOption = {
  id: DEFAULT_FONT_TYPE,
  label: 'Default (Helvetica)',
  family: DEFAULT_FONT_FAMILY,
  searchTerms: ['default', 'system', 'helvetica', 'arial', 'sans serif', 'sans-serif'],
};

export const FONT_OPTIONS: readonly FontOption[] = [
  DEFAULT_FONT_OPTION,
  ...FONT_DEFINITIONS.map(createFontOption),
];

const FONT_LOOKUP = new Map<string, FontOption>(FONT_OPTIONS.map((option) => [option.id, option]));

function findFontId(candidate: string): string | null {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  if (FONT_LOOKUP.has(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();

  for (const option of FONT_OPTIONS) {
    if (option.id.toLowerCase() === normalized) {
      return option.id;
    }

    const normalizedLabel = option.label.trim().toLowerCase();
    if (normalizedLabel && normalizedLabel === normalized) {
      return option.id;
    }

    const primaryFamily = option.family
      .split(',')[0]
      ?.replace(/^['"]|['"]$/g, '')
      .trim()
      .toLowerCase();
    if (primaryFamily && primaryFamily === normalized) {
      return option.id;
    }

    const faceFamily = option.face?.family?.trim().toLowerCase();
    if (faceFamily && faceFamily === normalized) {
      return option.id;
    }
  }

  return null;
}

function extractFontTypeId(input: unknown): string | null {
  if (typeof input === 'string') {
    return input;
  }

  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidates = ['id', 'value', 'font', 'fontType'] as const;
  const bag = input as Record<string, unknown>;
  for (const key of candidates) {
    const value = bag[key];
    if (typeof value === 'string') {
      return value;
    }
  }

  return null;
}

export function normalizeFontType(fontType: unknown): string {
  const candidate = extractFontTypeId(fontType);
  if (!candidate) {
    return DEFAULT_FONT_TYPE;
  }

  const matched = findFontId(candidate);
  if (matched) {
    return matched;
  }

  if (fontType && typeof fontType === 'object') {
    for (const value of Object.values(fontType as Record<string, unknown>)) {
      if (typeof value === 'string') {
        const fallback = findFontId(value);
        if (fallback) {
          return fallback;
        }
      }
    }
  }

  return DEFAULT_FONT_TYPE;
}

export function resolveFontOption(fontType: unknown): FontOption {
  const normalized = normalizeFontType(fontType);
  return FONT_LOOKUP.get(normalized) ?? FONT_OPTIONS[0];
}

export function getFontFamily(fontType: unknown): string {
  return resolveFontOption(fontType).family;
}

export function shouldPersistFontType(fontType: unknown): boolean {
  return normalizeFontType(fontType) !== DEFAULT_FONT_TYPE;
}

const STYLE_ELEMENT_ID = 'annotation-fonts-style';

export function createFontStyleSheet(): string {
  const css: string[] = [];

  for (const option of FONT_OPTIONS) {
    css.push(
      `.annotation[data-font='${option.id}'] { --annotation-font-family: ${option.family}; font-family: ${option.family}; }`
    );
  }

  return css.join('\n');
}

export function ensureFontStyles(
  doc: Document | null = typeof document !== 'undefined' ? document : null
) {
  if (!doc) {
    return;
  }
  if (doc.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const styleEl = doc.createElement('style');
  styleEl.id = STYLE_ELEMENT_ID;
  styleEl.textContent = createFontStyleSheet();
  doc.head.appendChild(styleEl);
}

const REMOTE_LINK_ID = 'annotation-fonts-remote';

const REMOTE_STYLESHEET_URL = (() => {
  const families = FONT_DEFINITIONS.map((definition) =>
    encodeGoogleFamily(definition.googleFamily ?? definition.family ?? definition.label)
  ).filter(Boolean);

  if (!families.length) {
    return null;
  }

  const unique = Array.from(new Set(families));
  const query = unique.map((family) => `family=${family}:wght@400`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
})();

export const REMOTE_FONT_STYLESHEET_URL = REMOTE_STYLESHEET_URL;

export function ensureRemoteFontStyles(
  doc: Document | null = typeof document !== 'undefined' ? document : null
) {
  if (!doc || !REMOTE_STYLESHEET_URL) {
    return;
  }
  if (doc.getElementById(REMOTE_LINK_ID)) {
    return;
  }
  const linkEl = doc.createElement('link');
  linkEl.id = REMOTE_LINK_ID;
  linkEl.rel = 'stylesheet';
  linkEl.href = REMOTE_STYLESHEET_URL;
  linkEl.crossOrigin = 'anonymous';
  doc.head.appendChild(linkEl);
}

const LOCAL_FONT_STYLE_ID = 'annotation-fonts-local';

export function createLocalFontFaceSheet(): string {
  const rules: string[] = [];

  for (const option of FONT_OPTIONS) {
    if (!option.assets?.length || !option.face?.family) {
      continue;
    }

    const familyName = option.face.family.replace(/'/g, "\\'");
    const display = option.face.display ?? 'swap';
    const sources = option.assets
      .map((asset) => {
        const sanitizedUrl = asset.url.replace(/'/g, "\\'");
        const format = asset.format && asset.format !== 'auto' ? ` format('${asset.format}')` : '';
        return `url('${sanitizedUrl}')${format}`;
      })
      .join(', ');

    if (!sources) {
      continue;
    }

    rules.push(
      `@font-face { font-family: '${familyName}'; font-style: normal; font-weight: 400; font-display: ${display}; src: ${sources}; }`
    );
  }

  return rules.join('\n');
}

export function ensureLocalFontFaces(
  doc: Document | null = typeof document !== 'undefined' ? document : null
) {
  if (!doc) {
    return;
  }
  if (doc.getElementById(LOCAL_FONT_STYLE_ID)) {
    return;
  }

  const css = createLocalFontFaceSheet();
  if (!css) {
    return;
  }

  const styleEl = doc.createElement('style');
  styleEl.id = LOCAL_FONT_STYLE_ID;
  styleEl.textContent = css;
  doc.head.appendChild(styleEl);
}
