export type StandardFontName =
  | 'Courier'
  | 'CourierBold'
  | 'Helvetica'
  | 'HelveticaBold'
  | 'TimesRoman'
  | 'TimesBold';

export interface StandardFontFamilyDefinition {
  readonly id: string;
  readonly label: string;
  readonly cssFamily: string;
  readonly weights: {
    readonly normal: StandardFontName;
    readonly bold?: StandardFontName;
  };
}

export const STANDARD_FONT_FAMILIES: readonly StandardFontFamilyDefinition[] = [
  {
    id: 'helvetica',
    label: 'Helvetica',
    cssFamily: 'Helvetica, Arial, sans-serif',
    weights: {
      normal: 'Helvetica',
      bold: 'HelveticaBold',
    },
  },
  {
    id: 'times',
    label: 'Times New Roman',
    cssFamily: '"Times New Roman", Times, serif',
    weights: {
      normal: 'TimesRoman',
      bold: 'TimesBold',
    },
  },
  {
    id: 'courier',
    label: 'Courier',
    cssFamily: 'Courier, "Courier New", monospace',
    weights: {
      normal: 'Courier',
      bold: 'CourierBold',
    },
  },
];
