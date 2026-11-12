import { Injectable, computed, signal } from '@angular/core';

export type DesktopUpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

export interface DesktopUpdateState {
  status: DesktopUpdateStatus;
  mode: 'auto' | 'manual';
  current: string;
  version?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  notesUrl?: string;
  error?: string;
}

/** Puente que expone `desktop/preload.cjs` en la app de escritorio (Electron). En la web no existe. */
export interface DesktopBridge {
  isDesktop: true;
  getUpdateState(): Promise<DesktopUpdateState>;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  cancelUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  installOnQuit(): Promise<void>;
  openReleasePage(): Promise<void>;
}

export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as unknown as { desktop?: DesktopBridge }).desktop;
  return bridge?.isDesktop === true ? bridge : null;
}

/** Estado del aviso de actualización de la app de escritorio. Sin puente (web) no hace nada. */
@Injectable({ providedIn: 'root' })
export class DesktopUpdateService {
  private readonly bridge = getDesktopBridge();
  readonly state = signal<DesktopUpdateState>({ status: 'idle', mode: 'auto', current: '' });
  /** «Más tarde»: versión cuyo aviso se ha dejado para el próximo arranque (solo en memoria). */
  private readonly deferredVersion = signal<string | null>(null);
  private readonly errorHidden = signal(false);
  readonly installOnQuitChosen = signal(false);

  readonly isDesktop = this.bridge !== null;
  readonly cardVisible = computed(() => {
    const s = this.state();
    if (s.status === 'available') return this.deferredVersion() !== s.version;
    if (s.status === 'error') return !this.errorHidden();
    return s.status === 'downloading' || (s.status === 'ready' && !this.installOnQuitChosen());
  });
  /** Hay versión nueva que el usuario dejó para más tarde: se recupera desde el menú. */
  readonly pending = computed(() => this.state().status === 'available' && this.deferredVersion() === this.state().version);

  constructor() {
    if (!this.bridge) return;
    this.bridge.getUpdateState().then((s) => this.apply(s)).catch(() => undefined);
    this.bridge.onUpdateState((s) => this.apply(s));
  }

  private apply(next: DesktopUpdateState): void {
    if (next.status !== 'error') this.errorHidden.set(false);
    this.state.set(next);
  }

  download(): void {
    if (this.state().mode === 'manual') {
      void this.bridge?.openReleasePage();
      return;
    }
    void this.bridge?.downloadUpdate();
  }
  cancel(): void {
    void this.bridge?.cancelUpdate();
  }
  later(): void {
    this.deferredVersion.set(this.state().version ?? null);
  }
  recover(): void {
    this.deferredVersion.set(null);
  }
  dismissError(): void {
    this.errorHidden.set(true);
  }
  retry(): void {
    this.errorHidden.set(false);
    void this.bridge?.checkForUpdates();
  }
  restartNow(): void {
    void this.bridge?.installUpdate();
  }
  restartOnQuit(): void {
    this.installOnQuitChosen.set(true);
    void this.bridge?.installOnQuit();
  }
  openNotes(): void {
    void this.bridge?.openReleasePage();
  }
}
