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

export interface FontOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
  readonly searchTerms: readonly string[];
  readonly face?: FontFaceConfig;
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
      path: `/fonts/${asset.folder}/${file}`,
      format,
      style,
      weight,
    };
  });
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

function groupSources(sources: readonly FontSource[]): FontSource[] {
  const unique = new Map<string, FontSource>();
  for (const source of sources) {
    const style = source.style ?? 'normal';
    const weight = typeof source.weight === 'number' ? source.weight : Number(source.weight ?? 400);
    const key = `${style}|${weight}|${source.path}`;
    if (!unique.has(key)) {
      unique.set(key, source);
    }
  }
  return Array.from(unique.values());
}

export function createFontStyleSheet(): string {
  const css: string[] = [];

  for (const option of FONT_OPTIONS) {
    if (option.face) {
      const groups = new Map<string, FontSource[]>();
      for (const source of groupSources(option.face.sources)) {
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
            const format = item.format ? ` format('${item.format}')` : '';
            return `url('${item.path}')${format}`;
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

    css.push(`.annotation[data-font='${option.id}'] { font-family: ${option.family}; }`);
  }

  css.push(`.annotation { font-family: ${DEFAULT_FONT_FAMILY}; }`);

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
  styleEl.textContent = createFontStyleSheet();
  doc.head.appendChild(styleEl);
}

function getWindowFromDocument(doc: Document): (typeof window) | null {
  return (doc as unknown as { defaultView?: (typeof window) | null }).defaultView ?? null;
}

function toFontFaceDescriptors(source: FontSource): FontFaceDescriptors {
  const descriptors: FontFaceDescriptors = {};
  if (source.weight !== undefined) {
    descriptors.weight = `${source.weight}`;
  }
  if (source.style) {
    descriptors.style = source.style;
  }
  return descriptors;
}

function scoreFontSource(source: FontSource): number {
  let score = 0;
  if (source.style && source.style !== 'normal') {
    score += 5;
  }
  const weight = typeof source.weight === 'number' ? source.weight : Number(source.weight ?? 400);
  if (Number.isFinite(weight)) {
    score += Math.abs(weight - 400) / 100;
  }
  if (source.format === 'woff2') {
    score -= 2;
  } else if (source.format === 'woff') {
    score -= 1;
  }
  return score;
}

async function tryLoadFontFace(
  family: string,
  sources: readonly FontSource[],
  view: (typeof window)
): Promise<boolean> {
  if (typeof view.FontFace !== 'function') {
    return false;
  }

  let lastError: unknown = null;
  const sorted = [...sources].sort((a, b) => scoreFontSource(a) - scoreFontSource(b));

  for (const source of sorted) {
    try {
      const fontFace = new view.FontFace(family, `url(${source.path})`, toFontFaceDescriptors(source));
      const loaded = await fontFace.load();
      view.document.fonts.add(loaded);
      if (typeof view.document.fonts.load === 'function') {
        try {
          await view.document.fonts.load(`1em ${JSON.stringify(family)}`);
        } catch {
          // Ignore loading hint failures; the face is already registered.
        }
      }
      return true;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  return false;
}

const FONT_FACE_PROMISES = new Map<string, Promise<void>>();

export function ensureFontFaceLoaded(
  option: FontOption,
  doc: Document | null = typeof document !== 'undefined' ? document : null
): Promise<void> {
  if (!doc || !option.face) {
    return Promise.resolve();
  }

  const key = option.id;
  const cached = FONT_FACE_PROMISES.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    ensureFontStyles(doc);
    const view = getWindowFromDocument(doc);
    if (!view) {
      return;
    }

    const face = option.face!;
    const localLoaded = await tryLoadFontFace(face.family, face.sources, view).catch(() => false);
    if (localLoaded) {
      return;
    }

    const googleSources = await fetchGoogleFontSources(option).catch(() => []);
    if (googleSources.length === 0) {
      return;
    }

    await tryLoadFontFace(face.family, googleSources, view).catch(() => undefined);
  })();

  FONT_FACE_PROMISES.set(key, promise);
  return promise;
}

function buildGoogleFontsUrl(option: FontOption): string {
  const familyName = option.face?.family ?? option.label;
  const family = encodeURIComponent(familyName).replace(/%20/g, '+');
  const weights = new Set<number>();

  for (const source of option.face?.sources ?? []) {
    const weight = typeof source.weight === 'number' ? source.weight : Number(source.weight ?? 400);
    if (Number.isFinite(weight)) {
      weights.add(weight);
    }
  }

  const weightParam = weights.size ? `:wght@${Array.from(weights).sort((a, b) => a - b).join(';')}` : '';
  return `https://fonts.googleapis.com/css2?family=${family}${weightParam}&display=swap`;
}

const GOOGLE_CSS_CACHE = new Map<string, Promise<string>>();

async function fetchGoogleFontCss(option: FontOption): Promise<string> {
  const url = buildGoogleFontsUrl(option);
  const cached = GOOGLE_CSS_CACHE.get(url);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} al cargar ${url}`);
    }
    return response.text();
  })();

  GOOGLE_CSS_CACHE.set(url, promise);
  return promise;
}

function extractFontSourcesFromCss(cssText: string): FontSource[] {
  const sources: FontSource[] = [];
  const blockRegex = /@font-face\s*{([^}]+)}/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(cssText)) !== null) {
    const block = blockMatch[1];
    const styleMatch = block.match(/font-style:\s*(normal|italic)/i);
    const weightMatch = block.match(/font-weight:\s*([0-9]+)/i);
    const srcMatch = block.match(/src:\s*([^;]+);?/i);

    if (!srcMatch) {
      continue;
    }

    const urlRegex = /url\(([^)]+)\)\s*(?:format\('([^']+)'\))?/gi;
    let urlMatch: RegExpExecArray | null;

    while ((urlMatch = urlRegex.exec(srcMatch[1])) !== null) {
      let url = urlMatch[1].trim();
      url = url.replace(/^['"]|['"]$/g, '');
      if (!url || url.startsWith('data:')) {
        continue;
      }
      const format = (urlMatch[2]?.toLowerCase() as FontSource['format']) ?? undefined;
      sources.push({
        path: url,
        format,
        style: styleMatch ? (styleMatch[1].toLowerCase() as FontSource['style']) : 'normal',
        weight: weightMatch ? Number(weightMatch[1]) : 400,
      });
    }
  }

  return sources;
}

async function fetchGoogleFontSources(option: FontOption): Promise<FontSource[]> {
  const css = await fetchGoogleFontCss(option);
  return extractFontSourcesFromCss(css);
}

async function fetchFontBinary(path: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(path, {
      mode: 'cors',
      credentials: 'omit',
    });
    if (!response.ok) {
      return null;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      return null;
    }
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

const FONT_DATA_PROMISES = new Map<string, Promise<Uint8Array | null>>();

export function loadFontData(option: FontOption): Promise<Uint8Array | null> {
  const key = option.id;
  const cached = FONT_DATA_PROMISES.get(key);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    if (option.face) {
      for (const source of [...option.face.sources].sort((a, b) => scoreFontSource(a) - scoreFontSource(b))) {
        const data = await fetchFontBinary(source.path);
        if (data) {
          return data;
        }
      }

      const googleSources = await fetchGoogleFontSources(option).catch(() => []);
      for (const source of googleSources.sort((a, b) => scoreFontSource(a) - scoreFontSource(b))) {
        const data = await fetchFontBinary(source.path);
        if (data) {
          return data;
        }
      }
    }

    return null;
  })();

  FONT_DATA_PROMISES.set(key, promise);
  return promise;
}

export function matchFontOptions(query: string): readonly FontOption[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return FONT_OPTIONS;
  }
  const tokens = sanitizeSearchTerm(trimmed);
  if (!tokens.length) {
    return FONT_OPTIONS;
  }

  return FONT_OPTIONS.filter((option) =>
    tokens.every((token) => option.searchTerms.some((term) => term.includes(token)))
  );
}
