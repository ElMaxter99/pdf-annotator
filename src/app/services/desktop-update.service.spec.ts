import { TestBed } from '@angular/core/testing';
import { DesktopBridge, DesktopUpdateService, DesktopUpdateState } from './desktop-update.service';

function setup(initial: DesktopUpdateState) {
  let push: (s: DesktopUpdateState) => void = () => undefined;
  const bridge = {
    isDesktop: true,
    getUpdateState: () => Promise.resolve(initial),
    onUpdateState: (cb: (s: DesktopUpdateState) => void) => {
      push = cb;
      return () => undefined;
    },
    checkForUpdates: jasmine.createSpy('check').and.resolveTo(),
    downloadUpdate: jasmine.createSpy('download').and.resolveTo(),
    setUpdateChannel: jasmine.createSpy('channel').and.resolveTo(),
    cancelUpdate: jasmine.createSpy('cancel').and.resolveTo(),
    installUpdate: jasmine.createSpy('install').and.resolveTo(),
    installOnQuit: jasmine.createSpy('onQuit').and.resolveTo(),
    openReleasePage: jasmine.createSpy('open').and.resolveTo(),
  } as unknown as DesktopBridge;
  (window as unknown as { desktop?: DesktopBridge }).desktop = bridge;
  const service = TestBed.inject(DesktopUpdateService);
  return { service, bridge, push: (s: DesktopUpdateState) => push(s) };
}

describe('DesktopUpdateService', () => {
  afterEach(() => delete (window as unknown as { desktop?: unknown }).desktop);

  it('no hace nada fuera de la app de escritorio', () => {
    const service = TestBed.inject(DesktopUpdateService);
    expect(service.isDesktop).toBeFalse();
    expect(service.cardVisible()).toBeFalse();
  });

  it('muestra la tarjeta al haber versión nueva y «Más tarde» la oculta pero deja el punto del chip', () => {
    const { service, push } = setup({ status: 'idle', mode: 'auto', current: '1.5.0' });
    push({ status: 'available', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    expect(service.cardVisible()).toBeTrue();
    service.later();
    expect(service.cardVisible()).toBeFalse();
    expect(service.chipDot()).toBe('accent');
    service.openPanel();
    expect(service.panelOpen()).toBeTrue();
    service.closePanel();
    expect(service.panelOpen()).toBeFalse();
  });

  it('con el panel abierto la tarjeta se oculta y el punto cambia según el estado', () => {
    const { service, push } = setup({ status: 'idle', mode: 'auto', current: '1.5.0' });
    expect(service.chipDot()).toBe('');
    push({ status: 'available', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    service.openPanel();
    expect(service.cardVisible()).toBeFalse();
    push({ status: 'downloading', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    expect(service.chipDot()).toBe('warn');
    push({ status: 'error', mode: 'auto', current: '1.5.0' });
    expect(service.chipDot()).toBe('danger');
  });

  it('«Buscar ahora» comprueba una vez y se ignora mientras ya se está comprobando', () => {
    const { service, bridge, push } = setup({ status: 'idle', mode: 'auto', current: '1.5.0' });
    service.checkNow();
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
    push({ status: 'idle', mode: 'auto', current: '1.5.0', checking: true });
    service.checkNow();
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('el menú nativo abre el panel y, si lo pide, busca ahora', () => {
    let open: (e: { check: boolean }) => void = () => undefined;
    (window as unknown as { desktop?: unknown }).desktop = {
      isDesktop: true,
      getUpdateState: () => Promise.resolve({ status: 'idle', mode: 'auto', current: '1.5.0' }),
      onUpdateState: () => () => undefined,
      onOpenUpdates: (cb: (e: { check: boolean }) => void) => ((open = cb), () => undefined),
      checkForUpdates: jasmine.createSpy('check').and.resolveTo(),
    };
    const service = TestBed.inject(DesktopUpdateService);
    open({ check: false });
    expect(service.panelOpen()).toBeTrue();
    open({ check: true });
    expect((window as unknown as { desktop: DesktopBridge }).desktop.checkForUpdates).toHaveBeenCalled();
  });

  it('una versión aún más nueva vuelve a avisar aunque se pospusiera la anterior', () => {
    const { service, push } = setup({ status: 'idle', mode: 'auto', current: '1.5.0' });
    push({ status: 'available', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    service.later();
    push({ status: 'available', mode: 'auto', current: '1.5.0', version: '1.7.0' });
    expect(service.cardVisible()).toBeTrue();
  });

  it('en modo manual el botón abre la página de descargas en vez de descargar', () => {
    const { service, bridge, push } = setup({ status: 'idle', mode: 'manual', current: '1.5.0' });
    push({ status: 'available', mode: 'manual', current: '1.5.0', version: '1.6.0' });
    service.download();
    expect(bridge.openReleasePage).toHaveBeenCalled();
    expect(bridge.downloadUpdate).not.toHaveBeenCalled();
  });

  it('en modo automático descarga, y «Al cerrar la app» oculta la tarjeta de «lista»', () => {
    const { service, bridge, push } = setup({ status: 'idle', mode: 'auto', current: '1.5.0' });
    push({ status: 'available', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    service.download();
    expect(bridge.downloadUpdate).toHaveBeenCalled();
    push({ status: 'ready', mode: 'auto', current: '1.5.0', version: '1.6.0' });
    expect(service.cardVisible()).toBeTrue();
    service.restartOnQuit();
    expect(bridge.installOnQuit).toHaveBeenCalled();
    expect(service.cardVisible()).toBeFalse();
  });

  it('canal: estable por defecto, setChannel avisa al proceso principal y detecta una prueba instalada', () => {
    const { service, bridge, push } = setup({
      status: 'idle',
      mode: 'auto',
      current: '1.9.0-rc.1',
    });
    push({ status: 'idle', mode: 'auto', current: '1.9.0-rc.1' });
    expect(service.channel()).toBe('stable');
    expect(service.currentIsPrerelease()).toBeTrue();
    service.setChannel('beta');
    expect(service.channel()).toBe('beta');
    expect(bridge.setUpdateChannel).toHaveBeenCalledWith('beta');
    push({ status: 'idle', mode: 'auto', current: '1.8.4', channel: 'stable' });
    expect(service.channel()).toBe('stable');
    expect(service.currentIsPrerelease()).toBeFalse();
  });
});
