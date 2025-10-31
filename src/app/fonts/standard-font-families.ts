export type StandardFontName = 'Courier' | 'Helvetica' | 'TimesRoman' | 'Symbol' | 'ZapfDingbats';

export interface StandardFontFamilyDefinition {
  readonly id: string;
  readonly label: string;
  readonly cssFamily: string;
  readonly pdfName: StandardFontName;
}

export const STANDARD_FONT_FAMILIES: readonly StandardFontFamilyDefinition[] = [
  {
    id: 'helvetica',
    label: 'Helvetica',
    cssFamily: 'Helvetica, Arial, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'times-new-roman',
    label: 'Times New Roman',
    cssFamily: '"Times New Roman", Times, serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'arial',
    label: 'Arial',
    cssFamily: 'Arial, Helvetica, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'arial-narrow',
    label: 'Arial Narrow',
    cssFamily: '"Arial Narrow", Arial, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'avenir-next',
    label: 'Avenir Next',
    cssFamily: '"Avenir Next", Avenir, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'calibri',
    label: 'Calibri',
    cssFamily: 'Calibri, "Gill Sans", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'candara',
    label: 'Candara',
    cssFamily: 'Candara, Calibri, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'corbel',
    label: 'Corbel',
    cssFamily: 'Corbel, "Trebuchet MS", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'futura',
    label: 'Futura',
    cssFamily: 'Futura, "Century Gothic", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'gill-sans',
    label: 'Gill Sans',
    cssFamily: '"Gill Sans", "Gill Sans MT", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'lato',
    label: 'Lato',
    cssFamily: '"Lato", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    cssFamily: '"Montserrat", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'noto-sans',
    label: 'Noto Sans',
    cssFamily: '"Noto Sans", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'open-sans',
    label: 'Open Sans',
    cssFamily: '"Open Sans", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'pt-sans',
    label: 'PT Sans',
    cssFamily: '"PT Sans", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'roboto',
    label: 'Roboto',
    cssFamily: 'Roboto, "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'segoe-ui',
    label: 'Segoe UI',
    cssFamily: '"Segoe UI", Tahoma, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'source-sans-pro',
    label: 'Source Sans Pro',
    cssFamily: '"Source Sans Pro", "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'ubuntu',
    label: 'Ubuntu',
    cssFamily: 'Ubuntu, "Helvetica Neue", sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'verdana',
    label: 'Verdana',
    cssFamily: 'Verdana, Geneva, sans-serif',
    pdfName: 'Helvetica',
  },
  {
    id: 'cambria',
    label: 'Cambria',
    cssFamily: 'Cambria, "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'garamond',
    label: 'Garamond',
    cssFamily: 'Garamond, "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    cssFamily: 'Georgia, "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'palatino',
    label: 'Palatino',
    cssFamily: '"Palatino Linotype", Palatino, serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'baskerville',
    label: 'Baskerville',
    cssFamily: '"Baskerville", "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'bookman',
    label: 'Bookman Old Style',
    cssFamily: '"Bookman Old Style", "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'charter',
    label: 'Charter',
    cssFamily: 'Charter, "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'noto-serif',
    label: 'Noto Serif',
    cssFamily: '"Noto Serif", "Times New Roman", serif',
    pdfName: 'TimesRoman',
  },
  {
    id: 'courier',
    label: 'Courier',
    cssFamily: 'Courier, "Courier New", monospace',
    pdfName: 'Courier',
  },
  {
    id: 'inconsolata',
    label: 'Inconsolata',
    cssFamily: '"Inconsolata", "Courier New", monospace',
    pdfName: 'Courier',
  },
  {
    id: 'menlo',
    label: 'Menlo',
    cssFamily: 'Menlo, Monaco, monospace',
    pdfName: 'Courier',
  },
  {
    id: 'roboto-mono',
    label: 'Roboto Mono',
    cssFamily: '"Roboto Mono", "Courier New", monospace',
    pdfName: 'Courier',
  },
  {
    id: 'source-code-pro',
    label: 'Source Code Pro',
    cssFamily: '"Source Code Pro", "Courier New", monospace',
    pdfName: 'Courier',
  },
  {
    id: 'fira-code',
    label: 'Fira Code',
    cssFamily: '"Fira Code", "Courier New", monospace',
    pdfName: 'Courier',
  },
  {
    id: 'space-mono',
    label: 'Space Mono',
    cssFamily: '"Space Mono", "Courier New", monospace',
    pdfName: 'Courier',
  },
];
