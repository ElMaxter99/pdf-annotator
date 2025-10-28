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
    files: ['roboto-400.woff2'],
  },
  {
    name: 'Poppins',
    folder: 'poppins',
    files: ['poppins-400.woff2'],
  },
  {
    name: 'Inter',
    folder: 'inter',
    files: ['inter-400.woff2'],
  },
  {
    name: 'Montserrat',
    folder: 'montserrat',
    files: ['montserrat-400.woff2'],
  },
  {
    name: 'Lato',
    folder: 'lato',
    files: ['lato-400.woff2'],
  },
  {
    name: 'Nunito',
    folder: 'nunito',
    files: ['nunito-400.woff2'],
  },
  {
    name: 'Open Sans',
    folder: 'open-sans',
    files: ['open-sans-400.woff2'],
  },
  {
    name: 'Manrope',
    folder: 'manrope',
    files: ['manrope-400.woff2'],
  },
  {
    name: 'Fira Code',
    folder: 'fira-code',
    files: ['fira-code-400.woff2'],
  },
  {
    name: 'JetBrains Mono',
    folder: 'jetbrains-mono',
    files: ['jetbrains-mono-400.woff2'],
  },
  {
    name: 'Playfair Display',
    folder: 'playfair-display',
    files: ['playfair-display-400.woff2'],
  },
  {
    name: 'Merriweather',
    folder: 'merriweather',
    files: ['merriweather-400.woff2'],
  },
  {
    name: 'Source Serif 4',
    folder: 'source-serif-4',
    files: ['source-serif-4-400.woff2'],
  },
  {
    name: 'Raleway',
    folder: 'raleway',
    files: ['raleway-400.woff2'],
  },
  {
    name: 'Oswald',
    folder: 'oswald',
    files: ['oswald-400.woff2'],
  },
  {
    name: 'Work Sans',
    folder: 'work-sans',
    files: ['work-sans-400.woff2'],
  },
  {
    name: 'DM Sans',
    folder: 'dm-sans',
    files: ['dm-sans-400.woff2'],
  },
  {
    name: 'DM Serif Display',
    folder: 'dm-serif-display',
    files: ['dm-serif-display-400.woff2'],
  },
  {
    name: 'Noto Sans JP',
    folder: 'noto-sans-jp',
    files: ['noto-sans-jp-400.woff2'],
  },
  {
    name: 'Noto Serif Display',
    folder: 'noto-serif-display',
    files: ['noto-serif-display-400.woff2'],
  },
  {
    name: 'Cabin',
    folder: 'cabin',
    files: ['cabin-400.woff2'],
  },
  {
    name: 'Karla',
    folder: 'karla',
    files: ['karla-400.woff2'],
  },
  {
    name: 'Space Grotesk',
    folder: 'space-grotesk',
    files: ['space-grotesk-400.woff2'],
  },
  {
    name: 'Sora',
    folder: 'sora',
    files: ['sora-400.woff2'],
  },
  {
    name: 'Bitter',
    folder: 'bitter',
    files: ['bitter-400.woff2'],
  },
  {
    name: 'Archivo',
    folder: 'archivo',
    files: ['archivo-400.woff2'],
  },
  {
    name: 'Heebo',
    folder: 'heebo',
    files: ['heebo-400.woff2'],
  },
  {
    name: 'Crimson Pro',
    folder: 'crimson-pro',
    files: ['crimson-pro-400.woff2'],
  },
  {
    name: 'IBM Plex Sans',
    folder: 'ibm-plex-sans',
    files: ['ibm-plex-sans-400.woff2'],
  },
  {
    name: 'IBM Plex Serif',
    folder: 'ibm-plex-serif',
    files: ['ibm-plex-serif-400.woff2'],
  },
  {
    name: 'IBM Plex Mono',
    folder: 'ibm-plex-mono',
    files: ['ibm-plex-mono-400.woff2'],
  },
  {
    name: 'Urbanist',
    folder: 'urbanist',
    files: ['urbanist-400.woff2'],
  },
  {
    name: 'Sofia Sans',
    folder: 'sofia-sans',
    files: ['sofia-sans-400.woff2'],
  },
  {
    name: 'Asap',
    folder: 'asap',
    files: ['asap-400.woff2'],
  },
  {
    name: 'Quicksand',
    folder: 'quicksand',
    files: ['quicksand-400.woff2'],
  },
  {
    name: 'Zilla Slab',
    folder: 'zilla-slab',
    files: ['zilla-slab-400.woff2'],
  },
] as const;

const EXTENSION_TO_FORMAT: Record<string, FontSource['format']> = {
  woff2: 'woff2',
  woff: 'woff',
  ttf: 'truetype',
  otf: 'opentype',
};

const STYLE_ELEMENT_ID = 'annotation-fonts-style';

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
  return asset.files.map((file) => {
    const lastDot = file.lastIndexOf('.');
    const extension = lastDot >= 0 ? file.slice(lastDot + 1).toLowerCase() : '';
    const format = EXTENSION_TO_FORMAT[extension];
    const baseName = lastDot >= 0 ? file.slice(0, lastDot) : file;
    const tokens = baseName
      .split(/[^a-z0-9]+/gi)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const style = inferFontStyle(tokens);
    const weight = inferFontWeight(tokens);

    return {
      path: `fonts/${asset.folder}/${file}`,
      format,
      style,
      weight,
    };
  });
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
  return {
    stylesheet: `https://fonts.googleapis.com/css2?family=${family}:wght@400&display=swap`,
  };
}

const REMOTE_STYLESHEET_URL = (() => {
  const families = FONT_ASSETS.map((asset) => encodeGoogleFamily(asset.name)).filter(Boolean);
  if (!families.length) {
    return null;
  }
  const unique = Array.from(new Set(families));
  const query = unique.map((family) => `family=${family}:wght@400`).join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
})();

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
