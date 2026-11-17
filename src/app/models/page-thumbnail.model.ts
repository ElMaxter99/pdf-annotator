export interface PageThumbnail {
  readonly pageNumber: number;
  /** `null` mientras la miniatura aún no se ha dibujado (solo se dibuja la que se ve). */
  readonly imageUrl: string | null;
  /** `true` si no se pudo dibujar; pulsar la miniatura lo reintenta. */
  readonly failed?: boolean;
  readonly width: number;
  readonly height: number;
}
