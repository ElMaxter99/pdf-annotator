import { PageAnnotations } from './annotation.model';

export interface OfflinePdfSource {
  readonly weight: number;
  readonly bytes: Uint8Array;
}

export interface OfflinePdfDocument {
  readonly id: string;
  readonly name: string;
  readonly fileName?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly pageCount: number;
  readonly pageIndex?: number;
  readonly pdfBytes: Uint8Array;
  readonly annotations: PageAnnotations[];
  readonly undoStack: PageAnnotations[][];
  readonly redoStack: PageAnnotations[][];
  readonly byteSources: OfflinePdfSource[];
  readonly thumbnailDataUrl?: string;
}

export interface OfflinePdfSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
  readonly pageCount: number;
  readonly thumbnailDataUrl?: string;
}
