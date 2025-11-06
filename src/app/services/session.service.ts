import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, Observable, catchError, map, of, tap, throwError } from 'rxjs';

import { API_BASE_URL } from '../config/api.config';

export interface CloudUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export type WorkspaceRole = 'owner' | 'editor' | 'viewer';

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
  updatedAt?: string;
}

export type SessionStatus = 'signed-out' | 'authenticating' | 'authenticated';

export interface SessionState {
  status: SessionStatus;
  user: CloudUser | null;
  token: string | null;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
  error: string | null;
}

interface LoginPayload {
  email: string;
  password: string;
  projectKey?: string;
}

interface LoginResponse {
  accessToken: string;
  user: CloudUser;
  workspaces: WorkspaceSummary[];
  defaultWorkspaceId?: string | null;
}

interface PersistedSession {
  token: string;
  user: CloudUser;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string | null;
}

@Injectable({ providedIn: 'root' })

export class SessionService {
  private readonly storageKey = 'pdf-annotator.session';
  private readonly stateSubject = new BehaviorSubject<SessionState>(this.createSignedOutState());

  readonly session$ = this.stateSubject.asObservable();
  readonly activeWorkspace$ = this.session$.pipe(map((state) => state.activeWorkspaceId));

  constructor(
    @Inject(API_BASE_URL) private readonly apiBaseUrl: string,
    private readonly http: HttpClient
  ) {
    this.restoreFromStorage();
  }

  login(payload: LoginPayload): Observable<void> {
    this.stateSubject.next({ ...this.stateSubject.value, status: 'authenticating', error: null });

    return this.http
      .post<LoginResponse>(this.buildUrl('/auth/sessions'), payload, { headers: this.buildHeaders(false) })
      .pipe(
        tap((response) => {
          const activeWorkspaceId = this.ensureWorkspace(
            response.defaultWorkspaceId ?? null,
            response.workspaces
          );
          const nextState: SessionState = {
            status: 'authenticated',
            user: response.user,
            token: response.accessToken,
            workspaces: response.workspaces,
            activeWorkspaceId,
            error: null,
          };
          this.stateSubject.next(nextState);
          this.persistSession(nextState);
        }),
        map(() => void 0),
        catchError((error) => {
          const message = this.resolveErrorMessage(error);
          const fallback = { ...this.createSignedOutState(), error: message };
          this.stateSubject.next(fallback);
          this.clearSession();
          return throwError(() => error);
        })
      );
  }

  logout(): void {
    this.stateSubject.next(this.createSignedOutState());
    this.clearSession();
  }

  selectWorkspace(workspaceId: string | null): void {
    const current = this.stateSubject.value;
    if (current.status !== 'authenticated') {
      return;
    }

    const normalized = this.ensureWorkspace(workspaceId, current.workspaces);
    const nextState: SessionState = { ...current, activeWorkspaceId: normalized };
    this.stateSubject.next(nextState);
    this.persistSession(nextState);
  }

  refreshWorkspaces(): Observable<WorkspaceSummary[]> {
    const token = this.getToken();
    if (!token) {
      return of([]);
    }

    return this.http
      .get<WorkspaceSummary[]>(this.buildUrl('/workspaces'), { headers: this.buildHeaders(true) })
      .pipe(
        tap((workspaces) => {
          const current = this.stateSubject.value;
          if (current.status !== 'authenticated') {
            return;
          }

          const activeWorkspaceId = this.ensureWorkspace(current.activeWorkspaceId, workspaces);
          const nextState: SessionState = {
            ...current,
            workspaces,
            activeWorkspaceId,
            error: null,
          };
          this.stateSubject.next(nextState);
          this.persistSession(nextState);
        })
      );
  }

  getToken(): string | null {
    return this.stateSubject.value.token;
  }

  getActiveWorkspaceId(): string | null {
    return this.stateSubject.value.activeWorkspaceId;
  }

  getSnapshot(): SessionState {
    const state = this.stateSubject.value;
    return {
      ...state,
      user: state.user ? { ...state.user } : null,
      workspaces: state.workspaces.map((workspace) => ({ ...workspace })),
    };
  }

  private restoreFromStorage(): void {
    const persisted = this.readFromStorage();
    if (!persisted) {
      return;
    }

    const nextState: SessionState = {
      status: 'authenticated',
      user: persisted.user,
      token: persisted.token,
      workspaces: persisted.workspaces,
      activeWorkspaceId: this.ensureWorkspace(persisted.activeWorkspaceId, persisted.workspaces),
      error: null,
    };

    this.stateSubject.next(nextState);
  }

  private ensureWorkspace(
    preferredWorkspaceId: string | null,
    workspaces: readonly WorkspaceSummary[]
  ): string | null {
    if (preferredWorkspaceId && workspaces.some((workspace) => workspace.id === preferredWorkspaceId)) {
      return preferredWorkspaceId;
    }

    const firstWorkspace = workspaces[0];
    return firstWorkspace ? firstWorkspace.id : null;
  }

  private createSignedOutState(): SessionState {
    return {
      status: 'signed-out',
      user: null,
      token: null,
      workspaces: [],
      activeWorkspaceId: null,
      error: null,
    };
  }

  private persistSession(state: SessionState): void {
    if (state.status !== 'authenticated' || !state.token || !state.user) {
      this.clearSession();
      return;
    }

    const payload: PersistedSession = {
      token: state.token,
      user: state.user,
      workspaces: state.workspaces,
      activeWorkspaceId: state.activeWorkspaceId,
    };

    this.writeToStorage(payload);
  }

  private clearSession(): void {
    const storage = this.getStorage();
    storage?.removeItem(this.storageKey);
  }

  private buildHeaders(includeAuth: boolean): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    if (includeAuth) {
      const token = this.getToken();
      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return headers;
  }

  private buildUrl(path: string): string {
    if (!this.apiBaseUrl) {
      throw new Error('No se configuró una URL base para la API.');
    }

    return `${this.apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private resolveErrorMessage(error: unknown): string {
    if (!error || typeof error !== 'object') {
      return 'No se pudo iniciar sesión, intenta nuevamente.';
    }

    if ('error' in error && typeof (error as { error?: unknown }).error === 'object') {
      const payload = (error as { error?: { message?: string } }).error;
      if (payload?.message) {
        return payload.message;
      }
    }

    return 'Credenciales inválidas o servicio no disponible.';
  }

  private readFromStorage(): PersistedSession | null {
    const storage = this.getStorage();
    if (!storage) {
      return null;
    }

    try {
      const raw = storage.getItem(this.storageKey);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as PersistedSession;
    } catch {
      return null;
    }
  }

  private writeToStorage(value: PersistedSession): void {
    const storage = this.getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(this.storageKey, JSON.stringify(value));
    } catch {
      // Evitamos romper el flujo por problemas de almacenamiento.
    }
  }

  private getStorage(): Storage | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      return window.localStorage;
    } catch {
      return null;
    }
  }
}
