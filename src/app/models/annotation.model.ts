export type FieldType = 'text' | 'check' | 'radio' | 'number';

export type TextAlign = 'left' | 'center' | 'right';

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
  fontWeight?: number;
  textAlign?: TextAlign;
  opacity?: number;
  backgroundColor?: string | null;
  backgroundOpacity?: number | null;
}

export interface PageAnnotations {
  num: number;
  fields: PageField[];
}
