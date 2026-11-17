export interface PageThumbnail {
  readonly pageNumber: number;
  /** `null` mientras la miniatura aún no se ha dibujado (solo se dibuja la que se ve). */
  readonly imageUrl: string | null;
  readonly width: number;
  readonly height: number;
}
