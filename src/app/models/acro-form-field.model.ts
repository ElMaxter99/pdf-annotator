export interface AcroFormFieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AcroFormField {
  name: string;
  page: number;
  rect: AcroFormFieldRect;
}
