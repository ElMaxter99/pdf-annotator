import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map } from 'rxjs/operators';

import { PageAnnotations, PageField } from '../models/annotation.model';
import { AnnotationTemplate } from '../models/annotation-template.model';
import { GuideSettings, cloneGuideSettings } from '../models/guide-settings.model';
import { API_BASE_URL } from '../config/api.config';
import { SessionService } from './session.service';

interface CloudAnnotationTemplateDto {
  id: string;
  name: string;
  version: number;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  guidesEnabled: boolean;
  guideSettings: GuideSettings;
  pages: PageAnnotations[];
}

interface CloudTemplatePayload {
  name: string;
  version: number;
  guidesEnabled: boolean;
  guideSettings: GuideSettings;
  pages: PageAnnotations[];
}

@Injectable({ providedIn: 'root' })
export class CloudTemplatesService {
  constructor(
    @Inject(API_BASE_URL) private readonly apiBaseUrl: string,
    private readonly http: HttpClient,
    private readonly sessionService: SessionService
  ) {}

  listTemplates(workspaceId?: string): Observable<AnnotationTemplate[]> {
    const targetWorkspace = workspaceId ?? this.sessionService.getActiveWorkspaceId();
    if (!targetWorkspace) {
      return of([]);
    }

    return this.http
      .get<CloudAnnotationTemplateDto[]>(
        this.buildUrl(`/workspaces/${encodeURIComponent(targetWorkspace)}/templates`),
        { headers: this.buildHeaders() }
      )
      .pipe(map((items) => items.map((item) => this.mapFromDto(item))));
  }

  saveTemplate(template: AnnotationTemplate, workspaceId?: string): Observable<AnnotationTemplate> {
    const targetWorkspace = workspaceId ?? template.workspaceId ?? this.sessionService.getActiveWorkspaceId();
    if (!targetWorkspace) {
      return throwError(() => new Error('No hay un espacio de trabajo seleccionado.'));
    }

    const expectedVersion = template.version ?? 0;
    const payload = this.mapToPayload(template, expectedVersion);
    const url = this.buildUrl(
      `/workspaces/${encodeURIComponent(targetWorkspace)}/templates/${encodeURIComponent(template.id)}`
    );

    return this.http
      .put<CloudAnnotationTemplateDto>(url, payload, {
        headers: this.buildHeaders(undefined, expectedVersion),
      })
      .pipe(map((item) => this.mapFromDto(item)));
  }

  deleteTemplate(id: string, workspaceId?: string): Observable<void> {
    const targetWorkspace = workspaceId ?? this.sessionService.getActiveWorkspaceId();
    if (!targetWorkspace) {
      return throwError(() => new Error('No hay un espacio de trabajo seleccionado.'));
    }

    const url = this.buildUrl(
      `/workspaces/${encodeURIComponent(targetWorkspace)}/templates/${encodeURIComponent(id)}`
    );
    return this.http.delete<void>(url, { headers: this.buildHeaders() });
  }

  private buildHeaders(tokenOverride?: string | null, ifMatchVersion?: number): HttpHeaders {
    const token = tokenOverride ?? this.sessionService.getToken();
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    if (ifMatchVersion !== undefined) {
      headers = headers.set('If-Match', `W/"${ifMatchVersion}"`);
    }

    return headers;
  }

  private buildUrl(path: string): string {
    if (!this.apiBaseUrl) {
      throw new Error('No se configuró una URL base para la API.');
    }

    return `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private mapFromDto(dto: CloudAnnotationTemplateDto): AnnotationTemplate {
    return {
      id: dto.id,
      name: dto.name,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      version: dto.version,
      workspaceId: dto.workspaceId,
      origin: 'remote',
      syncedAt: Date.now(),
      guidesEnabled: dto.guidesEnabled,
      guideSettings: cloneGuideSettings(dto.guideSettings),
      pages: this.clonePages(dto.pages),
    };
  }

  private mapToPayload(template: AnnotationTemplate, version: number): CloudTemplatePayload {
    return {
      name: template.name,
      version,
      guidesEnabled: template.guidesEnabled,
      guideSettings: cloneGuideSettings(template.guideSettings),
      pages: this.clonePages(template.pages),
    };
  }

  private clonePages(pages: readonly PageAnnotations[]): PageAnnotations[] {
    return pages.map((page) => ({
      num: page.num,
      fields: page.fields.map((field): PageField => ({ ...field })),
    }));
  }
}
