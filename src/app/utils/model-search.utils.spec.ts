import { highlight, matchesQuery } from './model-search.utils';

describe('model-search.utils', () => {
  it('matches every word, ignoring case and accents', () => {
    expect(matchesQuery('Claude Haiku 4.5 claude-haiku-4-5', 'haiku')).toBeTrue();
    expect(matchesQuery('Claude Haiku 4.5', 'CLAUDE haiku')).toBeTrue();
    expect(matchesQuery('Claude Sonnet', 'claude haiku')).toBeFalse();
    expect(matchesQuery('Automático', 'automatico')).toBeTrue();
    expect(matchesQuery('anything', '   ')).toBeTrue();
  });

  it('highlights the matching runs', () => {
    expect(highlight('Claude Haiku 4.5', 'haiku')).toEqual([
      { text: 'Claude ', hit: false },
      { text: 'Haiku', hit: true },
      { text: ' 4.5', hit: false },
    ]);
    expect(highlight('Automático', 'auto')).toEqual([
      { text: 'Auto', hit: true },
      { text: 'mático', hit: false },
    ]);
    expect(highlight('abc', '')).toEqual([{ text: 'abc', hit: false }]);
  });
});
