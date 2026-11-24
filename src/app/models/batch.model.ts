import type { PageAnnotations, PageField } from './annotation.model';
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
  /** Fields edited in the review before applying (row id → field with its x,y in B); untrusted when read back. */
  readonly edits?: Readonly<Record<string, PageField>>;
}

export type BatchItemStatus = 'review' | 'ready';

/** Explicit link between a field of B and a field of A that has another name. */
export interface FieldLink {
  /** Page number (same in A and B). */
  readonly page: number;
  readonly b: string;
  readonly a: string;
}

/** Where a row of the page table comes from (P-78 a P-81). */
export type PageMapOrigin = 'auto' | 'manual' | 'number' | 'new';

/** Table of pages of one pair: for every page of B (index 0 = page 1) the page of A it equals, or `null`. */
export interface PageMapData {
  readonly pairs: readonly (number | null)[];
  readonly origins: readonly PageMapOrigin[];
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
  /** Which page of A each page of B is compared with; unset = by page number (as always). */
  readonly pageMap?: PageMapData;
  /** Last AI proposal for this pair, waiting for review. */
  readonly aiProposal?: AiSavedProposal;
  /** Instructions for the AI for this PDF only (A6); unset = the batch ones apply, `''` = none for this PDF. */
  readonly aiInstructions?: string;
  readonly status: BatchItemStatus;
  /** When `status` last really changed (review ↔ ready). Unset in batches saved before it existed. */
  readonly statusAt?: number;
  readonly updatedAt: number;
}
