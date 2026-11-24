import { defaultSortDir, flipDir, sortByCriterion } from './batch-sort.utils';

interface Row {
  id: string;
  at?: number;
  n?: number;
  i: number;
}
const c = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const rows: Row[] = [
  { id: 'factura-10', at: 10, n: 3, i: 0 },
  { id: 'factura-2', at: 30, n: 1, i: 1 },
  { id: 'sin-datos', i: 2 },
  { id: 'albaran', at: 20, n: 3, i: 3 },
];
const access = {
  name: (r: Row) => r.id,
  rank: (r: Row) => (r.at ? 1 : 0),
  value: (r: Row, key: string) => (key === 'change' ? r.at : r.n),
  index: (r: Row) => r.i,
};
const ids = (list: Row[]) => list.map((r) => r.id);

describe('sortByCriterion', () => {
  it('state keeps groups and orders by name inside each', () => {
    expect(ids(sortByCriterion(rows, { key: 'state', dir: 'asc' }, c, access))).toEqual([
      'sin-datos',
      'albaran',
      'factura-2',
      'factura-10',
    ]);
  });

  it('name is natural and respects the direction', () => {
    expect(ids(sortByCriterion(rows, { key: 'name', dir: 'asc' }, c, access))).toEqual([
      'albaran',
      'factura-2',
      'factura-10',
      'sin-datos',
    ]);
    expect(ids(sortByCriterion(rows, { key: 'name', dir: 'desc' }, c, access))[0]).toBe('sin-datos');
  });

  it('numeric criteria put rows without data last in both directions and break ties by name', () => {
    expect(ids(sortByCriterion(rows, { key: 'change', dir: 'desc' }, c, access))).toEqual([
      'factura-2',
      'albaran',
      'factura-10',
      'sin-datos',
    ]);
    expect(ids(sortByCriterion(rows, { key: 'change', dir: 'asc' }, c, access))).toEqual([
      'factura-10',
      'albaran',
      'factura-2',
      'sin-datos',
    ]);
    expect(ids(sortByCriterion(rows, { key: 'pages', dir: 'desc' }, c, access))).toEqual([
      'albaran',
      'factura-10',
      'factura-2',
      'sin-datos',
    ]);
  });

  it('upload follows the order of upload', () => {
    expect(ids(sortByCriterion(rows, { key: 'upload', dir: 'asc' }, c, access))).toEqual([
      'factura-10',
      'factura-2',
      'sin-datos',
      'albaran',
    ]);
  });

  it('has sensible default directions', () => {
    expect(defaultSortDir('change')).toBe('desc');
    expect(defaultSortDir('name')).toBe('asc');
    expect(flipDir('asc')).toBe('desc');
  });
});
