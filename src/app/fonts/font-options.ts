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
  readonly labelKey: string;
  readonly family: string;
  readonly searchTerms: readonly string[];
  readonly face?: FontFaceConfig;
}

export const DEFAULT_FONT_FAMILY = 'Helvetica, Arial, sans-serif';
export const DEFAULT_FONT_TYPE = 'system-default';

export const FONT_OPTIONS: readonly FontOption[] = [
  {
    id: DEFAULT_FONT_TYPE,
    labelKey: 'annotation.fields.font.options.default',
    family: DEFAULT_FONT_FAMILY,
    searchTerms: ['default', 'system', 'helvetica', 'arial', 'sans serif', 'sans-serif'],
  },
  {
    id: 'roboto-regular',
    labelKey: 'annotation.fields.font.options.roboto',
    family: "'Roboto', sans-serif",
    searchTerms: ['roboto', 'sans serif', 'sans-serif', 'google'],
    face: {
      family: 'Roboto',
      display: 'swap',
      sources: [
        { path: '/fonts/roboto/Roboto-Regular.woff2', format: 'woff2', weight: 400, style: 'normal' },
        { path: '/fonts/roboto/Roboto-Regular.woff', format: 'woff', weight: 400, style: 'normal' },
      ],
    },
  },
  {
    id: 'poppins-regular',
    labelKey: 'annotation.fields.font.options.poppins',
    family: "'Poppins', sans-serif",
    searchTerms: ['poppins', 'rounded', 'sans serif', 'sans-serif'],
    face: {
      family: 'Poppins',
      display: 'swap',
      sources: [
        { path: '/fonts/poppins/Poppins-Regular.woff2', format: 'woff2', weight: 400, style: 'normal' },
        { path: '/fonts/poppins/Poppins-Regular.woff', format: 'woff', weight: 400, style: 'normal' },
      ],
    },
  },
];

const FONT_LOOKUP = new Map<string, FontOption>(
  FONT_OPTIONS.map((option) => [option.id, option])
);

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
