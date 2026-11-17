export type FontDropdownMode = 'preview' | 'edit';

export interface FontDropdownUiState {
  readonly open: boolean;
  readonly query: string;
}

export type FontDropdownState = Record<FontDropdownMode, FontDropdownUiState>;

export const CLOSED_FONT_DROPDOWN: FontDropdownUiState = { open: false, query: '' };

export function initialFontDropdownState(): FontDropdownState {
  return { preview: CLOSED_FONT_DROPDOWN, edit: CLOSED_FONT_DROPDOWN };
}

/** Abre o cierra el desplegable de `mode`; abrirlo cierra el del otro editor y vacía la búsqueda. */
export function toggleFontDropdownState(
  state: FontDropdownState,
  mode: FontDropdownMode,
): FontDropdownState {
  const nextOpen = !state[mode].open;
  const next: FontDropdownState = { ...state, [mode]: { open: nextOpen, query: '' } };
  if (nextOpen) {
    const other: FontDropdownMode = mode === 'preview' ? 'edit' : 'preview';
    if (state[other].open) {
      next[other] = CLOSED_FONT_DROPDOWN;
    }
  }
  return next;
}

/** Cierra el desplegable y borra la búsqueda; devuelve el mismo objeto si ya estaba cerrado y vacío. */
export function closeFontDropdownState(
  state: FontDropdownState,
  mode: FontDropdownMode,
): FontDropdownState {
  if (!state[mode].open && !state[mode].query) {
    return state;
  }
  return { ...state, [mode]: CLOSED_FONT_DROPDOWN };
}

export function setFontDropdownQuery(
  state: FontDropdownState,
  mode: FontDropdownMode,
  value: unknown,
): FontDropdownState {
  const query = typeof value === 'string' ? value : '';
  return { ...state, [mode]: { ...state[mode], query } };
}

/** Filtra por etiqueta, sin distinguir mayúsculas; con la búsqueda vacía devuelve una copia. */
export function filterFontOptions<T extends { readonly label: string }>(
  options: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...options];
  }
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}
