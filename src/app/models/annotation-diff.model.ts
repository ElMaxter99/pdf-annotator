import { PageField } from './annotation.model';

export type DiffKind = 'added' | 'removed' | 'modified';

export type DiffResolution = 'pending' | 'accepted' | 'rejected';

export interface AnnotationDiffChange {
  readonly property: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface AnnotationDiff {
  readonly id: string;
  readonly page: number;
  readonly fieldKey: string;
  readonly kind: DiffKind;
  readonly baseField?: PageField;
  readonly targetField?: PageField;
  readonly changes?: AnnotationDiffChange[];
  readonly resolution: DiffResolution;
}
