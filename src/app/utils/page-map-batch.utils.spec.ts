import type { PageSuggestion } from './page-map.utils';
import { classifyForTable, judgeSuggestion, planTables } from './page-map-batch.utils';

const blob = {};
const suggestion = (pairs: (number | null)[]): PageSuggestion => ({
  map: { pairs, origins: pairs.map(() => 'auto' as const) },
  scores: pairs.map(() => 1),
});

describe('page-map-batch.utils', () => {
  it('classifies each PDF of the selection', () => {
    expect(classifyForTable({ bPdf: null }, 3, 4, false)).toBe('noB');
    expect(classifyForTable({ bPdf: blob, pageMap: suggestion([1]).map }, 3, 4, false)).toBe('hasMap');
    expect(classifyForTable({ bPdf: blob, pageMap: suggestion([1]).map }, 3, 4, true)).toBe('suggest');
    expect(classifyForTable({ bPdf: blob }, 3, 3, false)).toBe('same');
    expect(classifyForTable({ bPdf: blob }, 3, 4, false)).toBe('suggest');
  });

  it('counts the plan', () => {
    expect(planTables(['suggest', 'suggest', 'noB', 'same', 'hasMap'])).toEqual({
      total: 5,
      suggest: 2,
      noB: 1,
      hasMap: 1,
      same: 1,
    });
  });

  it('applies a table when every page of the shorter version matched', () => {
    expect(judgeSuggestion(3, 4, suggestion([null, 1, 2, 3]))).toEqual({
      verdict: 'applied',
      matched: 3,
      expected: 3,
    });
    expect(judgeSuggestion(4, 3, suggestion([1, 2, 4])).verdict).toBe('applied');
  });

  it('leaves the table for review when a page has no match', () => {
    expect(judgeSuggestion(3, 4, suggestion([null, 1, null, 3])).verdict).toBe('doubt');
    expect(judgeSuggestion(3, 4, suggestion([null, null, null, null])).verdict).toBe('doubt');
  });
});
