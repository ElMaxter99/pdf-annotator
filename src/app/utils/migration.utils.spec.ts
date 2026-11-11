import type { PageAnnotations, PageField } from '../models/annotation.model';
import {
  computeFieldStates,
  fieldKey,
  pairByName,
  pairingKey,
  summarizeStates,
} from './migration.utils';

const field = (mapField: string, x: number, y: number): PageField => ({
  mapField,
  x,
  y,
  fontSize: 12,
  color: '#000000',
  type: 'text',
});
const pages = (...fields: PageField[]): PageAnnotations[] => [{ num: 1, fields }];

describe('computeFieldStates', () => {
  it('marks identical fields as same and tolerates sub-point differences', () => {
    const states = computeFieldStates(pages(field('a', 10, 10)), pages(field('a', 10.3, 10)));
    expect(states.map((s) => s.status)).toEqual(['same']);
  });

  it('detects moved, new and missing fields', () => {
    const a = pages(field('a', 10, 10), field('b', 20, 20), field('c', 30, 30));
    const b = pages(field('a', 50, 10), field('b', 20, 20), field('d', 1, 1));
    const states = computeFieldStates(a, b);
    expect(states.map((s) => `${s.name}:${s.status}`)).toEqual([
      'a:moved',
      'b:same',
      'd:new',
      'c:missing',
    ]);
    expect(summarizeStates(states)).toEqual({ same: 1, moved: 1, renamed: 0, new: 1, missing: 1 });
  });

  it('uses links to treat a renamed field as the same one', () => {
    const states = computeFieldStates(
      pages(field('direccion', 10, 10)),
      pages(field('cliente.direccion', 10, 10)),
      [{ page: 1, b: 'cliente.direccion', a: 'direccion' }],
    );
    expect(states.map((s) => s.status)).toEqual(['renamed']);
  });

  it('does not report dismissed fields as missing', () => {
    const states = computeFieldStates(
      pages(field('total', 1, 1)),
      pages(),
      [],
      [fieldKey(1, 'total')],
    );
    expect(states).toEqual([]);
  });

  it('matches repeated names one by one', () => {
    const states = computeFieldStates(
      pages(field('x', 1, 1), field('x', 2, 2)),
      pages(field('x', 1, 1)),
    );
    expect(states.map((s) => s.status)).toEqual(['same', 'missing']);
  });
});

describe('pairing', () => {
  const file = (name: string) => new File([''], name);

  it('strips extension, case and version suffixes', () => {
    expect(pairingKey('Factura-0331-Nuevo.pdf')).toBe('factura-0331');
    expect(pairingKey('contrato_v2.pdf')).toBe('contrato');
    expect(pairingKey('albaran-0107.pdf')).toBe('albaran-0107');
  });

  it('pairs by exact name first and leaves the rest unpaired', () => {
    const items = [{ name: 'a.pdf' }, { name: 'b.pdf' }];
    const { paired, unpaired } = pairByName(items, [
      file('b.pdf'),
      file('a-nuevo.pdf'),
      file('z.pdf'),
    ]);
    expect(paired.map((p) => `${p.a.name}<-${p.b.name}`)).toEqual([
      'b.pdf<-b.pdf',
      'a.pdf<-a-nuevo.pdf',
    ]);
    expect(unpaired.map((f) => f.name)).toEqual(['z.pdf']);
  });
});
