export interface StandardFontVariant {
  weight: number;
  pdfName: string;
}

export interface StandardFontDefinition {
  id: string;
  label: string;
  cssStack: string;
  variants: StandardFontVariant[];
}

export const STANDARD_FONT_FAMILIES: StandardFontDefinition[] = [
  {
    id: 'Helvetica',
    label: 'Helvetica',
    cssStack: 'Helvetica, Arial, sans-serif',
    variants: [
      { weight: 400, pdfName: 'Helvetica' },
      { weight: 700, pdfName: 'HelveticaBold' },
    ],
  },
  {
    id: 'TimesRoman',
    label: 'Times New Roman',
    cssStack: '"Times New Roman", Times, serif',
    variants: [
      { weight: 400, pdfName: 'TimesRoman' },
      { weight: 700, pdfName: 'TimesBold' },
    ],
  },
  {
    id: 'Courier',
    label: 'Courier',
    cssStack: '"Courier New", Courier, monospace',
    variants: [
      { weight: 400, pdfName: 'Courier' },
      { weight: 700, pdfName: 'CourierBold' },
    ],
  },
];
