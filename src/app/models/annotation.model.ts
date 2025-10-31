export type FieldType = 'text' | 'check' | 'radio' | 'number';

export type FontWeightOption = 'normal' | 'bold';

export type TextAlignOption = 'left' | 'center' | 'right';

export interface PageField {
  x: number;
  y: number;
  mapField: string;
  fontSize: number;
  color: string;
  type: FieldType;
  value?: string;
  appender?: string;
  decimals?: number | null;
  fontFamily?: string;
  fontWeight?: FontWeightOption;
  textAlign?: TextAlignOption;
  opacity?: number;
  backgroundColor?: string | null;
}

export interface PageAnnotations {
  num: number;
  fields: PageField[];
}
