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
  /** Marca interna (nunca va al JSON ni al PDF): este campo lo escribió la propuesta de la IA de la revisión abierta. */
  aiId?: string;
}

export interface PageAnnotations {
  num: number;
  fields: PageField[];
}
