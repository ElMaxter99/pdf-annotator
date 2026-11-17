/**
 * Reglas puras de los atajos de teclado del editor: dado el teclado y el estado de la página,
 * dicen qué acción toca (la página la ejecuta). Sin DOM ni Angular.
 */

export type ShortcutAction =
  | 'togglePalette'
  | 'applyJson'
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomActual'
  | 'selectAll'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'closeAbout'
  | 'closeZoomMenu'
  | 'closeShortcuts'
  | 'clearSelection'
  | 'deleteSelection'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'nudgeDown'
  | 'panReady'
  | 'fitPage'
  | 'fitWidth'
  | 'toggleShortcuts'
  | 'prevPage'
  | 'nextPage'
  | 'prevPageA'
  | 'nextPageA'
  | 'firstPage'
  | 'lastPage'
  | 'toggleSidebar'
  | 'toggleSplitLink';

export interface ShortcutKeyInput {
  /** `event.key` en minúsculas. */
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

export interface ShortcutContext {
  pageMapOpen: boolean;
  paletteOpen: boolean;
  aboutOpen: boolean;
  shortcutsOpen: boolean;
  zoomMenuOpen: boolean;
  hasDocument: boolean;
  previewOpen: boolean;
  editing: boolean;
  hasSelection: boolean;
  hasClipboard: boolean;
  canUndo: boolean;
  canRedo: boolean;
  comparing: boolean;
  splitActive: boolean;
  /** El foco está en un campo de texto (`isEditableElement`). */
  targetEditable: boolean;
  /** El foco está en INPUT, TEXTAREA, SELECT, BUTTON o un elemento editable. */
  targetBlocksPlain: boolean;
}

export interface ShortcutResult {
  action: ShortcutAction;
  /**
   * `false` en copiar y pegar: solo se cancela el evento si la acción llega a hacer algo
   * (decide la página).
   */
  preventDefault: boolean;
}

const hit = (action: ShortcutAction, preventDefault = true): ShortcutResult => ({
  action,
  preventDefault,
});

/** Qué hace una pulsación de teclado, o `null` si el editor no la gestiona. */
export function resolveShortcut(
  input: ShortcutKeyInput,
  ctx: ShortcutContext,
): ShortcutResult | null {
  if (ctx.pageMapOpen) {
    return null; // el diálogo «Emparejar páginas» se queda con el teclado
  }
  const { key } = input;
  const primary = input.ctrlKey || input.metaKey;

  if (primary && !input.altKey && !input.shiftKey && key === 'k') {
    return !ctx.aboutOpen && !ctx.shortcutsOpen ? hit('togglePalette') : null;
  }
  if (ctx.paletteOpen) {
    return null;
  }
  return primary ? resolvePrimaryShortcut(input, ctx) : resolvePlainShortcut(input, ctx);
}

function resolvePrimaryShortcut(
  input: ShortcutKeyInput,
  ctx: ShortcutContext,
): ShortcutResult | null {
  const { key, shiftKey } = input;
  if (key === 's') {
    return hit('applyJson');
  }
  if (key === 'z' && !shiftKey) {
    return ctx.canUndo ? hit('undo') : null;
  }
  if (key === 'y' || (key === 'z' && shiftKey)) {
    return ctx.canRedo ? hit('redo') : null;
  }

  if (ctx.hasDocument && !ctx.targetEditable && !ctx.aboutOpen && !ctx.shortcutsOpen) {
    if (key === '+' || key === '=') return hit('zoomIn');
    if (key === '-' || key === '_') return hit('zoomOut');
    if (key === '0') return hit('zoomActual');
  }

  if (!ctx.hasDocument || ctx.targetEditable || ctx.previewOpen || ctx.editing) {
    return null;
  }
  switch (key) {
    case 'a':
      return hit('selectAll');
    case 'c':
      return hit('copy', false);
    case 'v':
      return ctx.hasClipboard ? hit('paste', false) : null;
    case 'd':
      return ctx.hasSelection ? hit('duplicate') : null;
    default:
      return null;
  }
}

function resolvePlainShortcut(
  input: ShortcutKeyInput,
  ctx: ShortcutContext,
): ShortcutResult | null {
  if (input.altKey || input.defaultPrevented) {
    return null;
  }
  const { key, shiftKey } = input;

  if (key === 'escape' && ctx.aboutOpen) return hit('closeAbout');
  if (key === 'escape' && ctx.zoomMenuOpen) return hit('closeZoomMenu');
  if (key === 'escape' && ctx.shortcutsOpen) return hit('closeShortcuts');

  if (ctx.targetBlocksPlain) {
    return null;
  }

  if (ctx.hasSelection && !ctx.previewOpen && !ctx.editing) {
    switch (key) {
      case 'escape':
        return hit('clearSelection');
      case 'delete':
      case 'backspace':
        return hit('deleteSelection');
      case 'arrowleft':
        return hit('nudgeLeft');
      case 'arrowright':
        return hit('nudgeRight');
      case 'arrowup':
        return hit('nudgeUp');
      case 'arrowdown':
        return hit('nudgeDown');
      default:
        break;
    }
  }

  if (key === ' ' && ctx.hasDocument && !ctx.previewOpen && !ctx.editing) {
    return hit('panReady');
  }
  if (input.code === 'Digit1' && shiftKey && ctx.hasDocument) {
    return hit('fitPage');
  }
  if (key === '?') return hit('toggleShortcuts');
  if (key === 'b') return hit('toggleSidebar');
  if (key === 'l') return ctx.splitActive ? hit('toggleSplitLink') : null;

  if (!ctx.hasDocument) {
    return null;
  }
  switch (key) {
    case 'arrowleft':
    case 'pageup':
      return hit(shiftKey && ctx.comparing ? 'prevPageA' : 'prevPage');
    case 'arrowright':
    case 'pagedown':
      return hit(shiftKey && ctx.comparing ? 'nextPageA' : 'nextPage');
    case 'home':
      return hit('firstPage');
    case 'end':
      return hit('lastPage');
    case '+':
    case '=':
      return hit('zoomIn');
    case '-':
    case '_':
      return hit('zoomOut');
    case '0':
      return hit('fitWidth');
    default:
      return null;
  }
}
