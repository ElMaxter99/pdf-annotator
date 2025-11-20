import { AcroFormField } from './acro-form-field.model';

export type FieldType = 'text' | 'check' | 'radio' | 'number';

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
  locked?: boolean;
  hidden?: boolean;
  acroField?: AcroFormField | null;
}

export interface PageAnnotations {
  num: number;
  fields: PageField[];
}
