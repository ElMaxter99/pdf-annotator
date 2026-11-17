import {
  resolveShortcut,
  type ShortcutAction,
  type ShortcutContext,
  type ShortcutKeyInput,
} from './shortcuts.utils';

const ctx = (over: Partial<ShortcutContext> = {}): ShortcutContext => ({
  pageMapOpen: false,
  paletteOpen: false,
  aboutOpen: false,
  shortcutsOpen: false,
  zoomMenuOpen: false,
  hasDocument: true,
  previewOpen: false,
  editing: false,
  hasSelection: false,
  hasClipboard: false,
  canUndo: true,
  canRedo: true,
  comparing: false,
  splitActive: false,
  targetEditable: false,
  targetBlocksPlain: false,
  ...over,
});

const key = (k: string, over: Partial<ShortcutKeyInput> = {}): ShortcutKeyInput => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  ...over,
});

const ctrl = (k: string, over: Partial<ShortcutKeyInput> = {}) =>
  key(k, { ctrlKey: true, ...over });
const action = (input: ShortcutKeyInput, c: ShortcutContext = ctx()) =>
  resolveShortcut(input, c)?.action ?? null;

describe('resolveShortcut · estado global', () => {
  it('con el diálogo de páginas abierto no gestiona nada', () => {
    const c = ctx({ pageMapOpen: true });
    expect(action(ctrl('k'), c)).toBeNull();
    expect(action(key('b'), c)).toBeNull();
  });

  it('Ctrl/⌘+K abre la paleta salvo con «Acerca de» o atajos abiertos', () => {
    expect(action(ctrl('k'))).toBe('togglePalette');
    expect(action(key('k', { metaKey: true }))).toBe('togglePalette');
    expect(action(ctrl('k'), ctx({ aboutOpen: true }))).toBeNull();
    expect(action(ctrl('k'), ctx({ shortcutsOpen: true }))).toBeNull();
    expect(action(ctrl('k', { shiftKey: true }))).toBeNull();
  });

  it('con la paleta abierta el resto de atajos se ignoran, pero Ctrl+K la cierra', () => {
    const c = ctx({ paletteOpen: true });
    expect(action(key('b'), c)).toBeNull();
    expect(action(ctrl('z'), c)).toBeNull();
    expect(action(ctrl('k'), c)).toBe('togglePalette');
  });
});

describe('resolveShortcut · con Ctrl/⌘', () => {
  it('Ctrl+S aplica el JSON aunque se escriba en un campo', () => {
    expect(action(ctrl('s'), ctx({ targetEditable: true }))).toBe('applyJson');
  });

  it('deshacer y rehacer dependen del historial', () => {
    expect(action(ctrl('z'))).toBe('undo');
    expect(action(ctrl('z'), ctx({ canUndo: false }))).toBeNull();
    expect(action(ctrl('y'))).toBe('redo');
    expect(action(ctrl('z', { shiftKey: true }))).toBe('redo');
    expect(action(ctrl('y'), ctx({ canRedo: false }))).toBeNull();
    expect(action(ctrl('z', { shiftKey: true }), ctx({ canRedo: false }))).toBeNull();
  });

  it('⌘ funciona igual que Ctrl', () => {
    expect(action(key('z', { metaKey: true }))).toBe('undo');
    expect(action(key('a', { metaKey: true }))).toBe('selectAll');
  });

  it('el zoom con Ctrl necesita PDF y no actúa escribiendo ni con diálogos abiertos', () => {
    expect(action(ctrl('+'))).toBe('zoomIn');
    expect(action(ctrl('='))).toBe('zoomIn');
    expect(action(ctrl('-'))).toBe('zoomOut');
    expect(action(ctrl('_'))).toBe('zoomOut');
    expect(action(ctrl('0'))).toBe('zoomActual');
    expect(action(ctrl('+'), ctx({ hasDocument: false }))).toBeNull();
    expect(action(ctrl('+'), ctx({ targetEditable: true }))).toBeNull();
    expect(action(ctrl('+'), ctx({ aboutOpen: true }))).toBeNull();
    expect(action(ctrl('+'), ctx({ shortcutsOpen: true }))).toBeNull();
  });

  it('seleccionar, copiar, pegar y duplicar', () => {
    expect(action(ctrl('a'))).toBe('selectAll');
    expect(action(ctrl('c'))).toBe('copy');
    expect(action(ctrl('v'), ctx({ hasClipboard: true }))).toBe('paste');
    expect(action(ctrl('v'))).toBeNull();
    expect(action(ctrl('d'), ctx({ hasSelection: true }))).toBe('duplicate');
    expect(action(ctrl('d'))).toBeNull();
  });

  it('copiar y pegar dejan decidir a la página si se cancela el evento', () => {
    expect(resolveShortcut(ctrl('c'), ctx())?.preventDefault).toBeFalse();
    expect(resolveShortcut(ctrl('v'), ctx({ hasClipboard: true }))?.preventDefault).toBeFalse();
    expect(resolveShortcut(ctrl('a'), ctx())?.preventDefault).toBeTrue();
  });

  it('las acciones de selección se ignoran sin PDF, escribiendo o con un editor abierto', () => {
    for (const over of [
      { hasDocument: false },
      { targetEditable: true },
      { previewOpen: true },
      { editing: true },
    ]) {
      expect(action(ctrl('a'), ctx(over))).toBeNull();
      expect(action(ctrl('c'), ctx(over))).toBeNull();
    }
  });

  it('una letra sin atajo no hace nada', () => {
    expect(action(ctrl('q'))).toBeNull();
  });
});

describe('resolveShortcut · sin modificadores', () => {
  it('no actúa si el evento ya se canceló o con Alt', () => {
    expect(action(key('b', { defaultPrevented: true }))).toBeNull();
    expect(action(key('b', { altKey: true }))).toBeNull();
  });

  it('Escape cierra primero «Acerca de», luego el menú de zoom y luego los atajos', () => {
    const all = ctx({ aboutOpen: true, zoomMenuOpen: true, shortcutsOpen: true });
    expect(action(key('escape'), all)).toBe('closeAbout');
    expect(action(key('escape'), ctx({ zoomMenuOpen: true, shortcutsOpen: true }))).toBe(
      'closeZoomMenu',
    );
    expect(action(key('escape'), ctx({ shortcutsOpen: true }))).toBe('closeShortcuts');
  });

  it('Escape cierra un diálogo aunque el foco esté en un botón', () => {
    expect(action(key('escape'), ctx({ aboutOpen: true, targetBlocksPlain: true }))).toBe(
      'closeAbout',
    );
  });

  it('con el foco en un campo o botón no se gestionan teclas sueltas', () => {
    const c = ctx({ targetBlocksPlain: true, hasSelection: true });
    for (const k of ['b', '?', 'arrowleft', 'delete', ' ', '0', 'home']) {
      expect(action(key(k), c)).toBeNull();
    }
  });

  it('con selección: Escape, Supr/Retroceso y flechas', () => {
    const c = ctx({ hasSelection: true });
    expect(action(key('escape'), c)).toBe('clearSelection');
    expect(action(key('delete'), c)).toBe('deleteSelection');
    expect(action(key('backspace'), c)).toBe('deleteSelection');
    expect(action(key('arrowleft'), c)).toBe('nudgeLeft');
    expect(action(key('arrowright'), c)).toBe('nudgeRight');
    expect(action(key('arrowup'), c)).toBe('nudgeUp');
    expect(action(key('arrowdown', { shiftKey: true }), c)).toBe('nudgeDown');
  });

  it('con selección pero con un editor abierto, las flechas cambian de página', () => {
    expect(action(key('arrowleft'), ctx({ hasSelection: true, editing: true }))).toBe('prevPage');
    expect(action(key('delete'), ctx({ hasSelection: true, previewOpen: true }))).toBeNull();
  });

  it('las flechas y PgUp/PgDn cambian de página', () => {
    expect(action(key('arrowleft'))).toBe('prevPage');
    expect(action(key('pageup'))).toBe('prevPage');
    expect(action(key('arrowright'))).toBe('nextPage');
    expect(action(key('pagedown'))).toBe('nextPage');
    expect(action(key('arrowright'), ctx({ hasDocument: false }))).toBeNull();
  });

  it('Mayús + flechas mueven la página de A solo al comparar', () => {
    const c = ctx({ comparing: true });
    expect(action(key('arrowleft', { shiftKey: true }), c)).toBe('prevPageA');
    expect(action(key('arrowright', { shiftKey: true }), c)).toBe('nextPageA');
    expect(action(key('arrowleft', { shiftKey: true }))).toBe('prevPage');
    expect(action(key('arrowleft'), c)).toBe('prevPage');
  });

  it('Inicio y Fin saltan a la primera y última página', () => {
    expect(action(key('home'))).toBe('firstPage');
    expect(action(key('end'))).toBe('lastPage');
    expect(action(key('end'), ctx({ hasDocument: false }))).toBeNull();
  });

  it('zoom y ajustes', () => {
    expect(action(key('+'))).toBe('zoomIn');
    expect(action(key('='))).toBe('zoomIn');
    expect(action(key('-'))).toBe('zoomOut');
    expect(action(key('_'))).toBe('zoomOut');
    expect(action(key('0'))).toBe('fitWidth');
    expect(action(key('!', { code: 'Digit1', shiftKey: true }))).toBe('fitPage');
    expect(
      action(key('!', { code: 'Digit1', shiftKey: true }), ctx({ hasDocument: false })),
    ).toBeNull();
  });

  it('Espacio prepara mover el lienzo salvo con un editor abierto', () => {
    expect(action(key(' '))).toBe('panReady');
    expect(action(key(' '), ctx({ editing: true }))).toBeNull();
    expect(action(key(' '), ctx({ previewOpen: true }))).toBeNull();
    expect(action(key(' '), ctx({ hasDocument: false }))).toBeNull();
  });

  it('? abre los atajos y B pliega el panel sin necesitar PDF', () => {
    const empty = ctx({ hasDocument: false });
    expect(action(key('?'), empty)).toBe('toggleShortcuts');
    expect(action(key('b'), empty)).toBe('toggleSidebar');
  });

  it('L enlaza las páginas solo con la vista dividida', () => {
    expect(action(key('l'), ctx({ splitActive: true }))).toBe('toggleSplitLink');
    expect(action(key('l'))).toBeNull();
  });

  it('una tecla sin atajo no hace nada', () => {
    const none: ShortcutAction | null = action(key('q'));
    expect(none).toBeNull();
  });
});
