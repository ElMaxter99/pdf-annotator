export type FieldType = 'text' | 'check' | 'radio' | 'number' | 'highlight' | 'underline';

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
  opacity?: number;
  backgroundColor?: string | null;
  backgroundOpacity?: number;
  strokeWidth?: number;
  width?: number;
}

export interface PageAnnotations {
  num: number;
  fields: PageField[];
}
