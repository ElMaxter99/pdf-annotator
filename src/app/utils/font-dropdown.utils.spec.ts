import {
  closeFontDropdownState,
  filterFontOptions,
  initialFontDropdownState,
  setFontDropdownQuery,
  toggleFontDropdownState,
} from './font-dropdown.utils';

describe('font-dropdown.utils', () => {
  it('empieza con los dos desplegables cerrados', () => {
    const state = initialFontDropdownState();
    expect(state.preview).toEqual({ open: false, query: '' });
    expect(state.edit).toEqual({ open: false, query: '' });
  });

  it('abrir uno cierra el del otro editor', () => {
    let state = toggleFontDropdownState(initialFontDropdownState(), 'preview');
    state = setFontDropdownQuery(state, 'preview', 'ari');
    state = toggleFontDropdownState(state, 'edit');
    expect(state.edit.open).toBeTrue();
    expect(state.preview).toEqual({ open: false, query: '' });
  });

  it('cerrar con el toggle vacía la búsqueda', () => {
    let state = toggleFontDropdownState(initialFontDropdownState(), 'edit');
    state = setFontDropdownQuery(state, 'edit', 'cou');
    state = toggleFontDropdownState(state, 'edit');
    expect(state.edit).toEqual({ open: false, query: '' });
  });

  it('closeFontDropdownState devuelve el mismo estado si ya estaba cerrado', () => {
    const state = initialFontDropdownState();
    expect(closeFontDropdownState(state, 'preview')).toBe(state);
  });

  it('closeFontDropdownState cierra y borra la búsqueda', () => {
    let state = toggleFontDropdownState(initialFontDropdownState(), 'preview');
    state = setFontDropdownQuery(state, 'preview', 'x');
    expect(closeFontDropdownState(state, 'preview').preview).toEqual({ open: false, query: '' });
  });

  it('una búsqueda que no es texto queda vacía', () => {
    const state = setFontDropdownQuery(initialFontDropdownState(), 'edit', 42);
    expect(state.edit.query).toBe('');
  });

  it('filterFontOptions ignora mayúsculas y espacios', () => {
    const options = [{ label: 'Arial' }, { label: 'Courier New' }, { label: 'Times' }];
    expect(filterFontOptions(options, '  CO ').map((o) => o.label)).toEqual(['Courier New']);
    expect(filterFontOptions(options, '')).toEqual(options);
    expect(filterFontOptions(options, '')).not.toBe(options);
    expect(filterFontOptions(options, 'zzz')).toEqual([]);
  });
});
