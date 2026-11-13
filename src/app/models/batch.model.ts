import type { PageAnnotations } from './annotation.model';
import type { AiDetails, AiRow } from '../utils/ai-proposal.utils';

/** The AI answer for one pair, kept until the person reviews it in the editor (never applied by itself). */
export interface AiSavedProposal {
  /** Row ids are `p<page>-f<position>` over `aPages` as they were when the request was made. */
  readonly rows: readonly AiRow[];
  readonly details: AiDetails | null;
  readonly provider: string;
  readonly model: string | null;
  readonly seconds: number;
  readonly at: number;
}

export type BatchItemStatus = 'review' | 'ready';

/** Explicit link between a field of B and a field of A that has another name. */
export interface FieldLink {
  /** Page number (same in A and B). */
  readonly page: number;
  readonly b: string;
  readonly a: string;
}

/** One PDF of the batch: the original (A, reference) and its new version (B, edited). */
export interface BatchItem {
  readonly id: string;
  /** File name of A. */
  readonly name: string;
  readonly aPdf: Blob;
  readonly aPages: PageAnnotations[];
  readonly bPdf: Blob | null;
  readonly bName: string | null;
  /** `null` until B has been opened for the first time. */
  readonly bPages: PageAnnotations[] | null;
  /** B's JSON as exported by the editor; this is what gets downloaded. */
  readonly bJson: string | null;
  readonly links: readonly FieldLink[];
  /** Keys (`page|name`) of fields of A deliberately left out of B. */
  readonly dismissed: readonly string[];
  /** A and B differ in page size: `true` scales A's coordinates to B, `false` keeps them, unset = not chosen yet. */
  readonly fitA?: boolean;
  /** Last AI proposal for this pair, waiting for review. */
  readonly aiProposal?: AiSavedProposal;
  readonly status: BatchItemStatus;
  readonly updatedAt: number;
}
