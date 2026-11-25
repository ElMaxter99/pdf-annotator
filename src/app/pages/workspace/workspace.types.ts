import type { PageField } from '../../models/annotation.model';
import type { AdjustAnchorRow, AdjustField, AdjustMode } from '../../utils/adjust-session.utils';

// Tipos y constantes del editor (workspace.page.ts y sus archivos hermanos).

export const REFERENCE_MODE_KEY = 'pdf-annotator.batch.mode';
export const WHEEL_PAGING_KEY = 'pdf-annotator.wheelPaging';

export interface WheelEdgeIndicator {
  /** Which version the indicator is about when A and B have their own pages. */
  pane?: 'A' | 'B';
  kind: 'next' | 'prev' | 'last' | 'first' | 'now';
  progress: number;
  page: number;
  total: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Tooltip with the full mapField of an annotation (fixed window coordinates). */
export interface MapTip {
  prefix: string;
  tail: string;
  none: boolean;
  meta: string;
  left: number;
  top: number;
}

export type PreviewState = { page: number; field: PageField } | null;

export type EditState = {
  pageIndex: number;
  fieldIndex: number;
  field: PageField;
} | null;

export type JsonViewMode = 'text' | 'tree';

export type EditorMode = 'preview' | 'edit';

export const SIDEBAR_TABS = ['document', 'annotations', 'settings'] as const;
export type SidebarTab = (typeof SIDEBAR_TABS)[number];

export const AUTO_APPLY_JSON_DELAY_MS = 300;
export const SESSION_SAVE_DELAY_MS = 800;

export const MAX_JSON_IMPORT_BYTES = 5 * 1024 * 1024;

export interface AdjustSession {
  readonly phase: 'loading' | 'ready' | 'none' | 'noText';
  readonly progress: { page: number; total: number; common: number };
  readonly mode: AdjustMode;
  readonly tab: 'fields' | 'texts';
  readonly fields: AdjustField[];
  readonly anchors: AdjustAnchorRow[];
  /** Fields of A that B already has (kept, not copied). */
  readonly skipped: number;
  readonly textsA: number;
  readonly textsB: number;
  /** «Propuesta» shows B with the fields where the proposal puts them; «Original» where they are in A. */
  readonly view: 'proposal' | 'original';
  /** The list of fields and texts is open under the notice. */
  readonly open: boolean;
  /** Anchor pins are shown on both pages (always shown in the «Textos» tab). */
  readonly anchorsShown: boolean;
  /** Field or anchor under the pointer or the keyboard focus (highlighted on A and B). */
  readonly hover: string | null;
  readonly hoverAnchor: string | null;
  /** Field with its card open, and where the card goes (viewport pixels). */
  readonly selected: string | null;
  readonly card: { x: number; y: number } | null;
}

export const ADJUST_UI = {
  view: 'proposal',
  open: false,
  anchorsShown: false,
  hover: null,
  hoverAnchor: null,
  selected: null,
  card: null,
} as const;

/** Informative notices of the batch bar that can be closed (and found again in the bell). */
export type NoticeId = 'noTemplate' | 'pagesDiffer' | 'fit' | 'adjust' | 'ai';

/** Campo de B de una pareja: fila de la propuesta de la IA o campo ya puesto. */
export type PairRefB =
  | { kind: 'ai'; id: string; page: number }
  | { kind: 'field'; page: number; pageIndex: number; index: number };

/** Pareja activa: el campo de A (página propia y posición) y el de B; `flashUntil` = fin del destello. */
export interface PairTarget {
  aName: string;
  aPage: number | null;
  aX?: number;
  aY?: number;
  b: PairRefB | null;
  flashUntil?: number;
}
