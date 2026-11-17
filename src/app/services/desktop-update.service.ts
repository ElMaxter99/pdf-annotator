import { Injectable, computed, signal } from '@angular/core';
import type { ProjectsBridge } from '../models/project.model';

export type DesktopUpdateStatus = 'idle' | 'available' | 'downloading' | 'ready' | 'installing' | 'error';

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
  /** Canal elegido: «stable» (solo finales) o «beta» (también versiones de prueba RC). */
  channel?: UpdateChannel;
  /** La versión ofrecida es una prueba (X.Y.Z-rc.N). */
  prerelease?: boolean;
  /** Se está comprobando si hay versión nueva. */
  checking?: boolean;
  /** Última comprobación terminada (ms desde 1970); sin valor = aún no se ha comprobado en esta sesión. */
  lastChecked?: number;
  /** Ya se eligió instalar la versión descargada al cerrar la app. */
  installOnQuit?: boolean;
  /** La instalación pedirá la contraseña del sistema (Linux .deb/.rpm). */
  needsPassword?: boolean;
  /** Falló la instalación: «cancelled» (contraseña cancelada) u otro motivo; la descarga se conserva. */
  installError?: 'cancelled' | 'failed';
  /** Motivo técnico del fallo (una línea) para mostrar y copiar. */
  installDetail?: string;
  /** Primera ejecución tras actualizar: versión de la que se venía. */
  justUpdatedFrom?: string;
}

/** Color del punto del chip de versión: nueva versión (accent), en curso o pendiente (warn) o fallo (danger). */
export type ChipDot = '' | 'accent' | 'warn' | 'danger';

export type UpdateChannel = 'stable' | 'beta';

/** «1.9.0-rc.2» → true. */
export const isPrereleaseVersion = (version: string | undefined): boolean => /-rc\.\d+$/.test(version ?? '');

/** Puente que expone `desktop/preload.cjs` en la app de escritorio (Electron). En la web no existe. */
export interface DesktopBridge {
  isDesktop: true;
  /** Puerto del ayudante de IA que lanza la app (4310 si estaba libre). */
  helperPort?: number;
  /** Proyectos locales (carpeta en el disco). */
  projects?: ProjectsBridge;
  getUpdateState(): Promise<DesktopUpdateState>;
  /** El menú nativo (Ayuda) pide abrir el panel; `check` = además buscar ahora. */
  onOpenUpdates?(callback: (event: { check: boolean }) => void): () => void;
  onUpdateState(callback: (state: DesktopUpdateState) => void): () => void;
  checkForUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  setUpdateChannel(channel: UpdateChannel): Promise<void>;
  cancelUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  installOnQuit(): Promise<void>;
  openReleasePage(): Promise<void>;
  dismissUpdated?(): Promise<void>;
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
  private readonly installOnQuitLocal = signal(false);
  private readonly installErrorHidden = signal(false);
  private readonly updatedHidden = signal(false);
  /** Panel «Versión y actualizaciones» abierto (lo abre el chip de versión o el menú Ayuda). */
  readonly panelOpen = signal(false);

  readonly isDesktop = this.bridge !== null;
  readonly channel = computed<UpdateChannel>(() => (this.state().channel === 'beta' ? 'beta' : 'stable'));
  /** La app instalada es una versión de prueba (X.Y.Z-rc.N). */
  readonly currentIsPrerelease = computed(() => isPrereleaseVersion(this.state().current));
  readonly installOnQuitChosen = computed(() => this.installOnQuitLocal() || this.state().installOnQuit === true);
  /** Diálogo «Instalando…» (AC-13): cubre la ventana mientras se instala o si la instalación falló. */
  readonly installDialog = computed<'installing' | 'error' | null>(() => {
    const s = this.state();
    if (s.status === 'installing') return 'installing';
    return s.status === 'ready' && s.installError && !this.installErrorHidden() ? 'error' : null;
  });
  /** Aviso de «se actualizó a X» tras reabrir con la versión nueva. */
  readonly justUpdated = computed(() => {
    const s = this.state();
    return s.justUpdatedFrom && s.status !== 'installing' && !this.updatedHidden() ? { from: s.justUpdatedFrom, to: s.current } : null;
  });
  readonly cardVisible = computed(() => {
    if (this.panelOpen() || this.installDialog()) return false;
    const s = this.state();
    if (s.status === 'available') return this.deferredVersion() !== s.version;
    if (s.status === 'error') return !this.errorHidden();
    return s.status === 'downloading' || (s.status === 'ready' && !this.installOnQuitChosen());
  });
  /** Punto del chip de versión: sigue encendido aunque se haya pospuesto el aviso. */
  readonly chipDot = computed<ChipDot>(() => {
    const s = this.state();
    if (s.status === 'available') return 'accent';
    if (s.status === 'downloading' || s.status === 'ready' || s.status === 'installing') return 'warn';
    return s.status === 'error' ? 'danger' : '';
  });

  constructor() {
    if (!this.bridge) return;
    this.bridge.getUpdateState().then((s) => this.apply(s)).catch(() => undefined);
    this.bridge.onUpdateState((s) => this.apply(s));
    this.bridge.onOpenUpdates?.((e) => {
      this.openPanel();
      if (e.check) this.checkNow();
    });
  }

  openPanel(): void {
    if (this.isDesktop) this.panelOpen.set(true);
  }
  closePanel(): void {
    this.panelOpen.set(false);
  }
  /** «Buscar ahora»: ignora si ya hay una comprobación o una descarga en curso. */
  checkNow(): void {
    const s = this.state();
    if (s.checking || s.status === 'downloading') return;
    this.errorHidden.set(false);
    void this.bridge?.checkForUpdates();
  }

  private apply(next: DesktopUpdateState): void {
    if (next.status !== 'error') this.errorHidden.set(false);
    if (next.status === 'installing') this.installErrorHidden.set(false);
    this.state.set(next);
  }

  download(): void {
    if (this.state().mode === 'manual') {
      void this.bridge?.openReleasePage();
      return;
    }
    void this.bridge?.downloadUpdate();
  }
  setChannel(channel: UpdateChannel): void {
    // Optimista: la interfaz cambia al instante y el proceso principal confirma con su estado.
    this.state.update((s) => ({ ...s, channel }));
    void this.bridge?.setUpdateChannel(channel);
  }
  cancel(): void {
    void this.bridge?.cancelUpdate();
  }
  later(): void {
    this.deferredVersion.set(this.state().version ?? null);
  }
  dismissError(): void {
    this.errorHidden.set(true);
  }
  retry(): void {
    this.errorHidden.set(false);
    void this.bridge?.checkForUpdates();
  }
  restartNow(): void {
    this.installErrorHidden.set(false);
    void this.bridge?.installUpdate();
  }
  restartOnQuit(): void {
    this.installOnQuitLocal.set(true);
    void this.bridge?.installOnQuit();
  }
  /** «Ahora no» tras un fallo: vuelve la tarjeta «lista para instalar». */
  dismissInstallError(): void {
    this.installErrorHidden.set(true);
  }
  dismissUpdated(): void {
    this.updatedHidden.set(true);
    void this.bridge?.dismissUpdated?.();
  }
  openNotes(): void {
    void this.bridge?.openReleasePage();
  }
}
