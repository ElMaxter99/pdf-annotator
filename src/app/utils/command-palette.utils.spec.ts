import {
  filterCommands,
  moveActive,
  normalizeSearch,
  pushRecent,
  suggestedCommands,
  type PaletteCommand,
} from './command-palette.utils';

const cmd = (id: string, label: string, extra: Partial<PaletteCommand> = {}): PaletteCommand => ({
  id,
  label,
  icon: '·',
  run: () => undefined,
  ...extra,
});

describe('command-palette.utils', () => {
  const commands = [
    cmd('undo', 'Deshacer'),
    cmd('copy', 'Poner plantilla A · copiar tal cual'),
    cmd('missing', 'Poner plantilla A · solo los que faltan'),
    cmd('theme', 'Cambiar a tema claro', { keywords: 'theme light' }),
  ];

  it('normaliza acentos y mayúsculas', () => {
    expect(normalizeSearch('  Català ')).toBe('catala');
  });

  it('exige todas las palabras, en cualquier orden', () => {
    expect(filterCommands(commands, 'A plantilla').map((c) => c.id)).toEqual(['copy', 'missing']);
    expect(filterCommands(commands, 'plantilla faltan').map((c) => c.id)).toEqual(['missing']);
  });

  it('busca también en las palabras clave y devuelve vacío sin consulta', () => {
    expect(filterCommands(commands, 'light').map((c) => c.id)).toEqual(['theme']);
    expect(filterCommands(commands, '  ')).toEqual([]);
    expect(filterCommands(commands, 'xyz')).toEqual([]);
  });

  it('pone primero las coincidencias al inicio de la etiqueta', () => {
    const list = [cmd('a', 'Ir a plantilla'), cmd('b', 'Plantilla nueva')];
    expect(filterCommands(list, 'plantilla').map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('sugiere recientes y luego los de siempre, sin repetir', () => {
    const picked = suggestedCommands(commands, ['theme', 'nope'], ['undo', 'theme', 'copy'], 3);
    expect(picked.map((c) => c.id)).toEqual(['theme', 'undo', 'copy']);
  });

  it('guarda como máximo cuatro recientes sin repetir', () => {
    expect(pushRecent(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'a', 'b', 'd']);
    expect(pushRecent(['a', 'b', 'c', 'd'], 'e')).toEqual(['e', 'a', 'b', 'c']);
  });

  it('salta las filas apagadas al moverse', () => {
    const list = [cmd('a', 'A'), cmd('b', 'B', { disabledReason: 'x' }), cmd('c', 'C')];
    expect(moveActive(list, 0, 1)).toBe(2);
    expect(moveActive(list, 0, -1)).toBe(2);
    expect(moveActive([cmd('a', 'A', { disabledReason: 'x' })], 0, 1)).toBe(-1);
  });
});
