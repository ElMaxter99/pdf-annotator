import fontRegistry from './font-registry.json';

export interface FontFaceConfig {
  readonly family: string;
  readonly display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
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

interface FontDefinition {
  readonly id: string;
  readonly label: string;
  readonly family?: string;
  readonly keywords?: readonly string[];
  readonly googleFamily?: string;
}

export const DEFAULT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const DEFAULT_FONT_TYPE = 'system-default';

const FONT_DEFINITIONS = fontRegistry as readonly FontDefinition[];

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

function createRemoteConfig(definition: FontDefinition): FontRemoteConfig | undefined {
  const family = encodeGoogleFamily(definition.googleFamily ?? definition.family ?? definition.label);
  if (!family) {
    return undefined;
  }

  return {
    stylesheet: `https://fonts.googleapis.com/css2?family=${family}:wght@400&display=swap`,
  };
}

function createFontOption(definition: FontDefinition): FontOption {
  const familyName = definition.family ?? definition.label;
  const remote = createRemoteConfig(definition);

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
