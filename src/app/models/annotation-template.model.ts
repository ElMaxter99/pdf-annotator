import { PageAnnotations } from './annotation.model';
import { GuideSettings } from './guide-settings.model';

export type AnnotationTemplateOrigin = 'local' | 'remote' | 'hybrid' | 'system';

export interface AnnotationTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt?: number;
  version?: number;
  workspaceId?: string | null;
  origin?: AnnotationTemplateOrigin;
  syncedAt?: number | null;
  pages: PageAnnotations[];
  guidesEnabled: boolean;
  guideSettings: GuideSettings;
}
