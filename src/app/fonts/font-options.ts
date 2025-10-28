export interface FontSource {
  readonly path: string;
  readonly format?: 'woff2' | 'woff' | 'truetype' | 'opentype';
  readonly weight?: number | string;
  readonly style?: 'normal' | 'italic';
}

export interface FontFaceConfig {
  readonly family: string;
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  readonly sources: readonly FontSource[];
}

export interface FontRemoteConfig {
  readonly stylesheet: string;
}

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly searchTerms: readonly string[];
  readonly face?: FontFaceConfig;
  readonly remote?: FontRemoteConfig;
}

export interface FontAsset {
  readonly name: string;
  readonly folder: string;
  readonly files: readonly string[];
  readonly keywords?: readonly string[];
}

export const DEFAULT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const DEFAULT_FONT_TYPE = 'system-default';

// Generated automatically by mass-font-downloader
export const FONT_ASSETS: readonly FontAsset[] = [
  {
    name: 'Roboto',
    folder: 'roboto',
    files: [
      'roboto-100.woff2',
      'roboto-300.woff2',
      'roboto-400.woff2',
      'roboto-500.woff2',
      'roboto-700.woff2',
      'roboto-900.woff2',
    ],
  },
  {
    name: 'Poppins',
    folder: 'poppins',
    files: [
      'poppins-100.woff2',
      'poppins-200.woff2',
      'poppins-300.woff2',
      'poppins-400.woff2',
      'poppins-500.woff2',
      'poppins-600.woff2',
      'poppins-700.woff2',
      'poppins-800.woff2',
      'poppins-900.woff2',
    ],
  },
  {
    name: 'Inter',
    folder: 'inter',
    files: [
      'inter-300.woff2',
      'inter-400.woff2',
      'inter-500.woff2',
      'inter-600.woff2',
      'inter-700.woff2',
    ],
  },
  {
    name: 'Montserrat',
    folder: 'montserrat',
    files: [
      'montserrat-200.woff2',
      'montserrat-300.woff2',
      'montserrat-400.woff2',
      'montserrat-500.woff2',
      'montserrat-600.woff2',
      'montserrat-700.woff2',
      'montserrat-800.woff2',
      'montserrat-900.woff2',
    ],
  },
  {
    name: 'Lato',
    folder: 'lato',
    files: ['lato-300.woff2', 'lato-400.woff2', 'lato-700.woff2', 'lato-900.woff2'],
  },
  {
    name: 'Nunito',
    folder: 'nunito',
    files: [
      'nunito-200.woff2',
      'nunito-300.woff2',
      'nunito-400.woff2',
      'nunito-600.woff2',
      'nunito-700.woff2',
      'nunito-800.woff2',
    ],
  },
  {
    name: 'Open Sans',
    folder: 'open-sans',
    files: [
      'open-sans-300.woff2',
      'open-sans-400.woff2',
      'open-sans-600.woff2',
      'open-sans-700.woff2',
    ],
  },
  {
    name: 'Manrope',
    folder: 'manrope',
    files: [
      'manrope-200.woff2',
      'manrope-300.woff2',
      'manrope-400.woff2',
      'manrope-500.woff2',
      'manrope-600.woff2',
      'manrope-700.woff2',
      'manrope-800.woff2',
    ],
  },
  {
    name: 'Fira Code',
    folder: 'fira-code',
    files: [
      'fira-code-300.woff2',
      'fira-code-400.woff2',
      'fira-code-500.woff2',
      'fira-code-600.woff2',
      'fira-code-700.woff2',
    ],
  },
  {
    name: 'JetBrains Mono',
    folder: 'jetbrains-mono',
    files: [
      'jetbrains-mono-200.woff2',
      'jetbrains-mono-300.woff2',
      'jetbrains-mono-400.woff2',
      'jetbrains-mono-500.woff2',
      'jetbrains-mono-600.woff2',
      'jetbrains-mono-700.woff2',
    ],
  },
  {
    name: 'Playfair Display',
    folder: 'playfair-display',
    files: [
      'playfair-display-400.woff2',
      'playfair-display-500.woff2',
      'playfair-display-600.woff2',
      'playfair-display-700.woff2',
      'playfair-display-800.woff2',
      'playfair-display-900.woff2',
    ],
  },
  {
    name: 'Merriweather',
    folder: 'merriweather',
    files: [
      'merriweather-300.woff2',
      'merriweather-400.woff2',
      'merriweather-700.woff2',
      'merriweather-900.woff2',
    ],
  },
  {
    name: 'Source Serif 4',
    folder: 'source-serif-4',
    files: [
      'source-serif-4-300.woff2',
      'source-serif-4-400.woff2',
      'source-serif-4-600.woff2',
      'source-serif-4-700.woff2',
    ],
  },
  {
    name: 'Raleway',
    folder: 'raleway',
    files: [
      'raleway-200.woff2',
      'raleway-300.woff2',
      'raleway-400.woff2',
      'raleway-500.woff2',
      'raleway-600.woff2',
      'raleway-700.woff2',
      'raleway-800.woff2',
      'raleway-900.woff2',
    ],
  },
  {
    name: 'Oswald',
    folder: 'oswald',
    files: [
      'oswald-200.woff2',
      'oswald-300.woff2',
      'oswald-400.woff2',
      'oswald-500.woff2',
      'oswald-600.woff2',
      'oswald-700.woff2',
    ],
  },
  {
    name: 'Work Sans',
    folder: 'work-sans',
    files: [
      'work-sans-200.woff2',
      'work-sans-300.woff2',
      'work-sans-400.woff2',
      'work-sans-500.woff2',
      'work-sans-600.woff2',
      'work-sans-700.woff2',
      'work-sans-800.woff2',
      'work-sans-900.woff2',
    ],
  },
  {
    name: 'DM Sans',
    folder: 'dm-sans',
    files: [
      'dm-sans-300.woff2',
      'dm-sans-400.woff2',
      'dm-sans-500.woff2',
      'dm-sans-600.woff2',
      'dm-sans-700.woff2',
    ],
  },
  {
    name: 'DM Serif Display',
    folder: 'dm-serif-display',
    files: ['dm-serif-display-400.woff2'],
  },
  {
    name: 'Noto Sans JP',
    folder: 'noto-sans-jp',
    files: [
      'noto-sans-jp-300.woff2',
      'noto-sans-jp-400.woff2',
      'noto-sans-jp-500.woff2',
      'noto-sans-jp-700.woff2',
    ],
  },
  {
    name: 'Noto Serif Display',
    folder: 'noto-serif-display',
    files: [
      'noto-serif-display-300.woff2',
      'noto-serif-display-400.woff2',
      'noto-serif-display-500.woff2',
      'noto-serif-display-600.woff2',
      'noto-serif-display-700.woff2',
    ],
  },
  {
    name: 'Cabin',
    folder: 'cabin',
    files: ['cabin-400.woff2', 'cabin-500.woff2', 'cabin-600.woff2', 'cabin-700.woff2'],
  },
  {
    name: 'Karla',
    folder: 'karla',
    files: [
      'karla-200.woff2',
      'karla-300.woff2',
      'karla-400.woff2',
      'karla-500.woff2',
      'karla-600.woff2',
      'karla-700.woff2',
      'karla-800.woff2',
    ],
  },
  {
    name: 'Space Grotesk',
    folder: 'space-grotesk',
    files: [
      'space-grotesk-300.woff2',
      'space-grotesk-400.woff2',
      'space-grotesk-500.woff2',
      'space-grotesk-600.woff2',
      'space-grotesk-700.woff2',
    ],
  },
  {
    name: 'Sora',
    folder: 'sora',
    files: [
      'sora-100.woff2',
      'sora-200.woff2',
      'sora-300.woff2',
      'sora-400.woff2',
      'sora-500.woff2',
      'sora-600.woff2',
      'sora-700.woff2',
      'sora-800.woff2',
    ],
  },
  {
    name: 'Bitter',
    folder: 'bitter',
    files: [
      'bitter-200.woff2',
      'bitter-300.woff2',
      'bitter-400.woff2',
      'bitter-500.woff2',
      'bitter-600.woff2',
      'bitter-700.woff2',
      'bitter-800.woff2',
    ],
  },
  {
    name: 'Archivo',
    folder: 'archivo',
    files: [
      'archivo-200.woff2',
      'archivo-300.woff2',
      'archivo-400.woff2',
      'archivo-500.woff2',
      'archivo-600.woff2',
      'archivo-700.woff2',
    ],
  },
  {
    name: 'Heebo',
    folder: 'heebo',
    files: [
      'heebo-100.woff2',
      'heebo-200.woff2',
      'heebo-300.woff2',
      'heebo-400.woff2',
      'heebo-500.woff2',
      'heebo-600.woff2',
      'heebo-700.woff2',
      'heebo-800.woff2',
      'heebo-900.woff2',
    ],
  },
  {
    name: 'Crimson Pro',
    folder: 'crimson-pro',
    files: [
      'crimson-pro-200.woff2',
      'crimson-pro-300.woff2',
      'crimson-pro-400.woff2',
      'crimson-pro-500.woff2',
      'crimson-pro-600.woff2',
      'crimson-pro-700.woff2',
      'crimson-pro-800.woff2',
      'crimson-pro-900.woff2',
    ],
  },
  {
    name: 'IBM Plex Sans',
    folder: 'ibm-plex-sans',
    files: [
      'ibm-plex-sans-100.woff2',
      'ibm-plex-sans-200.woff2',
      'ibm-plex-sans-300.woff2',
      'ibm-plex-sans-400.woff2',
      'ibm-plex-sans-500.woff2',
      'ibm-plex-sans-600.woff2',
      'ibm-plex-sans-700.woff2',
    ],
  },
  {
    name: 'IBM Plex Serif',
    folder: 'ibm-plex-serif',
    files: [
      'ibm-plex-serif-100.woff2',
      'ibm-plex-serif-200.woff2',
      'ibm-plex-serif-300.woff2',
      'ibm-plex-serif-400.woff2',
      'ibm-plex-serif-500.woff2',
      'ibm-plex-serif-600.woff2',
      'ibm-plex-serif-700.woff2',
    ],
  },
  {
    name: 'IBM Plex Mono',
    folder: 'ibm-plex-mono',
    files: [
      'ibm-plex-mono-100.woff2',
      'ibm-plex-mono-200.woff2',
      'ibm-plex-mono-300.woff2',
      'ibm-plex-mono-400.woff2',
      'ibm-plex-mono-500.woff2',
      'ibm-plex-mono-600.woff2',
      'ibm-plex-mono-700.woff2',
    ],
  },
  {
    name: 'Urbanist',
    folder: 'urbanist',
    files: [
      'urbanist-100.woff2',
      'urbanist-200.woff2',
      'urbanist-300.woff2',
      'urbanist-400.woff2',
      'urbanist-500.woff2',
      'urbanist-600.woff2',
      'urbanist-700.woff2',
      'urbanist-800.woff2',
      'urbanist-900.woff2',
    ],
  },
  {
    name: 'Sofia Sans',
    folder: 'sofia-sans',
    files: [
      'sofia-sans-100.woff2',
      'sofia-sans-200.woff2',
      'sofia-sans-300.woff2',
      'sofia-sans-400.woff2',
      'sofia-sans-500.woff2',
      'sofia-sans-600.woff2',
      'sofia-sans-700.woff2',
      'sofia-sans-800.woff2',
      'sofia-sans-900.woff2',
    ],
  },
  {
    name: 'Asap',
    folder: 'asap',
    files: [
      'asap-200.woff2',
      'asap-300.woff2',
      'asap-400.woff2',
      'asap-500.woff2',
      'asap-600.woff2',
      'asap-700.woff2',
    ],
  },
  {
    name: 'Quicksand',
    folder: 'quicksand',
    files: [
      'quicksand-300.woff2',
      'quicksand-400.woff2',
      'quicksand-500.woff2',
      'quicksand-600.woff2',
      'quicksand-700.woff2',
    ],
  },
  {
    name: 'Zilla Slab',
    folder: 'zilla-slab',
    files: [
      'zilla-slab-300.woff2',
      'zilla-slab-400.woff2',
      'zilla-slab-500.woff2',
      'zilla-slab-600.woff2',
      'zilla-slab-700.woff2',
    ],
  },
] as const;

const EXTENSION_TO_FORMAT: Record<string, FontSource['format']> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

const STYLE_ELEMENT_ID = 'annotation-fonts-style';

function parseFontFileName(file: string): { extension: string; tokens: string[] } {
  const lastDot = file.lastIndexOf('.');
  const extension = lastDot >= 0 ? file.slice(lastDot + 1).toLowerCase() : '';
  const baseName = lastDot >= 0 ? file.slice(0, lastDot) : file;
  const tokens = baseName
    .split(/[^a-z0-9]+/gi)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  return { extension, tokens };
}

function normalizeWeightValue(weight: FontSource['weight']): number {
  if (typeof weight === 'number' && Number.isFinite(weight)) {
    return weight;
  }
  if (typeof weight === 'string') {
    const parsed = Number(weight);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 400;
}

function compareFontSources(a: FontSource, b: FontSource): number {
  const stylePriorityA = a.style === 'italic' ? 1 : 0;
  const stylePriorityB = b.style === 'italic' ? 1 : 0;
  if (stylePriorityA !== stylePriorityB) {
    return stylePriorityA - stylePriorityB;
  }

  const weightA = normalizeWeightValue(a.weight);
  const weightB = normalizeWeightValue(b.weight);
  const weightPriorityA = Math.abs(weightA - 400);
  const weightPriorityB = Math.abs(weightB - 400);
  if (weightPriorityA !== weightPriorityB) {
    return weightPriorityA - weightPriorityB;
  }

  if (weightA !== weightB) {
    return weightA - weightB;
  }

  return 0;
}

function inferFontStyle(tokens: string[]): 'normal' | 'italic' {
  if (tokens.some((token) => token === 'italic' || token === 'italics')) {
    return 'italic';
  }
  return 'normal';
}

function inferFontWeight(tokens: string[]): number | string {
  const weightToken = tokens.find((token) => /^(100|200|300|400|500|600|700|800|900)$/.test(token));
  if (weightToken) {
    return Number(weightToken);
  }

  if (tokens.includes('thin')) return 100;
  if (tokens.includes('extralight') || tokens.includes('ultralight')) return 200;
  if (tokens.includes('light')) return 300;
  if (tokens.includes('regular') || tokens.includes('normal')) return 400;
  if (tokens.includes('medium')) return 500;
  if (tokens.includes('semibold') || tokens.includes('demibold')) return 600;
  if (tokens.includes('bold')) return 700;
  if (tokens.includes('extrabold') || tokens.includes('ultrabold')) return 800;
  if (tokens.includes('black') || tokens.includes('heavy')) return 900;

  return 400;
}

function sanitizeSearchTerm(term: string): string[] {
  return term
    .split(/[\s_-]+/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function createFontSources(asset: FontAsset): FontSource[] {
  const sources = asset.files.map((file) => {
    const { extension, tokens } = parseFontFileName(file);
    const format = EXTENSION_TO_FORMAT[extension];
    const style = inferFontStyle(tokens);
    const weight = inferFontWeight(tokens);

    return {
      path: `fonts/${asset.folder}/${file}`,
      format,
      style,
      weight,
    };
  });

  sources.sort(compareFontSources);
  return sources;
}

function collectAssetWeights(asset: FontAsset): number[] {
  const weights = new Set<number>();

  for (const file of asset.files) {
    const { tokens } = parseFontFileName(file);
    const weight = inferFontWeight(tokens);
    const numeric = typeof weight === 'number' ? weight : Number(weight);
    if (Number.isFinite(numeric)) {
      weights.add(numeric);
    }
  }

  if (!weights.size) {
    weights.add(400);
  }

  return Array.from(weights).sort((a, b) => a - b);
}

function resolveBaseUrl(doc?: Document | null): string {
  if (doc?.baseURI) {
    return doc.baseURI;
  }

  if (typeof document !== 'undefined' && document.baseURI) {
    return document.baseURI;
  }

  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }

  return '/';
}

export function resolveFontSourceUrl(path: string, doc?: Document | null): string {
  try {
    const base = resolveBaseUrl(doc);
    return new URL(path, base).toString();
  } catch {
    return path;
  }
}

function createSearchTerms(asset: FontAsset): string[] {
  const terms = new Set<string>();
  terms.add(asset.name.toLowerCase());
  sanitizeSearchTerm(asset.name).forEach((term) => terms.add(term));
  sanitizeSearchTerm(asset.folder).forEach((term) => terms.add(term));
  asset.keywords?.forEach((keyword) => {
    terms.add(keyword.toLowerCase());
    sanitizeSearchTerm(keyword).forEach((term) => terms.add(term));
  });
  return Array.from(terms);
}

function createFontOption(asset: FontAsset): FontOption {
  const sources = createFontSources(asset);
  const remote = createRemoteConfig(asset);
  return {
    id: asset.folder,
    label: asset.name,
    family: `'${asset.name}', ${DEFAULT_FONT_FAMILY}`,
    searchTerms: createSearchTerms(asset),
    face: {
      family: asset.name,
      display: 'swap',
      sources,
    },
    remote,
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
  ...FONT_ASSETS.map(createFontOption),
];

const FONT_LOOKUP = new Map<string, FontOption>(FONT_OPTIONS.map((option) => [option.id, option]));

export function normalizeFontType(fontType: unknown): string {
  if (typeof fontType !== 'string') {
    return DEFAULT_FONT_TYPE;
  }
  return FONT_LOOKUP.has(fontType) ? fontType : DEFAULT_FONT_TYPE;
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

export function createFontStyleSheet(doc?: Document | null): string {
  const css: string[] = [];

  for (const option of FONT_OPTIONS) {
    if (option.face) {
      const groups = new Map<string, FontSource[]>();
      for (const source of option.face.sources) {
        const style = source.style ?? 'normal';
        const weight = source.weight ?? 400;
        const key = `${style}|${weight}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(source);
        groups.set(key, bucket);
      }

      for (const [key, sources] of groups) {
        const [style, weight] = key.split('|');
        const src = sources
          .map((item) => {
            const url = resolveFontSourceUrl(item.path, doc);
            const format = item.format ? ` format('${item.format}')` : '';
            return `url(${JSON.stringify(url)})${format}`;
          })
          .join(', ');
        css.push(
          [
            '@font-face {',
            `  font-family: ${JSON.stringify(option.face.family)};`,
            `  font-style: ${style};`,
            `  font-weight: ${weight};`,
            `  font-display: ${option.face.display ?? 'swap'};`,
            `  src: ${src};`,
            '}',
          ].join('\n')
        );
      }
    }

    css.push(
      `.annotation[data-font='${option.id}'] { --annotation-font-family: ${option.family}; font-family: ${option.family}; }`
    );
  }

  return css.join('\n');
}

export function ensureFontStyles(doc: Document | null = typeof document !== 'undefined' ? document : null) {
  if (!doc) {
    return;
  }
  if (doc.getElementById(STYLE_ELEMENT_ID)) {
    return;
  }
  const styleEl = doc.createElement('style');
  styleEl.id = STYLE_ELEMENT_ID;
  styleEl.textContent = createFontStyleSheet(doc);
  doc.head.appendChild(styleEl);
}

const REMOTE_LINK_ID = 'annotation-fonts-remote';

function encodeGoogleFamily(name: string): string {
  return name
    .trim()
    .split(/\s+/g)
    .filter(Boolean)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, '').trim())
    .filter(Boolean)
    .join('+');
}

function createRemoteConfig(asset: FontAsset): FontRemoteConfig | undefined {
  const family = encodeGoogleFamily(asset.name);
  if (!family) {
    return undefined;
  }
  const weights = collectAssetWeights(asset);
  const weightQuery = weights.length ? `:wght@${weights.join(';')}` : '';
  return {
    stylesheet: `https://fonts.googleapis.com/css2?family=${family}${weightQuery}&display=swap`,
  };
}

const REMOTE_STYLESHEET_URL = (() => {
  const familyWeights = new Map<string, Set<number>>();

  for (const asset of FONT_ASSETS) {
    const family = encodeGoogleFamily(asset.name);
    if (!family) {
      continue;
    }
    const weights = collectAssetWeights(asset);
    const bucket = familyWeights.get(family) ?? new Set<number>();
    weights.forEach((weight) => bucket.add(weight));
    familyWeights.set(family, bucket);
  }

  if (!familyWeights.size) {
    return null;
  }

  const queries = Array.from(familyWeights.entries()).map(([family, weights]) => {
    const sorted = Array.from(weights).sort((a, b) => a - b);
    const weightQuery = sorted.length ? `:wght@${sorted.join(';')}` : '';
    return `family=${family}${weightQuery}`;
  });

  return `https://fonts.googleapis.com/css2?${queries.join('&')}&display=swap`;
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
